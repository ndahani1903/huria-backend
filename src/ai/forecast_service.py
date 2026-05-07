import os
from flask import Flask, request, jsonify
import pandas as pd
import numpy as np
from prophet import Prophet
from datetime import datetime, timedelta
import redis
import json
import pickle
from sqlalchemy import create_engine, text
import warnings
warnings.filterwarnings('ignore')

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)

class DemandForecastService:
    def __init__(self):
        self.redis_client = redis.Redis(
            host=os.getenv('REDIS_HOST', 'localhost'),
            port=int(os.getenv('REDIS_PORT', 6379)),
            decode_responses=True,
            password=os.getenv('REDIS_PASSWORD', None)
        )
        
        # PostgreSQL connection
        database_url = os.getenv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/huria')
        self.engine = create_engine(database_url)
        
        self.models = {}
        self.models_dir = os.path.join(os.path.dirname(__file__), 'saved_models')
        
        # Create models directory if it doesn't exist
        os.makedirs(self.models_dir, exist_ok=True)
        
        # Tanzania holidays
        self.tz_holidays = pd.DataFrame({
            'holiday': 'tz_holiday',
            'ds': pd.to_datetime([
                '2024-01-01', '2024-04-07', '2024-04-26', 
                '2024-05-01', '2024-07-07', '2024-12-09', 
                '2024-12-25', '2025-01-01', '2025-04-07'
            ]),
            'lower_window': -1,
            'upper_window': 1
        })
        
    def train_merchant_model(self, merchantId: str):
        """Train Prophet model for specific merchant"""
        try:
            # Fetch historical order data - Using "Order" table (capital O)
            query = text("""
                SELECT 
                    DATE("createdAt") as ds,
                    COUNT(*) as y
                FROM "Order"
                WHERE "merchantId" = :merchantId
                AND status = 'completed'
                AND "createdAt" >= NOW() - INTERVAL '90 days'
                GROUP BY DATE("createdAt")
                ORDER BY ds
            """)
            
            df = pd.read_sql(query, self.engine, params={"merchantId": merchantId})
            
            if len(df) < 30:  # Need minimum 30 days of data
                print(f"⚠️ Merchant {merchantId} has only {len(df)} days of data")
                return None
                
            # Create and train model
            model = Prophet(
                yearly_seasonality=True,
                weekly_seasonality=True,
                daily_seasonality=True,
                changepoint_prior_scale=0.05,
                seasonality_prior_scale=10.0,
                holidays_prior_scale=10.0,
                seasonality_mode='multiplicative'
            )
            
            # Add special regressors for promotions
            df['is_weekend'] = pd.to_datetime(df['ds']).dt.dayofweek.isin([5, 6]).astype(int)
            model.add_regressor('is_weekend')
            
            # Add holiday effects
            model.holidays = self.tz_holidays
            
            model.fit(df)
            
            # Save model
            model_path = os.path.join(self.models_dir, f'merchant_{merchantId}.pkl')
            with open(model_path, 'wb') as f:
                pickle.dump(model, f)
            
            # Cache in Redis
            self.redis_client.setex(f'forecast:model:{merchantId}', 86400, model_path)
            
            print(f"✅ Trained model for merchant {merchantId}")
            return model
            
        except Exception as e:
            print(f"❌ Error training model for {merchantId}: {e}")
            return None
    
    def predict_demand(self, merchantId: str, days: int = 7):
        """Predict demand for next N days"""
        try:
            # Load model
            model_path = self.redis_client.get(f'forecast:model:{merchantId}')
            
            if not model_path:
                model = self.train_merchant_model(merchantId)
                if not model:
                    return None
            else:
                with open(model_path, 'rb') as f:
                    model = pickle.load(f)
            
            # Create future dataframe
            future = model.make_future_dataframe(periods=days, include_history=False)
            
            # Add regressors
            future['is_weekend'] = pd.to_datetime(future['ds']).dt.dayofweek.isin([5, 6]).astype(int)
            
            # Make prediction
            forecast = model.predict(future)
            
            # Format results
            predictions = []
            for i, row in forecast.iterrows():
                predictions.append({
                    'date': row['ds'].strftime('%Y-%m-%d'),
                    'predicted_orders': max(0, int(row['yhat'])),
                    'predicted_lower': max(0, int(row['yhat_lower'])),
                    'predicted_upper': max(0, int(row['yhat_upper'])),
                    'trend': float(row['trend'])
                })
            
            # Cache predictions
            cache_key = f'forecast:merchant:{merchantId}:{days}d'
            self.redis_client.setex(cache_key, 3600, json.dumps(predictions))
            
            # Generate restock recommendations
            restock_recommendations = self.generate_restock_recommendations(
                merchantId, predictions
            )
            
            return {
                'merchantId': merchantId,
                'predictions': predictions,
                'restock_recommendations': restock_recommendations,
                'next_restock_date': predictions[0]['date'] if predictions else None,
                'total_predicted_orders': sum(p['predicted_orders'] for p in predictions)
            }
            
        except Exception as e:
            print(f"❌ Error predicting demand for {merchantId}: {e}")
            return None
    
    def generate_restock_recommendations(self, merchantId: str, predictions: list):
        """Generate AI-powered restock recommendations"""
        try:
            # Get current inventory - Using "Product" table (capital P)
            query = text("""
                SELECT 
                    id, name, stock, reorder_level, reorder_quantity
                FROM "Product"
                WHERE "merchantId" = :merchantId
                AND is_active = true
            """)
            
            products = pd.read_sql(query, self.engine, params={"merchantId": merchantId})
            recommendations = []
            
            for _, product in products.iterrows():
                # Calculate days until out of stock
                avg_daily_sales = self.get_avg_daily_sales(merchantId, product['id'])
                
                if avg_daily_sales > 0:
                    days_until_out = product['stock'] / avg_daily_sales
                    reorder_level = product['reorder_level'] or 10
                    
                    if days_until_out <= 3 or product['stock'] <= reorder_level:
                        urgency = 'critical' if days_until_out <= 1 else 'high'
                        recommendations.append({
                            'productId': product['id'],
                            'product_name': product['name'],
                            'current_stock': product['stock'],
                            'reorder_level': reorder_level,
                            'reorder_quantity': product['reorder_quantity'],
                            'urgency': urgency,
                            'days_until_out': round(days_until_out, 1),
                            'suggested_order': product['reorder_quantity'] or int(avg_daily_sales * 7)
                        })
            
            # Sort by urgency
            recommendations.sort(key=lambda x: 0 if x['urgency'] == 'critical' else 1)
            return recommendations
            
        except Exception as e:
            print(f"❌ Error generating restock recommendations: {e}")
            return []
    
    def get_avg_daily_sales(self, merchantId: str, productId: str) -> float:
        """Calculate average daily sales for a product"""
        try:
            query = text("""
                SELECT 
                    COALESCE(AVG(daily_quantity), 0) as avg_daily
                FROM (
                    SELECT 
                        DATE(o."createdAt") as sale_date,
                        SUM(oi.quantity) as daily_quantity
                    FROM "OrderItem" oi
                    JOIN "Order" o ON o.id = oi.orderId
                    WHERE o."merchantId" = :merchantId
                    AND oi.productId = :productId
                    AND o.status = 'completed'
                    AND o."createdAt" >= NOW() - INTERVAL '30 days'
                    GROUP BY DATE(o."createdAt")
                ) daily_sales
            """)
            
            result = pd.read_sql(query, self.engine, params={
                "merchantId": merchantId,
                "productId": productId
            })
            
            return float(result['avg_daily'].iloc[0]) if not result.empty else 0
            
        except Exception as e:
            print(f"❌ Error getting avg daily sales: {e}")
            return 0
    
    def predict_optimal_pricing(self, merchantId: str, productId: str):
        """Predict optimal price point for maximum revenue"""
        try:
            query = text("""
                SELECT 
                    oi.price,
                    COUNT(*) as orders,
                    SUM(oi.quantity) as total_quantity
                FROM "OrderItem" oi
                JOIN "Order" o ON o.id = oi.orderId
                WHERE o."merchantId" = :merchantId
                AND oi.productId = :productId
                AND o.status = 'completed'
                GROUP BY oi.price
                ORDER BY oi.price
            """)
            
            price_data = pd.read_sql(query, self.engine, params={
                "merchantId": merchantId,
                "productId": productId
            })
            
            if len(price_data) < 3:
                return None
                
            # Calculate revenue
            price_data['revenue'] = price_data['price'] * price_data['total_quantity']
            
            # Find optimal price
            optimal_idx = price_data['revenue'].idxmax()
            optimal_price = price_data.loc[optimal_idx, 'price']
            current_price = price_data['price'].iloc[-1]
            max_revenue = price_data['revenue'].max()
            current_revenue = price_data['revenue'].iloc[-1]
            
            potential_increase = ((max_revenue - current_revenue) / current_revenue * 100) if current_revenue > 0 else 0
            
            return {
                'productId': productId,
                'current_price': float(current_price),
                'optimal_price': float(optimal_price),
                'potential_revenue_increase': round(potential_increase, 2),
                'price_elasticity': 'elastic' if potential_increase > 10 else 'inelastic'
            }
            
        except Exception as e:
            print(f"❌ Error predicting pricing: {e}")
            return None
    
    def batch_forecast_all_merchants(self):
        """Run forecast for all active merchants"""
        try:
            # Using "Merchant" table (capital M) - verified field may not exist
            # If verified doesn't exist, just get all merchants
            merchants = pd.read_sql(
                'SELECT id FROM "Merchant" WHERE true',
                self.engine
            )
            
            print(f"📊 Found {len(merchants)} merchants to process")
            results = []
            
            for _, merchant in merchants.iterrows():
                try:
                    merchantId = merchant['id']
                    forecast = self.predict_demand(merchantId, days=7)
                    if forecast:
                        results.append(forecast)
                        print(f"✅ Forecast completed for merchant {merchantId[:8]}...")
                        
                        # Send notifications for critical restocks
                        for rec in forecast.get('restock_recommendations', []):
                            if rec['urgency'] == 'critical':
                                self.send_restock_alert(merchantId, rec)
                except Exception as e:
                    print(f"❌ Error forecasting merchant: {e}")
                    continue
            
            print(f"✅ Batch forecast completed: {len(results)} merchants")
            
            # Store last run info in Redis
            self.redis_client.set('forecast:last_run', datetime.now().isoformat())
            self.redis_client.set('forecast:last_count', len(results))
            
            return results
            
        except Exception as e:
            print(f"❌ Batch forecast error: {e}")
            return []
    
    def send_restock_alert(self, merchantId: str, recommendation: dict):
        """Send AI restock recommendation to merchant"""
        try:
            alert = {
                'merchantId': merchantId,
                'productId': recommendation['productId'],
                'product_name': recommendation['product_name'],
                'type': 'restock_alert',
                'urgency': recommendation['urgency'],
                'message': f"⚠️ {recommendation['urgency'].upper()}: {recommendation['product_name']} will run out in {recommendation['days_until_out']} days. Order {recommendation['suggested_order']} units now.",
                'data': recommendation,
                'createdAt': datetime.now().isoformat()
            }
            
            # Store in Redis for API consumption
            self.redis_client.lpush(f'alerts:merchant:{merchantId}', json.dumps(alert))
            self.redis_client.expire(f'alerts:merchant:{merchantId}', 604800)  # 7 days
            
            print(f"📢 Sent restock alert for {recommendation['product_name']}")
            
        except Exception as e:
            print(f"❌ Error sending restock alert: {e}")

