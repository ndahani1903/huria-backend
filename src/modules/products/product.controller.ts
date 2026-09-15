import { Request, Response } from "express";
import { ProductService } from "./product.service";
import { AuthRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/db";
import { ProductSearchService } from "../merchants/productSearch.service";

function generateBarcode(merchantId: string, productName: string): string {
  // Format: HURIA-{merchantId.slice(-4)}-{timestamp}-{random}
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  const merchantCode = merchantId.slice(-4).toUpperCase();
  const nameCode = productName.slice(0, 3).toUpperCase();
  return `HUR-${merchantCode}-${nameCode}-${timestamp}${random}`;
}

export class ProductController {
  static async create(req: AuthRequest, res: Response) {
   try {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user!.id }
      });

      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

      const { name, price, stock, description, category, variants, weightBracket, allowedVehicles, preparationTime, dietaryInfo, isSpicy, isVegetarian, isVegan, isGlutenFree, modifiers, barcode, expiryDate, weight, unit, aisleLocation, minimumOrderQuantity, maximumOrderQuantity,
bulkDiscountQuantity, bulkDiscountPercent, nutritionalInfo,
searchKeywords,      // Array of keywords for better search
      synonymTerms,        // Related terms
      tags                 // Category tags
 } = req.body;

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

  // Handle variants (could be JSON string or object)
      let parsedVariants = {};
      if (variants) {
        try {
          parsedVariants = typeof variants === "string" ? JSON.parse(variants) : variants;
        } catch (e) {
          parsedVariants = {};
        }
      }


      // ✅ Parse restaurant fields if they come as strings
    let parsedDietaryInfo = [];
    if (dietaryInfo) {
      try {
        parsedDietaryInfo = typeof dietaryInfo === "string" ? JSON.parse(dietaryInfo) : dietaryInfo;
      } catch (e) {
        parsedDietaryInfo = [];
      }
    }

    let parsedModifiers = [];
    if (modifiers) {
      try {
        parsedModifiers = typeof modifiers === "string" ? JSON.parse(modifiers) : modifiers;
      } catch (e) {
        parsedModifiers = [];
      }
    }

   let parsedNutritionalInfo = null;
    if (nutritionalInfo) {
      try {
        parsedNutritionalInfo = typeof nutritionalInfo === "string" ? JSON.parse(nutritionalInfo) : nutritionalInfo;
      } catch (e) {
        parsedNutritionalInfo = null;
      }
    }

   // Parse search keywords
    let parsedKeywords = [];
    if (searchKeywords) {
      parsedKeywords = typeof searchKeywords === "string" 
        ? JSON.parse(searchKeywords) 
        : searchKeywords;
    }
    
    let parsedSynonyms = [];
    if (synonymTerms) {
      parsedSynonyms = typeof synonymTerms === "string" 
        ? JSON.parse(synonymTerms) 
        : synonymTerms;
    }



      const product = await prisma.product.create({
        data: {
          name,
          price: parseFloat(price),
          stock: parseInt(stock) || 0,
          description: description || null,
          category: category || "uncategorized",
          images: imageUrls,
          isActive: true,
          merchantId: merchant.id,
         weightBracket: weightBracket || "MEDIUM",
        allowedVehicles: allowedVehicles || ["motorcycle", "bajaj", "truck"],

        // ✅ ADD RESTAURANT FIELDS
        preparationTime: parseInt(preparationTime) || 15,
        dietaryInfo: parsedDietaryInfo,
        isSpicy: isSpicy === 'true' || isSpicy === true,
        isVegetarian: isVegetarian === 'true' || isVegetarian === true,
        isVegan: isVegan === 'true' || isVegan === true,
        isGlutenFree: isGlutenFree === 'true' || isGlutenFree === true,
        modifiers: parsedModifiers,

        barcode: barcode || generateBarcode(merchant.id, name),
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        weight: weight ? parseFloat(weight) : null,
        unit: unit || null,
        aisleLocation: aisleLocation || null,
        minimumOrderQuantity: parseInt(minimumOrderQuantity) || 1,
        maximumOrderQuantity: maximumOrderQuantity ? parseInt(maximumOrderQuantity) : 99,
        bulkDiscountQuantity: bulkDiscountQuantity ? parseInt(bulkDiscountQuantity) : null,
        bulkDiscountPercent: bulkDiscountPercent ? parseInt(bulkDiscountPercent) : null,
        nutritionalInfo: parsedNutritionalInfo,
       searchKeywords: parsedKeywords,
        synonymTerms: parsedSynonyms,
        tags: tags ? (typeof tags === "string" ? JSON.parse(tags) : tags) : [],

    variants: {
      create: Array.isArray(parsedVariants)
        ? parsedVariants.map((v: any) => ({
            size: v.size,
            color: v.color,
            sku: v.sku,
            stock: Number(v.stock || 0),
            price: v.price ? Number(v.price) : null
          }))
        : []
    }
  },

  include: {
    variants: true
        }
      });

      // Return transformed product
      res.status(201).json({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        stock: product.stock,
        description: product.description,
        images: product.images as string[],
        image: (product.images as string[])?.[0] || "",
        variants: product.variants,
        category: product.category,
        weightBracket: product.weightBracket,      
      allowedVehicles: product.allowedVehicles,
        preparationTime: product.preparationTime,
        dietaryInfo: product.dietaryInfo,
        isSpicy: product.isSpicy,
        isVegetarian: product.isVegetarian,
        isVegan: product.isVegan,
        isGlutenFree: product.isGlutenFree,
        modifiers: product.modifiers,
        barcode: product.barcode,
        expiryDate: product.expiryDate,
        weight: product.weight,
        unit: product.unit,
        aisleLocation: product.aisleLocation,
        minimumOrderQuantity: product.minimumOrderQuantity,
        maximumOrderQuantity: product.maximumOrderQuantity,
        bulkDiscountQuantity: product.bulkDiscountQuantity,
        bulkDiscountPercent: product.bulkDiscountPercent,
        nutritionalInfo: product.nutritionalInfo,
        isActive: product.isActive,
        createdAt: product.createdAt
      });
    } catch (error: any) {
      console.error("Create product error:", error);
      res.status(500).json({ error: error.message });
    }
  }


