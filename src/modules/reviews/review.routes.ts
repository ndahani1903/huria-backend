// review.routes.ts
import { Router } from "express";
import { ReviewController } from "./review.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { upload } from "../../middleware/upload.middleware"; // ✅ Add multer

const router = Router();

// Public routes
router.get("/product/:productId", ReviewController.getByProduct);

// Protected routes (require authentication)
router.post(
  "/", 
  authMiddleware, 
  upload.array('reviewImages', 5), // ✅ Allow up to 5 images per review
  (req, res, next) => {
    console.log("🔵 Files received in route:", req.files);
    console.log("🔵 Body:", req.body);
    next();
  },
  ReviewController.create
);

router.get("/my-reviews", authMiddleware, ReviewController.getUserReviews);

router.delete("/:id", authMiddleware, ReviewController.delete);

export default router;