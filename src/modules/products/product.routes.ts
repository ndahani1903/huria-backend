import { Router } from 'express';
import { ProductController } from './product.controller';
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

router.post("/", authMiddleware, ProductController.create);
router.get("/", ProductController.getAll);
router.get("/:id", ProductController.getById);  // ✅ Add this route
router.put("/:id", authMiddleware, ProductController.update);

export default router;