// Create restaurant menu item
static async createRestaurantMenuItem(req: AuthRequest, res: Response) {
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { userId: req.user!.id }
    });

    if (!merchant) {
      return res.status(404).json({ error: "Merchant not found" });
    }
    
    if (merchant.merchantType !== 'RESTAURANT') {
      return res.status(400).json({ error: "Not a restaurant merchant" });
    }

    const { 
      name, price, description, category, 
      preparationTime, dietaryInfo, isSpicy, 
      isVegetarian, isVegan, isGlutenFree, modifiers 
    } = req.body;

    // Handle image upload
    let imageUrls: string[] = [];
    const files = req.files as Express.Multer.File[];
    if (files && files.length > 0) {
      imageUrls = files.map(file => `/uploads/${file.filename}`);
    }
    if (req.body.images) {
      const parsed = typeof req.body.images === "string" ? JSON.parse(req.body.images) : req.body.images;
      imageUrls = Array.isArray(parsed) ? parsed : [parsed];
    }

    const product = await prisma.product.create({
      data: {
        name,
        price: parseFloat(price),
        stock: 999, // Restaurant items typically unlimited
        description: description || null,
        category: category || "restaurant",
        images: imageUrls,
        isActive: true,
        merchantId: merchant.id,
        preparationTime: parseInt(preparationTime) || 15,
        dietaryInfo: dietaryInfo ? (typeof dietaryInfo === "string" ? JSON.parse(dietaryInfo) : dietaryInfo) : [],
        isSpicy: isSpicy === 'true' || isSpicy === true,
        isVegetarian: isVegetarian === 'true' || isVegetarian === true,
        isVegan: isVegan === 'true' || isVegan === true,
        isGlutenFree: isGlutenFree === 'true' || isGlutenFree === true,
        modifiers: modifiers ? (typeof modifiers === "string" ? JSON.parse(modifiers) : modifiers) : []
      }
    });

    res.status(201).json({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      description: product.description,
      images: product.images,
      preparationTime: product.preparationTime,
      dietaryInfo: product.dietaryInfo,
      modifiers: product.modifiers
    });
  } catch (error: any) {
    console.error("Create restaurant menu item error:", error);
    res.status(500).json({ error: error.message });
  }
}

