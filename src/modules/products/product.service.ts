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
        isActive: true,  // ✅ Added
        merchantId: merchant.id,
      },
    });
  }

  static async getAll() {
    return prisma.product.findMany({
    include: {
      merchant: true, // 🔥 include merchant
    },
    where: {
     isActive: true,  // ✅ Only show active products 
    }  
  });
 }

  static async updateStock(productId: string, quantity: number) {
    return prisma.product.update({
      where: { id: productId },
      data: {
        stock: { decrement: quantity }
      }
    });
  }
}