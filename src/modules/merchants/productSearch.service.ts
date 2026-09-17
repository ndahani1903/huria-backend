// src/modules/merchants/productSearch.service.ts

import { prisma } from "../../config/db";
import { Decimal } from "@prisma/client/runtime/library";

const toNumber = (val: any): number =>
  val instanceof Decimal
    ? val.toNumber()
    : Number(val);

export class ProductSearchService {

  // ============================================================
  // TRACK CUSTOMER SEARCH BEHAVIOR
  // ============================================================

  static async trackSearch(
    userId: string,
    searchData: {
      searchTerm: string;
      resultsCount: number;
      productsViewed: string[];
      productClicked?: string;
      timeSpentMs?: number;
      searchSource?: string;
      deviceType?: string;
    }
  ) {
    try {
      const normalizedSearchTerm =
        searchData.searchTerm
          .toLowerCase()
          .trim();

      // Record search analytics
      await prisma.customerSearchAnalytics.create({
        data: {
          userId,
          searchTerm:
            normalizedSearchTerm,
          searchDate: new Date(),
          searchSource:
            searchData.searchSource ||
            "search_bar",
          resultsCount:
            searchData.resultsCount,
          productsViewed:
            searchData.productsViewed,
          productClicked:
            searchData.productClicked,
          timeSpentMs:
            searchData.timeSpentMs || 0,
          deviceType:
            searchData.deviceType ||
            "unknown"
        }
      });

      // Update or create popular search term
      await prisma.popularSearchTerm.upsert({
        where: {
          term: normalizedSearchTerm
        },

        update: {
          searchCount: {
            increment: 1
          },
          lastSearched:
            new Date()
        },

        create: {
          term:
            normalizedSearchTerm,
          searchCount: 1,
          lastSearched:
            new Date()
        }
      });

      // Update product view counts
      for (
        const productId
        of searchData.productsViewed
      ) {
        await prisma.product.update({
          where: {
            id: productId
          },

          data: {
            viewCount: {
              increment: 1
            },

            lastSearchAt:
              new Date()
          }
        });

        // Update customer affinity
        await this.updateAffinityScore(
          userId,
          productId,
          "view"
        );
      }

      // If a product was clicked,
      // update click tracking
      if (
        searchData.productClicked
      ) {
        await this.updateAffinityScore(
          userId,
          searchData.productClicked,
          "click"
        );
      }

    } catch (error) {
      console.error(
        "Track search error:",
        error
      );
    }
  }

  // ============================================================
  // TRACK PRODUCT PURCHASE
  // ============================================================

  static async trackPurchase(
    userId: string,
    productId: string,
    quantity: number = 1
  ) {
    try {
      await prisma.product.update({
        where: {
          id: productId
        },

        data: {
          purchaseCount: {
            increment: quantity
          },

          popularSearchCount: {
            increment: 1
          }
        }
      });

      // Update conversion rate
      const product =
        await prisma.product.findUnique({
          where: {
            id: productId
          },

          select: {
            viewCount: true,
            purchaseCount: true
          }
        });

      if (
        product &&
        product.viewCount > 0
      ) {
        const conversionRate =
          (product.purchaseCount /
            product.viewCount) *
          100;

        await prisma.product.update({
          where: {
            id: productId
          },

          data: {
            conversionRate
          }
        });
      }

      // Purchase has the highest
      // affinity weight
      await this.updateAffinityScore(
        userId,
        productId,
        "purchase"
      );

    } catch (error) {
      console.error(
        "Track purchase error:",
        error
      );
    }
  }

  // ============================================================
  // TRACK ADD TO CART
  // ============================================================

  static async trackAddToCart(
    userId: string,
    productId: string
  ) {
    try {
      await prisma.product.update({
        where: {
          id: productId
        },

        data: {
          addToCartCount: {
            increment: 1
          }
        }
      });

      await this.updateAffinityScore(
        userId,
        productId,
        "cart"
      );

    } catch (error) {
      console.error(
        "Track add to cart error:",
        error
      );
    }
  }

  // ============================================================
  // UPDATE CUSTOMER-PRODUCT AFFINITY SCORE
  // ============================================================

  static async updateAffinityScore(
    userId: string,
    productId: string,
    action:
      | "view"
      | "click"
      | "cart"
      | "purchase"
  ) {
    const weights: Record<
      "view" | "click" | "cart" | "purchase",
      number
    > = {
      view: 1,
      click: 3,
      cart: 5,
      purchase: 10
    };

    const increment =
      weights[action];

    await prisma.customerProductAffinity.upsert(
      {
        where: {
          userId_productId: {
            userId,
            productId
          }
        },

        update: {
          viewCount:
            action === "view"
              ? {
                  increment: 1
                }
              : undefined,

          clickCount:
            action === "click"
              ? {
                  increment: 1
                }
              : undefined,

          addToCartCount:
            action === "cart"
              ? {
                  increment: 1
                }
              : undefined,

          purchaseCount:
            action === "purchase"
              ? {
                  increment: 1
                }
              : undefined,

          overallScore: {
            increment
          },

          viewScore:
            action === "view"
              ? {
                  increment: 1
                }
              : undefined,

          purchaseScore:
            action === "purchase"
              ? {
                  increment: 1
                }
              : undefined,

          lastInteraction:
            new Date()
        },

        create: {
          userId,
          productId,

          viewScore:
            action === "view"
              ? 1
              : 0,

          purchaseScore:
            action === "purchase"
              ? 1
              : 0,

          overallScore:
            increment,

          viewCount:
            action === "view"
              ? 1
              : 0,

          clickCount:
            action === "click"
              ? 1
              : 0,

          addToCartCount:
            action === "cart"
              ? 1
              : 0,

          purchaseCount:
            action === "purchase"
              ? 1
              : 0,

          lastInteraction:
            new Date()
        }
      }
    );
  }

