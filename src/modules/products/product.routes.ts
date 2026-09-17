// src/modules/products/product.routes.ts

import { Router, Request, Response } from "express";
import { ProductController } from "./product.controller";
import { DailyDealsController } from "./dailyDeals.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { prisma } from "../../config/db";
import multer from "multer";

const router = Router();

/* Merchant */
router.get(
  "/my/list",
  authMiddleware,
  requireRole("merchant"),
  ProductController.getMine
);

const upload = multer({ dest: "uploads/" });

router.post(
  "/",
  authMiddleware,
  requireRole("merchant"),
  upload.array("images", 10),
  ProductController.create
);

/*
 * Admin: Batch discount update
 */
router.post(
  "/admin/products/batch-discount",
  authMiddleware,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const {
        productIds,
        discountEligible,
        newUserDiscount
      } = req.body;

      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({
          error: "productIds must be a non-empty array"
        });
      }

      await prisma.product.updateMany({
        where: {
          id: {
            in: productIds
          }
        },
        data: {
          discountEligible,
          newUserDiscount
        }
      });

      return res.json({
        success: true,
        count: productIds.length
      });
    } catch (error: any) {
      console.error(
        "Batch discount update error:",
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }
);

/*
 * Restaurant menu item with modifiers
 */
router.post(
  "/restaurant/menu",
  authMiddleware,
  requireRole("merchant"),
  upload.array("images", 10),
  ProductController.createRestaurantMenuItem
);

/*
 * Supermarket product with barcode
 */
router.post(
  "/supermarket/product",
  authMiddleware,
  requireRole("merchant"),
  upload.array("images", 10),
  ProductController.createSupermarketProduct
);

/*
 * Intelligent search with learning
 */
router.get(
  "/search/intelligent",
  ProductController.intelligentSearch
);

/*
 * Get trending searches
 */
router.get(
  "/search/trending",
  ProductController.getTrendingSearches
);

/*
 * Get search suggestions
 */
router.get(
  "/search/suggestions",
  ProductController.getSearchSuggestions
);

/*
 * Daily deals
 */
router.get(
  "/deals/today",
  DailyDealsController.getTodayDeals
);

router.get(
  "/deals/date/:date",
  DailyDealsController.getDealsByDate
);

router.get(
  "/deals/monthly",
  DailyDealsController.getMonthlyDeals
);

/*
 * Track product view
 */
router.post(
  "/:id/track-view",
  authMiddleware,
  ProductController.trackProductView
);

/*
 * Track add to cart
 */
router.post(
  "/:id/track-cart",
  authMiddleware,
  ProductController.trackAddToCart
);

/*
 * Personalized recommendations
 */
router.get(
  "/recommendations/personalized",
  authMiddleware,
  ProductController.getPersonalizedRecommendations
);

/*
 * Update product
 */
router.put(
  "/:id",
  authMiddleware,
  requireRole("merchant", "admin"),
  ProductController.update
);

/*
 * PATCH for partial updates
 */
router.patch(
  "/:id",
  authMiddleware,
  requireRole("merchant", "admin"),
  ProductController.update
);

/*
 * Delete product
 */
router.delete(
  "/:id",
  authMiddleware,
  requireRole("merchant", "admin"),
  ProductController.delete
);

/*
 * Toggle product
 */
router.patch(
  "/:id/toggle",
  authMiddleware,
  requireRole("merchant"),
  ProductController.toggle
);

/*
 * Update stock
 */
router.patch(
  "/:id/stock",
  authMiddleware,
  requireRole("merchant"),
  ProductController.stock
);

/*
 * Admin only - Flash sale management
 */
router.patch(
  "/:id/flash-sale",
  authMiddleware,
  requireRole("admin"),
  ProductController.setFlashSale
);

/*
 * Merchant - Deal management
 */
router.patch(
  "/:id/deal",
  authMiddleware,
  requireRole("merchant"),
  ProductController.updateDeal
);

/*
 * Public routes for filtered products
 */
router.get(
  "/deals",
  ProductController.getActiveDeals
);

router.get(
  "/flash-sales",
  ProductController.getActiveFlashSales
);

router.get(
  "/gender/:gender",
  ProductController.getByGender
);

router.get(
  "/gifts",
  ProductController.getGiftProducts
);

router.get(
  "/high-rated",
  ProductController.getHighRated
);

/*
 * Public
 */
router.get(
  "/",
  ProductController.getAll
);

router.get(
  "/:id",
  ProductController.getById
);

export default router;