// Create supermarket product
static async createSupermarketProduct(req: AuthRequest, res: Response) {
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { userId: req.user!.id }
    });

    if (!merchant) {
      return res.status(404).json({ error: "Merchant not found" });
    }
    
    if (merchant.merchantType !== 'SUPERMARKET') {
      return res.status(400).json({ error: "Not a supermarket merchant" });
    }

    const { 
      name, price, stock, description, category,
      barcode, weight, unit, aisleLocation,
      expiryDate, minimumOrderQuantity, maximumOrderQuantity
    } = req.body;

    // Handle image upload
    let imageUrls: string[] = [];
    const files = req.files as Express.Multer.File[];
    if (files && files.length > 0) {
      imageUrls = files.map(file => `/uploads/${file.filename}`);
    }
    if (req.body.images) {
      const parsed = typeof req.body.images === "string" ? JSON.parse(req.body.images) : req.body.images;
      imageUrls = Array.isArray(parsed) ? parsed : [parsed];
    }

    // Check if barcode already exists
    if (barcode) {
      const existing = await prisma.product.findFirst({
        where: { barcode, merchantId: { not: merchant.id } }
      });
      if (existing) {
        return res.status(400).json({ error: "Barcode already exists" });
      }
    }

    const product = await prisma.product.create({
      data: {
        name,
        price: parseFloat(price),
        stock: parseInt(stock) || 0,
        description: description || null,
        category: category || "supermarket",
        images: imageUrls,
        isActive: true,
        merchantId: merchant.id,
        barcode: barcode || null,
        weight: weight ? parseFloat(weight) : null,
        unit: unit || null,
        aisleLocation: aisleLocation || null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        minimumOrderQuantity: parseInt(minimumOrderQuantity) || 1,
        maximumOrderQuantity: parseInt(maximumOrderQuantity) || 99
      }
    });

    res.status(201).json({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      stock: product.stock,
      description: product.description,
      images: product.images,
      barcode: product.barcode,
      weight: product.weight,
      unit: product.unit,
      aisleLocation: product.aisleLocation,
      expiryDate: product.expiryDate
    });
  } catch (error: any) {
    console.error("Create supermarket product error:", error);
    res.status(500).json({ error: error.message });
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
      const id = req.params.id as string;
      const { name, price, stock, description, category, variants, images, discountEligible, newUserDiscount, weightBracket, allowedVehicles, preparationTime, dietaryInfo, isSpicy, isVegetarian, isVegan, isGlutenFree, modifiers, barcode, expiryDate, weight, unit, aisleLocation, minimumOrderQuantity, maximumOrderQuantity, bulkDiscountQuantity, bulkDiscountPercent, nutritionalInfo } = req.body;

    console.log('Updating product:', id);
    console.log('Update data:', { name, price, stock, description, category, discountEligible, newUserDiscount, weightBracket, allowedVehicles, preparationTime, dietaryInfo, isSpicy, isVegetarian, isVegan, isGlutenFree, modifiers, barcode, expiryDate, weight, unit, aisleLocation, minimumOrderQuantity, maximumOrderQuantity, bulkDiscountQuantity, bulkDiscountPercent, nutritionalInfo });
   console.log('User role:', req.user!.role);

      // First, check if product exists (without merchant restriction)
    const existingProduct = await prisma.product.findUnique({
      where: { id },
      include: { variants: true }
    });

      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

// Check permissions: admin can update any, merchant can update only theirs
    if (req.user!.role !== 'admin') {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user!.id }
      });
      
      if (!merchant || existingProduct.merchantId !== merchant.id) {
        return res.status(403).json({ error: "Unauthorized to update this product" });
      }
    }

