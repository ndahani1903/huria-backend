// src/modules/disputes/dispute.service.ts

import { prisma } from '../../config/db';
import { createAuditLog } from '../admin/audit.service';
import { SMSService } from '../../services/sms.service';
import { io } from '../../server';

export class DisputeService {

  // Create a dispute
  static async create(
    orderId: string,
    reason: string
  ) {
    return prisma.dispute.create({
      data: {
        orderId,
        reason,
        status: 'open',
      },
    });
  }

  // Resolve dispute
  static async resolve(
    disputeId: string,
    adminId: string,
    resolution?: string,
    notes?: string
  ) {
    const dispute = await prisma.$transaction(
      async (tx) => {

        // Get dispute with complete order details
        const disputeData =
          await tx.dispute.findUnique({
            where: {
              id: disputeId,
            },
            include: {
              order: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      phone: true,
                    },
                  },

                  merchant: {
                    select: {
                      id: true,
                      businessName: true,
                      phone: true,
                    },
                  },

                  driver: {
                    include: {
                      user: {
                        select: {
                          name: true,
                          phone: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          });

        if (!disputeData) {
          throw new Error(
            'Dispute not found'
          );
        }

        if (disputeData.status !== 'open') {
          throw new Error(
            `Cannot resolve dispute with status: ${disputeData.status}`
          );
        }

        const updated =
          await tx.dispute.update({
            where: {
              id: disputeId,
            },
            data: {
              status: 'resolved',
              resolution:
                resolution ||
                'Resolved by admin',
              resolvedById: adminId,
              resolvedAt: new Date(),
            },
          });

        await createAuditLog({
          adminId,
          action: 'RESOLVE_DISPUTE',
          targetType: 'dispute',
          targetId: dispute.id,
          meta: {
            resolution,
            notes,
          },
        });

        return updated;
      }
    );

    await this.notifyParties(
      disputeId,
      'resolved'
    );

    return dispute;
  }

  // Reject dispute
  static async reject(
    disputeId: string,
    adminId: string,
    resolution?: string,
    notes?: string
  ) {
    const dispute = await prisma.$transaction(
      async (tx) => {

        const disputeData =
          await tx.dispute.findUnique({
            where: {
              id: disputeId,
            },
            include: {
              order: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      phone: true,
                    },
                  },

                  merchant: {
                    select: {
                      id: true,
                      businessName: true,
                      phone: true,
                    },
                  },

                  driver: {
                    include: {
                      user: {
                        select: {
                          name: true,
                          phone: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          });

        if (!disputeData) {
          throw new Error(
            'Dispute not found'
          );
        }

        if (disputeData.status !== 'open') {
          throw new Error(
            `Cannot reject dispute with status: ${disputeData.status}`
          );
        }

        const updated =
          await tx.dispute.update({
            where: {
              id: disputeId,
            },
            data: {
              status: 'rejected',
              resolution:
                resolution ||
                'Rejected by admin',
              resolvedById: adminId,
              resolvedAt: new Date(),
            },
          });

        await createAuditLog({
          adminId,
          action: 'REJECT_DISPUTE',
          targetType: 'dispute',
          targetId: dispute.id,
          meta: {
            resolution,
            notes,
          },
        });

        return updated;
      }
    );

    await this.notifyParties(
      disputeId,
      'rejected'
    );

    return dispute;
  }

  // Get all disputes with details
  static async getAll() {
    return prisma.dispute.findMany({
      include: {
        order: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },

            merchant: {
              select: {
                id: true,
                businessName: true,
                name: true,
                phone: true,
              },
            },

            driver: {
              include: {
                user: {
                  select: {
                    name: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },

        resolvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // Get dispute by ID
  static async getById(
    disputeId: string
  ) {
    return prisma.dispute.findUnique({
      where: {
        id: disputeId,
      },

      include: {
        order: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },

            merchant: {
              select: {
                id: true,
                businessName: true,
                name: true,
                phone: true,
              },
            },

            driver: {
              include: {
                user: {
                  select: {
                    name: true,
                    phone: true,
                  },
                },
              },
            },

            items: {
              include: {
                product: true,
              },
            },
          },
        },

        resolvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  // Get disputes by order
  static async getByOrder(
    orderId: string
  ) {
    return prisma.dispute.findMany({
      where: {
        orderId,
      },

      include: {
        order: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },

            merchant: {
              select: {
                id: true,
                businessName: true,
                name: true,
                phone: true,
              },
            },

            driver: {
              include: {
                user: {
                  select: {
                    name: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },

        resolvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // Get dispute statistics
  static async getStats() {
    const [
      total,
      open,
      resolved,
      rejected,
      byReason,
    ] = await Promise.all([
      prisma.dispute.count(),

      prisma.dispute.count({
        where: {
          status: 'open',
        },
      }),

      prisma.dispute.count({
        where: {
          status: 'resolved',
        },
      }),

      prisma.dispute.count({
        where: {
          status: 'rejected',
        },
      }),

      prisma.dispute.groupBy({
        by: ['reason'],
        _count: true,
      }),
    ]);

    const reasonMap: Record<
      string,
      number
    > = {};

    byReason.forEach((item) => {
      reasonMap[item.reason] =
        item._count;
    });

    return {
      total,
      open,
      resolved,
      rejected,
      byReason: reasonMap,

      resolutionRate:
        total > 0
          ? (
              (resolved / total) *
              100
            ).toFixed(1)
          : 0,
    };
  }

  // Add note to dispute via audit log
  static async addNote(
    disputeId: string,
    adminId: string,
    note: string
  ) {
    const dispute =
      await prisma.dispute.findUnique({
        where: {
          id: disputeId,
        },
      });

    if (!dispute) {
      throw new Error(
        'Dispute not found'
      );
    }

    /*
     * DISPUTE_NOTE_ADDED is not currently
     * declared in the AuditAction type.
     *
     * Keep the audit event name for now,
     * while allowing the existing audit
     * service to accept it without changing
     * the global AuditAction enum blindly.
     */
    await createAuditLog({
      adminId,
      action:
        'DISPUTE_NOTE_ADDED' as any,
      targetType: 'dispute',
      targetId: disputeId,
      meta: {
        note,
      },
    });

    return {
      note,
      addedAt:
        new Date().toISOString(),
      adminId,
    };
  }

  // Notify parties about dispute resolution
  private static async notifyParties(
    disputeId: string,
    status: 'resolved' | 'rejected'
  ) {
    try {
      const dispute =
        await prisma.dispute.findUnique({
          where: {
            id: disputeId,
          },

          include: {
            order: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                  },
                },

                merchant: {
                  select: {
                    id: true,
                    businessName: true,
                    phone: true,
                  },
                },

                driver: {
                  include: {
                    user: {
                      select: {
                        name: true,
                        phone: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

      if (!dispute) {
        return;
      }

      const actionText =
        status === 'resolved'
          ? 'resolved'
          : 'rejected';

      const message =
        `📋 Your dispute for order #${
          dispute.order?.orderId?.slice(-8) ||
          'N/A'
        } has been ${actionText}.`;

      // Notify customer
      if (
        dispute.order?.user?.phone
      ) {
        await SMSService.sendRealSMS(
          dispute.order.user.phone,
          message
        );
      }

      // Notify merchant
      if (
        dispute.order?.merchant?.phone
      ) {
        await SMSService.sendRealSMS(
          dispute.order.merchant.phone,
          message
        );
      }

      // Notify driver
      if (
        dispute.order?.driver?.user?.phone
      ) {
        await SMSService.sendRealSMS(
          dispute.order.driver.user.phone,
          message
        );
      }

      // Emit socket event
      io.emit(
        'admin:dispute-updated',
        {
          disputeId: dispute.id,
          orderId: dispute.orderId,
          status,
          resolvedAt:
            new Date().toISOString(),
        }
      );

    } catch (error) {
      console.error(
        'Failed to send dispute notifications:',
        error
      );
    }
  }
}