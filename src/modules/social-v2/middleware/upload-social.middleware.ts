// src/modules/social-v2/middleware/upload-social.middleware.ts
import multer from "multer";
import path from "path";
import { SOCIAL } from "../social.constants";

const storage = multer.diskStorage({
  destination: "uploads/social/",
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `social-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req: any, file: any, cb: any) => {
  const isImage = SOCIAL.UPLOAD.ALLOWED_IMAGES.includes(file.mimetype);
  const isVideo = SOCIAL.UPLOAD.ALLOWED_VIDEOS.includes(file.mimetype);

  if (isImage || isVideo) {
    cb(null, true);
  } else {
    cb(new Error("File type not supported. Only images and videos are allowed."));
  }
};

export const uploadSocial = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: SOCIAL.UPLOAD.MAX_VIDEO_SIZE,
    files: 10,
  },
});

// Specialized uploads
export const uploadStory = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: SOCIAL.UPLOAD.MAX_VIDEO_SIZE,
    files: 1,
  },
});

export const uploadReel = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: SOCIAL.UPLOAD.MAX_VIDEO_SIZE,
    files: 1,
  },
});

export const uploadPostMedia = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: SOCIAL.UPLOAD.MAX_IMAGE_SIZE,
    files: SOCIAL.UPLOAD.MAX_MEDIA_PER_POST,
  },
}); 