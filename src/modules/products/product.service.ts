import { prisma } from "../../config/db";

export class ProductService {
  static async create(userId: string, productData: any)  {
    const merchant = await prisma.merchant.findUnique({
      where: { userId },
    });

    if (!merchant) throw new Error("Not a merchant");

     // ✅ CRITICAL FIX: Ensure images are saved as JSON string
  let imagesJson = null;
  if (productData.images && productData.images.length > 0) {
    imagesJson = JSON.stringify(productData.images);
    console.log("Saving images as JSON string, length:", imagesJson.length);
    console.log("First 100 chars:", imagesJson.substring(0, 100));
  }

     const created = await prisma.product.create({
      data: {
        name: productData.name,
        price: productData.price,
        stock: productData.stock || 0,
        description: productData.description || "",
        image: productData.image || (productData.images && productData.images[0]) || "",
        images: imagesJson,
        variants: productData.variants || {},
        category: productData.category,
        merchantId: merchant.id,
        isActive: true,  // ✅ Added
      },
    });

console.log("Created product - images column value:", created.images);

  // ✅ Return with parsed images
  return {
    ...created,
    images: productData.images || []
  };
}

   static async getAll() {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: {
        merchant: {
          include: {
            user: {
              select: { name: true }
            }
          }
        }
      }
    });
    
     // ✅ Parse images for each product
  const parsedProducts = products.map(product => {
    let parsedImages = [];
    if (product.images) {
      try {
        if (Array.isArray(product.images)) {
          parsedImages = product.images;
        } else if (typeof product.images === 'string') {
          parsedImages = JSON.parse(product.images);
        }
      } catch (e) {
        console.error("Failed to parse images for product:", product.id);
        parsedImages = [];
      }
    }
    
    return {
      ...product,
      images: parsedImages
    };
  });
  
  console.log("Products fetched - sample images count:", parsedProducts[0]?.images?.length || 0);
  
  return parsedProducts;
}

  static async getById(productId: string) {
    const id = typeof productId === 'string' ? productId : String(productId);

    const product = await prisma.product.findUnique({
      where: { id: id },
      include: {
        merchant: {
          include: {
            user: {
              select: { name: true }
            }
          }
        }
      }
    });
    
    if (!product) return null;
    
    console.log("Raw product.images from DB:", product.images);
  console.log("Type of product.images:", typeof product.images);
  
  // ✅ Parse images back to array
  let imagesArray = [];
  if (product.images) {
    try {
      if (typeof product.images === 'string') {
        imagesArray = JSON.parse(product.images);
      } else if (Array.isArray(product.images)) {
        imagesArray = product.images;
      }
    } catch (e) {
      console.error("Failed to parse images:", e);
    }
  }
  
  console.log("Parsed images array length:", imagesArray.length);
  
  return {
    ...product,
    images: imagesArray
  };
}

  static async update(productId: string, productData: any) {
     // ✅ Convert images array to JSON string
  let imagesJson = null;
  if (productData.images && productData.images.length > 0) {
    imagesJson = JSON.stringify(productData.images);
    console.log("UPDATE - Saving images JSON length:", imagesJson.length);
  } else if (productData.image) {
    imagesJson = JSON.stringify([productData.image]);
  }
    
   const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        name: productData.name,
        price: productData.price,
        stock: productData.stock,
        description: productData.description,
        image: productData.image || (productData.images && productData.images[0]) || "",
        images: imagesJson,  // ✅ Save as JSON string
        variants: productData.variants || {},
        category: productData.category,
      },
    });
    
     console.log("Updated product - images column value:", updated.images);
  
  // Parse back to array for response
  let parsedImages = [];
  if (updated.images && typeof updated.images === 'string') {
    try {
      parsedImages = JSON.parse(updated.images);
    } catch(e) {
      console.error("Failed to parse images:", e);
    }
  }
  
  return {
    ...updated,
    images: parsedImages
  };
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