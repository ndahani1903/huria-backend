import { Request, Response } from 'express';
import { uploadToCloudinary } from '../services/upload.service';

export class UploadController {
  static async uploadImage(req: any, res: Response) {
    try {
        console.log("📸 Upload endpoint hit!");
      console.log("Request body:", req.body);
      const { image } = req.body;
      
      if (!image) {
        return res.status(400).json({ error: 'No image provided' });
      }
      
      // Upload to Cloudinary
      const imageUrl = await uploadToCloudinary(image);
      
        res.json({ 
        success: true, 
        message: "Upload received",
        imageUrl: image.substring(0, 100) + "..." });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}