  // ============================================================
  // GET PERSONALIZED PRODUCT RECOMMENDATIONS
  // ============================================================

  static async getPersonalizedRecommendations(
    userId: string,
    limit: number = 20
  ) {
    try {
      // Get products with highest
      // customer affinity scores
      const affinities =
        await prisma.customerProductAffinity.findMany(
          {
            where: {
              userId
            },

            include: {
              product: true
            },

            orderBy: {
              overallScore: "desc"
            },

            take: limit * 2
          }
        );

      const recommendedProducts =
        affinities.map(
          (affinity) =>
            affinity.product
        );

      // If not enough personalized
      // results, add trending products
      if (
        recommendedProducts.length <
        limit
      ) {
        const trending =
          await prisma.product.findMany(
            {
              where: {
                isActive: true,

                popularSearchCount: {
                  gt: 0
                },

                id: {
                  notIn:
                    recommendedProducts.map(
                      (product) =>
                        product.id
                    )
                }
              },

              orderBy: {
                popularSearchCount:
                  "desc"
              },

              take:
                limit -
                recommendedProducts.length
            }
          );

        recommendedProducts.push(
          ...trending
        );
      }

      return recommendedProducts.slice(
        0,
        limit
      );

    } catch (error) {
      console.error(
        "Get personalized recommendations error:",
        error
      );

      return [];
    }
  }

  // ============================================================
  // INTELLIGENT PRODUCT SEARCH
  // ============================================================

  static async intelligentSearch(
    searchTerm: string,
    userId?: string,
    filters?: any
  ) {
    const term =
      searchTerm
        .toLowerCase()
        .trim();

    // Get search results with boosting
    const products =
      await prisma.product.findMany({
        where: {
          isActive: true,

          OR: [
            {
              name: {
                contains: term,
                mode: "insensitive"
              }
            },

            {
              description: {
                contains: term,
                mode: "insensitive"
              }
            },

            {
              category: {
                contains: term,
                mode: "insensitive"
              }
            },

            {
              tags: {
                has: term
              }
            },

            {
              searchKeywords: {
                has: term
              }
            },

            {
              synonymTerms: {
                has: term
              }
            }
          ]
        },

        include: {
          merchant: {
            select: {
              businessName: true,
              rating: true
            }
          }
        },

        orderBy: [
          {
            popularSearchCount:
              "desc"
          },

          {
            viewCount: "desc"
          },

          {
            rating: "desc"
          },

          {
            purchaseCount:
              "desc"
          }
        ],

        take: 50
      });

    // Boost results based on
    // customer affinity
    let boostedProducts =
      products;

    if (userId) {
      const affinities =
        await prisma.customerProductAffinity.findMany(
          {
            where: {
              userId
            },

            select: {
              productId: true,
              overallScore: true
            }
          }
        );

      const affinityMap =
        new Map(
          affinities.map(
            (affinity) => [
              affinity.productId,
              affinity.overallScore
            ]
          )
        );

      boostedProducts =
        products.sort(
          (a, b) => {
            const scoreA =
              toNumber(
                affinityMap.get(
                  a.id
                ) || 0
              );

            const scoreB =
              toNumber(
                affinityMap.get(
                  b.id
                ) || 0
              );

            if (
              scoreA !==
              scoreB
            ) {
              return (
                scoreB -
                scoreA
              );
            }

            return (
              (b.popularSearchCount ||
                0) -
              (a.popularSearchCount ||
                0)
            );
          }
        );
    }

    // Track search for learning
    if (
      userId &&
      searchTerm
    ) {
      await this.trackSearch(
        userId,
        {
          searchTerm,
          resultsCount:
            products.length,

          productsViewed:
            products
              .slice(0, 10)
              .map(
                (product) =>
                  product.id
              ),

          searchSource:
            filters?.source ||
            "search_bar"
        }
      );
    }

    return boostedProducts.slice(
      0,
      20
    );
  }

  // ============================================================
  // GET TRENDING SEARCH TERMS
  // ============================================================

  static async getTrendingSearches(
    limit: number = 10
  ) {
    const trending =
      await prisma.popularSearchTerm.findMany(
        {
          orderBy: {
            searchCount: "desc"
          },

          take: limit
        }
      );

    return trending.map(
      (term) => term.term
    );
  }

  // ============================================================
  // GET SEARCH SUGGESTIONS
  // ============================================================

  static async getSearchSuggestions(
    partialTerm: string,
    limit: number = 5
  ) {
    const term =
      partialTerm.toLowerCase();

    const suggestions =
      await prisma.popularSearchTerm.findMany(
        {
          where: {
            term: {
              contains: term,
              mode: "insensitive"
            }
          },

          orderBy: {
            searchCount: "desc"
          },

          take: limit
        }
      );

    return suggestions.map(
      (suggestion) =>
        suggestion.term
    );
  }
}