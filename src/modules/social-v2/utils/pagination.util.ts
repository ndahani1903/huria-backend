// src/modules/social-v2/utils/pagination.util.ts

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export class PaginationUtil {
  static getPagination(page: number = 1, limit: number = 20): { skip: number; take: number } {
    const take = Math.min(limit, 100);
    const skip = (Math.max(page, 1) - 1) * take;
    return { skip, take };
  }

  static format<T>(
    data: T[],
    total: number,
    page: number,
    limit: number
  ): PaginatedResult<T> {
    const take = Math.min(limit, 100);
    const totalPages = Math.ceil(total / take);

    return {
      data,
      pagination: {
        page,
        limit: take,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  static getCursorPagination(cursor?: string, take: number = 20): { cursor: string | undefined; take: number } {
    return {
      cursor,
      take: Math.min(take, 100),
    };
  }
} 