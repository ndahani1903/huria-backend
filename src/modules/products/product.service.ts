import { prisma } from "../../config/db";

export class ProductService {
    static async create(userId: string, name: string, price: number, stock: number, image?: string, description?: string) {
    const merchant = await prisma.merchant.findUnique({
      where: { userId },
    });

    if (!merchant) throw new Error("Not a merchant");

    return prisma.product.create({
      data: {
        name,
        price,
        stock: stock || 0,
        image,
        description,
        merchantId: merchant.id,
      },
    });
  }

  static async getAll() {
    return prisma.product.findMany({
    include: {
      merchant: true, // 🔥 include merchant
    },
 // ✅ COMMENT OUT the stock filter for now
   //  where: {
     //  stock: { gt: 0 } // Only show products in stock
     // }  
  });
 }

  static async updateStock(productId: number, quantity: number) {
    return prisma.product.update({
      where: { id: productId },
      data: {
        stock: { decrement: quantity }
      }
    });
  }
}