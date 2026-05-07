import { Request, Response } from "express";
import { ReviewService } from "./review.service";
import { AuthRequest } from "../../middleware/auth.middleware";

export class ReviewController {
  static async create(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get uploaded images from multer
      const files = (req as any).files as Express.Multer.File[];
      const imageUrls = files?.map((file: any) => file.path) || [];

     // ✅ Ensure rating is converted properly
      const reviewData = {
        productId: req.body.productId,
        rating: parseInt(req.body.rating), // Convert to integer
        comment: req.body.comment
      };

      // Validate rating
      if (isNaN(reviewData.rating) || reviewData.rating < 1 || reviewData.rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5" });
      }

      const review = await ReviewService.create(
        req.user.id,
        "Customer",
        reviewData,
        imageUrls // ✅ Pass images to service
      );
      
      res.status(201).json(review);
    } catch (error: any) {
      console.error("Create review error:", error);

     // Handle duplicate review error
      if (error.message === "You have already reviewed this product") {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: error.message });
    }
  }

 static async getByProduct(req: Request, res: Response) {
    try {
      const productId = req.params.productId as string;
      const reviews = await ReviewService.getByProduct(productId);
      res.json(reviews);
    } catch (error: any) {
      console.error("Get reviews error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getUserReviews(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const reviews = await ReviewService.getUserReviews(req.user.id);
      res.json(reviews);
    } catch (error: any) {
      console.error("Get user reviews error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const id = req.params.id as string;
      const result = await ReviewService.delete(id, req.user.id);
      res.json(result);
    } catch (error: any) {
      console.error("Delete review error:", error);
      res.status(500).json({ error: error.message });
    }
  }
}