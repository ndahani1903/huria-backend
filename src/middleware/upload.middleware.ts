import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary";

// ✅ USE CLOUDINARY (not local storage)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => ({
    folder: "huria-reviews",
    format: file.mimetype.split("/")[1],
    public_id: Date.now() + "-" + file.originalname,
    transformation: [
      { width: 800, height: 800, crop: "limit" },
      { quality: "auto" }
    ]
  })
});

export const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});


