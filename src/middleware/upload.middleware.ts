import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary";


// Dynamic folder based on file fieldname
const getFolder = (fieldname: string) => {
  if (fieldname === 'licenseCardImage' || fieldname === 'nidaCardImage') {
    return 'huria-kyc/documents';
  }
  if (fieldname === 'selfieImage' || fieldname === 'passportPhoto') {
    return 'huria-kyc/selfies';
  }
  if (fieldname === 'businessLicenseImage') {
    return 'huria-kyc/business';
  }
  if (fieldname === 'logoImage') {
    return 'huria-kyc/logos';
  }
  return 'huria-kyc/misc';
};

// ✅ USE CLOUDINARY (not local storage)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => ({
    folder: getFolder(file.fieldname),
    format: file.mimetype.split("/")[1],
    public_id: Date.now() + "-" + file.originalname.replace(/\s/g, '_'),
    transformation: [
      { width: 1024, height: 1024, crop: "limit" },
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


