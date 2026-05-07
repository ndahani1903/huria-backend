import { prisma } from "../../config/db";

export class ReviewService {
  static async create(userId: string, userName: string, data: any, images: string[] = []) {
    console.log("📸 Received images in service:", images);
  console.log("📸 Images count:", images.length);
  console.log("📸 Image URLs:", images);

    // Check if user already reviewed this product
    const existing = await prisma.review.findUnique({
      where: {
        productId_userId: {
          productId: data.productId,
          userId: userId
        }
      }
    });

    if (existing) {
      throw new Error("You have already reviewed this product");
    }

    // ✅ FIX: Convert rating to integer
    const ratingInt = parseInt(data.rating);
    if (isNaN(ratingInt) || ratingInt < 1 || ratingInt > 5) {
      throw new Error("Rating must be a number between 1 and 5");
    }

    const review = await prisma.review.create({
      data: {
        productId: data.productId,
        userId: userId,
        userName: userName,
        rating:  ratingInt,
        comment: data.comment,
        images: images // ✅ Save review images
      }
    });

    // Update product average rating
    await this.updateProductRating(data.productId);

    console.log("✅ Review created with images:", review.images);
    return review;
  }

  static async getByProduct(productId: string) {
    const reviews = await prisma.review.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' }
    });
    return reviews;
  }

static async getUserReviews(userId: string) {
    const reviews = await prisma.review.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { createdAt: 'desc' }
    });
    return reviews;
  }

  static async updateProductRating(productId: string) {
    const result = await prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: true
    });

    const averageRating = result._avg.rating || 0;

    await prisma.product.update({
      where: { id: productId },
      data: { averageRating }
    });

    return { averageRating, totalReviews: result._count };
  }
  
  static async delete(reviewId: string, userId: string) {
    const review = await prisma.review.findFirst({
      where: {
        id: reviewId,
        userId: userId
      }
    });

    if (!review) {
      throw new Error("Review not found or unauthorized");
    }

    await prisma.review.delete({
      where: { id: reviewId }
    });

    // Update product rating after deletion
    await this.updateProductRating(review.productId);

    return { message: "Review deleted successfully" };
  }
}