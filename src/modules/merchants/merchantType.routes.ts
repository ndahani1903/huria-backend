// src/modules/merchants/merchantType.routes.ts
import { Router } from "express";
import { MerchantTypeController } from "./merchantType.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

const router = Router();

// Customer-facing routes (public or with auth)
router.get("/nearby", MerchantTypeController.getNearbyMerchants);
router.get("/:id/details", MerchantTypeController.getMerchantDetails);

// Merchant type info (for dashboard routing)
router.get("/type", 
  authMiddleware, 
  requireRole("merchant"), 
  MerchantTypeController.getMerchantType
);

// Merchant configuration
router.get("/config", 
  authMiddleware, 
  requireRole("merchant"), 
  MerchantTypeController.getMerchantConfig
);

// Restaurant-specific routes
router.put("/restaurant/settings", 
  authMiddleware, 
  requireRole("merchant"), 
  MerchantTypeController.updateRestaurantSettings
);

router.put("/restaurant/preparation-time", 
  authMiddleware, 
  requireRole("merchant"), 
  MerchantTypeController.updatePreparationTime
);

router.patch("/restaurant/toggle-accepting", 
  authMiddleware, 
  requireRole("merchant"), 
  MerchantTypeController.toggleOrderAcceptance
);

// Supermarket-specific routes
router.put("/supermarket/settings", 
  authMiddleware, 
  requireRole("merchant"), 
  MerchantTypeController.updateSupermarketSettings
);

router.get("/supermarket/low-stock", 
  authMiddleware, 
  requireRole("merchant"), 
  MerchantTypeController.getLowStockAlerts
);

router.get("/supermarket/expiring", 
  authMiddleware, 
  requireRole("merchant"), 
  MerchantTypeController.getExpiringProducts
);

router.get("/supermarket/product/:barcode", 
  authMiddleware, 
  requireRole("merchant"), 
  MerchantTypeController.getProductByBarcode
);

router.patch("/supermarket/product/:productId/stock", 
  authMiddleware, 
  requireRole("merchant"), 
  MerchantTypeController.updateStock
);

// Operating hours routes
router.get("/hours", 
  authMiddleware, 
  requireRole("merchant"), 
  MerchantTypeController.getOperatingHours
);

router.put("/hours", 
  authMiddleware, 
  requireRole("merchant"), 
  MerchantTypeController.updateOperatingHours
);

// Image management routes
router.get("/images", 
  authMiddleware, 
  requireRole("merchant"), 
  MerchantTypeController.getMerchantImages
);

router.put("/images/cover", 
  authMiddleware, 
  requireRole("merchant"), 
  MerchantTypeController.updateCoverImage
);

router.put("/images/logo", 
  authMiddleware, 
  requireRole("merchant"), 
  MerchantTypeController.updateLogo
);

// Store review routes (customer facing)
router.post("/:merchantId/review", 
  authMiddleware, 
  MerchantTypeController.addStoreReview
);

router.get("/:merchantId/reviews", 
  MerchantTypeController.getStoreReviews
);

export default router;