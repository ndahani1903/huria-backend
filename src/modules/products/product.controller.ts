import { Request, Response } from "express";
import { ProductService } from "./product.service";
import { AuthRequest } from "../../middleware/auth.middleware";

export class ProductController {
  static async create(req: AuthRequest, res: Response) {
     try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
  
    const { name, price, stock, image, description } = req.body;

    const product = await ProductService.create(
       req.user.id,
        name,
        price,
        stock || 0,
        image,
        description
      );
    res.json(product);
  } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getAll(req: Request, res: Response) {
    const products = await ProductService.getAll();
    res.json(products);
  }
}