// Delete existing variants (if any)
     await prisma.productVariant.deleteMany({
  where: { productId: id }
});

       // ✅ Parse restaurant fields
    let parsedDietaryInfo = [];
    if (dietaryInfo) {
      try {
        parsedDietaryInfo = typeof dietaryInfo === "string" ? JSON.parse(dietaryInfo) : dietaryInfo;
      } catch (e) {
        parsedDietaryInfo = [];
      }
    }

    let parsedModifiers = [];
    if (modifiers) {
      try {
        parsedModifiers = typeof modifiers === "string" ? JSON.parse(modifiers) : modifiers;
      } catch (e) {
        parsedModifiers = [];
      }
    }

    let parsedNutritionalInfo = null;
    if (nutritionalInfo) {
      try {
        parsedNutritionalInfo = typeof nutritionalInfo === "string" ? JSON.parse(nutritionalInfo) : nutritionalInfo;
      } catch (e) {
        parsedNutritionalInfo = null;
      }
    }

      const updated = await prisma.product.update({
        where: { id },
       data: {
         name: name ?? existingProduct.name,
         price: price !== undefined
               ? parseFloat(price)
               : existingProduct.price,

       stock: stock !== undefined
              ? parseInt(stock)
              : existingProduct.stock,

      description:
      description ?? existingProduct.description,

    category:
      category ?? existingProduct.category,

    images:
      images ?? existingProduct.images,

   discountEligible: discountEligible !== undefined ? discountEligible : existingProduct.discountEligible,

   newUserDiscount: newUserDiscount !== undefined ? newUserDiscount : existingProduct.newUserDiscount,
        // ✅ ADD THESE LINES
        weightBracket: weightBracket ?? existingProduct.weightBracket,
        allowedVehicles: allowedVehicles ?? existingProduct.allowedVehicles,
      preparationTime: preparationTime !== undefined ? parseInt(preparationTime) : existingProduct.preparationTime,
        dietaryInfo: parsedDietaryInfo.length > 0 ? parsedDietaryInfo : existingProduct.dietaryInfo,
        isSpicy: isSpicy !== undefined ? (isSpicy === 'true' || isSpicy === true) : existingProduct.isSpicy,
        isVegetarian: isVegetarian !== undefined ? (isVegetarian === 'true' || isVegetarian === true) : existingProduct.isVegetarian,
        isVegan: isVegan !== undefined ? (isVegan === 'true' || isVegan === true) : existingProduct.isVegan,
        isGlutenFree: isGlutenFree !== undefined ? (isGlutenFree === 'true' || isGlutenFree === true) : existingProduct.isGlutenFree,
        modifiers: parsedModifiers.length > 0 ? parsedModifiers : existingProduct.modifiers,
         barcode: barcode !== undefined ? barcode : existingProduct.barcode,
        expiryDate: expiryDate ? new Date(expiryDate) : existingProduct.expiryDate,
        weight: weight !== undefined ? parseFloat(weight) : existingProduct.weight,
        unit: unit !== undefined ? unit : existingProduct.unit,
        aisleLocation: aisleLocation !== undefined ? aisleLocation : existingProduct.aisleLocation,
        minimumOrderQuantity: minimumOrderQuantity !== undefined ? parseInt(minimumOrderQuantity) : existingProduct.minimumOrderQuantity,
        maximumOrderQuantity: maximumOrderQuantity !== undefined ? parseInt(maximumOrderQuantity) : existingProduct.maximumOrderQuantity,
        bulkDiscountQuantity: bulkDiscountQuantity !== undefined ? parseInt(bulkDiscountQuantity) : existingProduct.bulkDiscountQuantity,
        bulkDiscountPercent: bulkDiscountPercent !== undefined ? parseInt(bulkDiscountPercent) : existingProduct.bulkDiscountPercent,
        nutritionalInfo: parsedNutritionalInfo,

    variants: {
      create: Array.isArray(variants)
        ? variants.map((v: any) => ({
            size: v.size,
            color: v.color,
            sku: v.sku,
            stock: Number(v.stock || 0),
            price: v.price ? Number(v.price) : null
          }))
        : []
    }
  },

  include: {
    variants: true
  }
});

console.log('Product updated successfully:', updated);

      res.json({
        id: updated.id,
        name: updated.name,
        price: Number(updated.price),
        stock: updated.stock,
        description: updated.description,
        images: updated.images as string[],
        image: (updated.images as string[])?.[0] || "",
        variants: updated.variants,
        category: updated.category,
        weightBracket: updated.weightBracket,     
        allowedVehicles: updated.allowedVehicles, 
        preparationTime: updated.preparationTime,
        dietaryInfo: updated.dietaryInfo,
        isSpicy: updated.isSpicy,
        isVegetarian: updated.isVegetarian,
        isVegan: updated.isVegan,
        isGlutenFree: updated.isGlutenFree,
        modifiers: updated.modifiers,
        barcode: updated.barcode,
        expiryDate: updated.expiryDate,
        weight: updated.weight,
        unit: updated.unit,
        aisleLocation: updated.aisleLocation,
        minimumOrderQuantity: updated.minimumOrderQuantity,
        maximumOrderQuantity: updated.maximumOrderQuantity,
        bulkDiscountQuantity: updated.bulkDiscountQuantity,
        bulkDiscountPercent: updated.bulkDiscountPercent,
        nutritionalInfo: updated.nutritionalInfo,
        newUserDiscount: updated.newUserDiscount,
        discountEligible: updated.discountEligible,
        isActive: updated.isActive
      });
    } catch (error: any) {
      console.error("Update product error:", error);
      res.status(500).json({ error: error.message });
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

static async setFlashSale(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { isFlashSale, flashDiscount, flashSaleEnd } = req.body;
    
    // Only admin can set flash sales
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can manage flash sales' });
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        isFlashSale,
        flashDiscount: flashDiscount || 0,
        flashSaleEnd: flashSaleEnd ? new Date(flashSaleEnd) : null
      }
    });
    
    res.json(product);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

