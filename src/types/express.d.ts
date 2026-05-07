import { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        merchantId?: string;
        driverId?: string;
      };
      idempotencyKey?: string;
    }
  }
}