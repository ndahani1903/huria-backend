import { prisma } from '../../config/db';
import { createAuditLog } from "../admin/audit.service";

export class DisputeService {
  static async create(orderId: string, reason: string) {
    return prisma.dispute.create({
      data: {
        orderId,
        reason,
        status: 'open',
      },
    });
  }

    static async resolve(disputeId: string, adminId: string) {
    const dispute = await prisma.dispute.update({
      where: { id: disputeId },
      data: { status: "resolved" },
    });

    await createAuditLog({
      adminId,
      action: "RESOLVE_DISPUTE",
      targetType: "dispute",
      targetId: dispute.id,
    });

    return dispute;
  }

 static async reject(disputeId: string, adminId: string) {
    const dispute = await prisma.dispute.update({
      where: { id: disputeId },
      data: { status: "rejected" },
    });

    await createAuditLog({
      adminId,
      action: "REJECT_DISPUTE",
      targetType: "dispute",
      targetId: dispute.id,
    });

    return dispute;
  }
}