static async setDeal(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { isDeal, dealDiscount, dealEndDate } = req.body;
  
    // Verify product belongs to merchant
    const merchant = await prisma.merchant.findUnique({
      where: { userId: req.user!.id }
    });
    
    const product = await prisma.product.findFirst({
      where: { id, merchantId: merchant?.id }
    });
    
    if (!product && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const updated = await prisma.product.update({
      where: { id },
      data: {
        isDeal,
        dealDiscount: dealDiscount || 0,
        dealEndDate: dealEndDate ? new Date(dealEndDate) : null
      }
    });
    
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

static async getActiveDeals(req: Request, res: Response) {
  try {
    const deals = await ProductService.getActiveDeals();
    res.json(deals);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// Get products with active flash sales
static async getActiveFlashSales(req: Request, res: Response) {
  try {
    const flashSales = await ProductService.getActiveFlashSales();
    res.json(flashSales);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// Get products by gender
static async getByGender(req: Request, res: Response) {
  try {
    const { gender } = req.params;
    const products = await ProductService.getProductsByGender(gender);
    res.json(products);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// Get gift products
static async getGiftProducts(req: Request, res: Response) {
  try {
    const products = await ProductService.getGiftProducts();
    res.json(products);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// Get high rated products
static async getHighRated(req: Request, res: Response) {
  try {
    const products = await ProductService.getHighRatedProducts();
    res.json(products);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// Merchant: Update deal for their product
static async updateDeal(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { isDeal, dealDiscount, dealEndDate } = req.body;
    
    // Get merchant ID
    const merchant = await prisma.merchant.findUnique({
      where: { userId: req.user!.id }
    });
    
    if (!merchant) {
      return res.status(404).json({ error: "Merchant not found" });
    }
    
    const updated = await ProductService.updateDeal(id, merchant.id, {
      isDeal,
      dealDiscount,
      dealEndDate: dealEndDate ? new Date(dealEndDate) : undefined
    });
    
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// Admin: Update flash sale for any product
static async updateFlashSale(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { isFlashSale, flashDiscount, flashSaleEnd } = req.body;
    
    // Only admin can set flash sales
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can manage flash sales' });
    }
    
    const updated = await ProductService.updateFlashSale(id, {
      isFlashSale,
      flashDiscount,
      flashSaleEnd: flashSaleEnd ? new Date(flashSaleEnd) : undefined
    });
    
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}


// Intelligent search endpoint
static async intelligentSearch(req: Request, res: Response) {
  try {
    const { q, source } = req.query;
    const userId = (req as any).user?.id;
    
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: "Search term required" });
    }
    
    const results = await ProductSearchService.intelligentSearch(
      q, 
      userId,
      { source: source || 'search_bar' }
    );
    
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Get trending searches
static async getTrendingSearches(req: Request, res: Response) {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const trending = await ProductSearchService.getTrendingSearches(limit);
    res.json(trending);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Get search suggestions
static async getSearchSuggestions(req: Request, res: Response) {
  try {
    const { q } = req.query;
    const limit = parseInt(req.query.limit as string) || 5;
    
    if (!q || typeof q !== 'string') {
      return res.json([]);
    }
    
    const suggestions = await ProductSearchService.getSearchSuggestions(q, limit);
    res.json(suggestions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Track product view (customer behavior)
static async trackProductView(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    await ProductSearchService.updateAffinityScore(userId, id, 'view');
    
    // Increment view count
    await prisma.product.update({
      where: { id },
      data: { viewCount: { increment: 1 } }
    });
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Track add to cart (customer behavior)
static async trackAddToCart(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    await ProductSearchService.trackAddToCart(userId, id);
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Get personalized recommendations for customer
static async getPersonalizedRecommendations(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 20;
    
    const recommendations = await ProductSearchService.getPersonalizedRecommendations(userId, limit);
    res.json(recommendations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
}