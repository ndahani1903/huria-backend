// src/modules/social-v2/repositories/post.repository.ts

import { prisma } from "../../../config/db";

export class PostRepository {
  /**
   * ============================================================
   * Create Post
   * ============================================================
   */
  static async create(data: any) {
    return prisma.socialPost.create({
      data,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            profilePhoto: true,
            verified: true
          }
        }
      }
    });
  }

  /**
   * ============================================================
   * Find by ID
   * ============================================================
   */
  static async findById(postId: string) {
    return prisma.socialPost.findUnique({
      where: {
        id: postId
      },
      include: {

        author: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            profilePhoto: true,
            verified: true
          }
        },

        media: true,

        _count: {
          select: {
            likes: true,
            comments: true
          }
        }
      }
    });
  }

  /**
   * ============================================================
   * User Posts
   * ============================================================
   */
  static async findUserPosts(
    userId: string,
    skip: number,
    take: number
  ) {
    return prisma.socialPost.findMany({
      where: {
        authorId: userId,
        deletedAt: null
      },

      include: {

        media: true,

        _count: {
          select: {
            likes: true,
            comments: true
          }
        }
      },

      orderBy: {
        createdAt: "desc"
      },

      skip,

      take
    });
  }

  /**
   * ============================================================
   * Delete
   * ============================================================
   */

  static async softDelete(postId: string) {
    return prisma.socialPost.update({

      where: {
        id: postId
      },

      data: {

        deletedAt: new Date()

      }

    });
  }

  /**
   * ============================================================
   * Update Caption
   * ============================================================
   */

  static async updateCaption(
    postId: string,
    caption: string
  ) {

    return prisma.socialPost.update({

      where: {
        id: postId
      },

      data: {
        caption
      }

    });

  }

  /**
   * ============================================================
   * Increment Share Count
   * ============================================================
   */

  static async incrementShares(postId: string) {

    return prisma.socialPost.update({

      where: {
        id: postId
      },

      data: {

        shareCount: {

          increment: 1

        }

      }

    });

  }

  /**
   * ============================================================
   * Increment View Count
   * ============================================================
   */

  static async incrementViews(postId: string) {

    return prisma.socialPost.update({

      where: {
        id: postId
      },

      data: {

        viewCount: {

          increment: 1

        }

      }

    });

  }

  /**
   * ============================================================
   * Exists
   * ============================================================
   */

  static async exists(postId: string) {

    const count = await prisma.socialPost.count({

      where: {

        id: postId,

        deletedAt: null

      }

    });

    return count > 0;

  }

  /**
   * ============================================================
   * Trending
   * ============================================================
   */

  static async getTrending(limit = 20) {

    return prisma.socialPost.findMany({

      where: {

        deletedAt: null,

        visibility: "PUBLIC"

      },

      include: {

        media: true,

        author: {

          select: {

            id: true,

            username: true,

            profilePhoto: true,

            verified: true

          }

        },

        _count: {

          select: {

            likes: true,

            comments: true

          }

        }

      },

      orderBy: [

        {

          likeCount: "desc"

        },

        {

          commentCount: "desc"

        },

        {

          createdAt: "desc"

        }

      ],

      take: limit

    });

  }

} 