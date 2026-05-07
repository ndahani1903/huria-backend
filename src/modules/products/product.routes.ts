import { Router } from "express";
//import { upload } from "../../middleware/upload.middleware";
import { ProductController } from "./product.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import multer from "multer";


const router = Router();

/* merchant */
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

router.put(
  "/:id",
  authMiddleware,
  requireRole("merchant"),
  ProductController.update
);

router.delete(
  "/:id",
  authMiddleware,
  requireRole("merchant", "admin"),
  ProductController.delete
);

router.patch(
  "/:id/toggle",
  authMiddleware,
  requireRole("merchant"),
  ProductController.toggle
);

router.patch(
  "/:id/stock",
  authMiddleware,
  requireRole("merchant"),
  ProductController.stock
);


/* public */
router.get("/", ProductController.getAll);
router.get("/:id", ProductController.getById);


export default router;