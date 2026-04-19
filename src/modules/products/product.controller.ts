import { Request, Response } from "express";
import { ProductService } from "./product.service";

export class ProductController {
  static async create(req: Request, res: Response) {
    const product = await ProductService.create(req.body, req.user.id);
    res.json(product);
  }

  static async getAll(req: Request, res: Response) {
    const products = await ProductService.getAll();
    res.json(products);
  }
}