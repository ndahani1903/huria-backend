import { Request, Response } from "express";
import { ProductService } from "./product.service";
import { AuthRequest } from "../../middleware/auth.middleware";

export class ProductController {
  static async create(req: AuthRequest, res: Response) {
     try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
  
    const product = await ProductService.create(req.user.id, req.body);

     // ✅ Log the response to verify images are included
      console.log("Product created response - images:", product.images?.length || 0);
      
      res.json(product);
    } catch (error: any) {
      console.error("Create product error:", error);
      res.status(500).json({ error: error.message });
    }
  }

   static async getAll(req: Request, res: Response) {
    try {
      const products = await ProductService.getAll();
      
      // ✅ Verify images are being sent
      console.log("Sending products with images:", products.map(p => ({ 
        id: p.id, 
        name: p.name, 
        imagesCount: p.images?.length || 0 
      })));

      res.json(products);
    } catch (error: any) {
      console.error("Get products error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const product = await ProductService.getById(id);
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // ✅ Verify images are being sent
      console.log("Sending product by ID:", product.name, "Images count:", product.images?.length || 0);

      res.json(product);
    } catch (error: any) {
      console.error("Get product error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const product = await ProductService.update(id, req.body);
      console.log("Updated product - images count:", product.images?.length);
    res.json(product);
    } catch (error: any) {
      console.error("Update product error:", error);
      res.status(500).json({ error: error.message });
    }
  }
}