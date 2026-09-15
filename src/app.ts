import express from 'express';
import cors from 'cors';
import paymentRoutes from './modules/payments/payment.routes';
import path from "path";
import cloudinary from './config/cloudinary';
import { KYCService } from './services/kyc.service';
 
const app = express();

export const setupCronJobs = () => {
  // Run every day at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('🔄 Running KYC cleanup job...');
    await KYCService.freezeUnverifiedUsers();
  });
};

//app.use(cors({
  //origin: 'https://a7bc-196-249-100-167.ngrok-free.app ', 
  //credentials: true
//}));

app.use(cors({
  origin: true, // This allows any origin
  credentials: true
}));



app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/api/payments', paymentRoutes);
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
//app.use("/uploads", express.static("uploads"));


// Optional: Expose manual cleanup endpoint for testing (admin only)
//app.post('/api/admin/cleanup', authMiddleware, requireRole('admin'), 
app.post('/api/admin/cleanup', async (req, res) => {
  try {
    const result = await CleanupService.manualCleanup();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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