# Singleton instance
forecast_service = DemandForecastService()
@app.route("/")
def home():
    return jsonify({
        "status": "running",
        "service": "AI Forecast Service"
    })

@app.route("/predict/<merchantId>", methods=["GET"])
def predict(merchantId):
    try:
        days = request.args.get("days", 7)

        result = forecast_service.predict_demand(
            merchantId,
            int(days)
        )

        if not result:
            return jsonify({
                "error": "Prediction failed"
            }), 400

        return jsonify(result)

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500

@app.route("/retrain/<merchantId>", methods=["POST"])
def retrain(merchantId):
    try:
        model = forecast_service.train_merchant_model(merchantId)

        if not model:
            return jsonify({
                "error": "Training failed"
            }), 400

        return jsonify({
            "message": "Model retrained successfully"
        })

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500

@app.route("/batch-forecast", methods=["POST"])
def batch_forecast():
    try:
        results = forecast_service.batch_forecast_all_merchants()

        return jsonify({
            "processed": len(results),
            "success": True
        })

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


def run_batch_forecast():
    """Wrapper function for batch forecast"""
    print(f"🔄 Running batch forecast at {datetime.now()}")
    forecast_service.batch_forecast_all_merchants()


# For running as standalone script
if __name__ == "__main__":
    import threading
    import schedule
    import time

    print("🚀 AI Forecast Service Started")

    # Run once immediately
    run_batch_forecast()

    # Scheduler thread
    def scheduler_loop():
        schedule.every(1).hours.do(run_batch_forecast)

        while True:
            schedule.run_pending()
            time.sleep(60)

    scheduler_thread = threading.Thread(target=scheduler_loop)
    scheduler_thread.daemon = True
    scheduler_thread.start()

    # Start Flask server
    port = int(os.environ.get("PORT", 8000))

    app.run(
        host="0.0.0.0",
        port=port
    )