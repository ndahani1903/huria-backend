import { prisma } from '../../config/db';

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

  static async resolve(disputeId: string) {
    return prisma.dispute.update({
      where: { id: disputeId },
      data: { status: 'resolved' },
    });
  }

  static async reject(disputeId: string) {
    return prisma.dispute.update({
      where: { id: disputeId },
      data: { status: 'rejected' },
    });
  }
}
