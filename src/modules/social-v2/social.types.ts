 // src/modules/social-v2/social.types.ts

export type FeedType =
  | "FOR_YOU"
  | "FOLLOWING"
  | "TRENDING"
  | "NEARBY";

export type PostVisibility =
  | "PUBLIC"
  | "FOLLOWERS"
  | "PRIVATE";

export type NotificationType =
  | "LIKE"
  | "COMMENT"
  | "FOLLOW"
  | "MENTION"
  | "REPLY"
  | "SHARE"
  | "MESSAGE"
  | "STORY"
  | "REPOST";

export type MessageType =
  | "TEXT"
  | "IMAGE"
  | "VIDEO"
  | "AUDIO"
  | "FILE"
  | "LOCATION";

export type StoryPrivacy =
  | "PUBLIC"
  | "FOLLOWERS"
  | "CLOSE_FRIENDS";

export interface Pagination {
  page: number;
  limit: number;
}

export interface CursorPagination {
  cursor?: string;
  take: number;
}

export interface FeedOptions extends CursorPagination {
  userId: string;
  type: FeedType;
}

export interface CreatePostInput {
  caption?: string;
  media: string[];
  visibility: PostVisibility;
  location?: string;
}

export interface CreateStoryInput {
  media: string;
  caption?: string;
  privacy: StoryPrivacy;
}

export interface SearchOptions {
  query: string;
  page: number;
  limit: number;
}

export interface SocketUser {
  socketId: string;
  userId: string;
}

export interface FeedItemScore {
  score: number;
  reason: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  page: number;
  limit: number;
  hasMore: boolean;
  data: T[];
}