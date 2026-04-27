import { prisma } from "../../config/db";

export type AuditAction =
  | "RESOLVE_DISPUTE"
  | "REJECT_DISPUTE"
  | "APPROVE_WITHDRAWAL"
  | "REJECT_WITHDRAWAL"
  | "UPDATE_ORDER"
  | "ADMIN_LOGIN"
  | "SYSTEM_CHANGE";

interface AuditLogInput {
  adminId: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  meta?: any;
}

export class AuditService {
  static async createLog(data: AuditLogInput) {
    return prisma.auditLog.create({
      data: {
        adminId: data.adminId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        meta: data.meta || {},
      },
    });
  }

  static async getLogs(limit = 50, offset = 0) {
    return prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        admin: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }
}

// 👇 helper export (clean usage)
export const createAuditLog = AuditService.createLog;
export const getAuditLogs = AuditService.getLogs;