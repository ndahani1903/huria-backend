import { prisma } from "../../config/db";

export class ProductService {

  static async create(userId: string, data: any) {
    const merchant = await prisma.merchant.findUnique({
      where: { userId }
    });

    if (!merchant) throw new Error("Merchant not found");

    return prisma.product.create({
      data: {
        name: data.name,
        price: Number(data.price),
        stock: Number(data.stock),
        description: data.description || "",
        category: data.category || "",
        images: data.images || [],
        merchantId: merchant.id,

        variants: {
          create: (data.variants || []).map((v: any) => ({
            size: v.size,
            color: v.color,
            stock: Number(v.stock),
            price: v.price ? Number(v.price) : null,
            sku: v.sku
          }))
        }
      },
      include: {
        variants: true
      }
    });
  }

  static async getAll(query?: any) {
    const page = Number(query?.page || 1);
    const limit = Number(query?.limit || 50000);
    const skip = (page - 1) * limit;

    return prisma.product.findMany({
      where: {
        isActive: true
      },
      include: {
        merchant: {
          select: {
            businessName: true,
            rating: true
          }
        },
        variants: true
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    });
  }

  static async getById(productId: string) {
    return prisma.product.findUnique({
      where: { id: productId },
      include: {
        merchant: true,
        variants: true
      }
    });
  }

  static async getMyProducts(userId: string) {
    const merchant = await prisma.merchant.findUnique({
      where: { userId }
    });

    if (!merchant) throw new Error("Merchant not found");

    return prisma.product.findMany({
      where: {
        merchantId: merchant.id,
        isActive: true
      },
      include: {
        variants: true
      },
      orderBy: { createdAt: "desc" }
    });
  }

  static async update(userId: string, productId: string, data: any) {
    const merchant = await prisma.merchant.findUnique({
      where: { userId }
    });

    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!merchant || !product) throw new Error("Product not found");

    if (product.merchantId !== merchant.id) {
      throw new Error("Forbidden");
    }

    await prisma.productVariant.deleteMany({
      where: { productId }
    });

    return prisma.product.update({
      where: { id: productId },
      data: {
        name: data.name,
        price: Number(data.price),
        stock: Number(data.stock),
        description: data.description,
        category: data.category,
        images: data.images,

        variants: {
          create: (data.variants || []).map((v: any) => ({
            size: v.size,
            color: v.color,
            stock: Number(v.stock),
            price: v.price ? Number(v.price) : null,
            sku: v.sku
          }))
        }
      },
      include: {
        variants: true
      }
    });
  }

  static async remove(userId: string, productId: string) {
    const merchant = await prisma.merchant.findUnique({
      where: { userId }
    });

    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!merchant || !product) throw new Error("Product not found");

    return prisma.product.update({
      where: { id: productId },
      data: { isActive: false }
    });
  }

static async toggle(userId: string, productId: string) {
  const merchant = await prisma.merchant.findUnique({
    where: { userId }
  });

  const product = await prisma.product.findUnique({
    where: { id: productId }
  });

  if (!merchant || !product) {
    throw new Error("Product not found");
  }

  return prisma.product.update({
    where: { id: productId },
    data: {
      isActive: !product.isActive
    }
  });
}

static async updateStock(
  userId: string,
  productId: string,
  stock: number
) {
  const merchant = await prisma.merchant.findUnique({
    where: { userId }
  });

  const product = await prisma.product.findUnique({
    where: { id: productId }
  });

  if (!merchant || !product) {
    throw new Error("Product not found");
  }

  return prisma.product.update({
    where: { id: productId },
    data: {
      stock: Number(stock)
    }
  });
}

}