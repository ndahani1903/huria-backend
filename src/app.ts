import express from 'express';
import cors from 'cors';
import paymentRoutes from './modules/payments/payment.routes';
import path from "path";
import cloudinary from './config/cloudinary';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/api/payments', paymentRoutes);
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
//app.use("/uploads", express.static("uploads"));

cloudinary.api.ping((error, result) => {
  if (error) {
    console.error('❌ Cloudinary connection failed:', error);
  } else {
    console.log('✅ Cloudinary connected:', result);
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('HURIA API RUNNING 🚀');
});
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend working ✅' });
});
app.get('/api/investor', (req, res) => {
  res.json({ message: 'Backend working ✅' });
});
export default app;