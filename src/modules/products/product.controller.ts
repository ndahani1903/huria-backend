import { Request, Response } from "express";
import { ProductService } from "./product.service";
import { AuthRequest } from "../../middleware/auth.middleware";

export class ProductController {
  static async create(req: AuthRequest, res: Response) {
  try {
    let imageUrls: string[] = [];

// 1. multer uploads (old system)
const files = req.files as Express.Multer.File[];
if (files && files.length > 0) {
  imageUrls = files.map(file => `uploads/${file.filename}`);
}

// 2. Cloudinary URLs (new system)
if (req.body.images) {
  try {
    const parsed =
      typeof req.body.images === "string"
        ? JSON.parse(req.body.images)
        : req.body.images;

    imageUrls = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    imageUrls = Array.isArray(req.body.images)
      ? req.body.images
      : [req.body.images];
  }
}

    const payload = {
      ...req.body,
      images: imageUrls
    };

    const product = await ProductService.create(
      req.user!.id,
      payload
    );

    res.json(product);

  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
}

  static async getAll(req: Request, res: Response) {
    const products = await ProductService.getAll(req.query);
    res.json(products);
  }

  static async getById(req: Request, res: Response) {
    const product = await ProductService.getById(req.params.id as string);

    if (!product) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(product);
  }

  static async getMine(req: AuthRequest, res: Response) {
     try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const products = await ProductService.getMyProducts(req.user.id);
    res.json(products);
  } catch (error: any) {
    console.error("Get my products error:", error);
    res.status(500).json({ error: error.message });
  }
}

  static async update(req: AuthRequest, res: Response) {
    try {
      const product = await ProductService.update(
        req.user!.id,
        req.params.id as string,
        req.body
      );

      res.json(product);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      await ProductService.remove(req.user!.id, req.params.id as string);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }

  static async toggle(req: AuthRequest, res: Response) {
    const product = await ProductService.toggle(req.user!.id, req.params.id as string);
    res.json(product);
  }

  static async stock(req: AuthRequest, res: Response) {
    const product = await ProductService.updateStock(
      req.user!.id,
      req.params.id as string,
      req.body.stock
    );

    res.json(product);
  }
}