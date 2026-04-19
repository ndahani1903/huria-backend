import express from 'express';
import cors from 'cors';
import paymentRoutes from './modules/payments/payment.routes';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/payments', paymentRoutes);

// Health check
app.get('/', (req, res) => {
  res.send('HURIA API RUNNING 🚀');
});
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend working ✅' });
});
export default app;