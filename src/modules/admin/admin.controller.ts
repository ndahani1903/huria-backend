import { Request, Response } from "express";
import { AdminService } from "./admin.service";
import { prisma } from "../../config/db";
import { Decimal } from "@prisma/client/runtime/library";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import crypto from "crypto";
import { promisify } from "util";
import redis from "../../config/redis";
import bcrypt from "bcrypt";

const execFileAsync = promisify(execFile);

const BACKUP_DIR = path.resolve(process.cwd(), "backups");

// -----------------------------------------------------------------------------
// INITIALIZATION
// -----------------------------------------------------------------------------

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, {
    recursive: true,
    mode: 0o700,
  });
}

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

export const toNumber = (value: unknown): number => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (value instanceof Decimal) {
    return value.toNumber();
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
};

/**
 * Express can type route params as string | string[] depending on the
 * Express/TypeScript definitions being used.
 */
const getParam = (
  value: string | string[] | undefined,
  name = "parameter"
): string => {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (typeof normalized !== "string" || normalized.trim().length === 0) {
    throw new Error(`Missing ${name}`);
  }

  return normalized.trim();
};

/**
 * Validate that a backup filename cannot escape BACKUP_DIR.
 */
const getSafeBackupPath = (filename: string): string => {
  const safeName = path.basename(filename);

  if (
    safeName !== filename ||
    safeName.includes("..") ||
    safeName.includes("/") ||
    safeName.includes("\\")
  ) {
    throw new Error("Invalid backup filename");
  }

  const filepath = path.resolve(BACKUP_DIR, safeName);

  if (
    filepath !== BACKUP_DIR &&
    !filepath.startsWith(`${BACKUP_DIR}${path.sep}`)
  ) {
    throw new Error("Invalid backup path");
  }

  return filepath;
};

/**
 * Parse DATABASE_URL safely.
 */
const getDatabaseConfig = () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  let parsed: URL;

  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Invalid DATABASE_URL");
  }

  if (!parsed.hostname || !parsed.username || !parsed.pathname) {
    throw new Error("Invalid DATABASE_URL");
  }

  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\/+/, ""),
  };
};

/**
 * Audit helper.
 *
 * The existing controller already depends on AuditLog fields adminId,
 * action, targetType and targetId. We intentionally keep this helper limited
 * to those fields so it does not assume an unknown JSON/metadata column.
 */
const writeAuditLog = async (params: {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
}) => {
  try {
    await prisma.auditLog.create({
      data: {
        adminId: params.adminId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
      },
    });
  } catch (error) {
    // Audit failures should be logged, but should not turn a successful
    // administrative operation into a 500 response.
    console.error("Audit log error:", error);
  }
};

// -----------------------------------------------------------------------------
// DASHBOARD / GENERAL ADMIN
// -----------------------------------------------------------------------------

export class AdminController {
  static async stats(req: Request, res: Response) {
    try {
      const data = await AdminService.getStats();
      res.json(data);
    } catch (error) {
      console.error("Stats error:", error);
      res.status(500).json({
        error: "Failed to load admin statistics",
      });
    }
  }

  static async users(req: Request, res: Response) {
    try {
      const data = await AdminService.getUsers();
      res.json(data);
    } catch (error) {
      console.error("Users error:", error);
      res.status(500).json({
        error: "Failed to load users",
      });
    }
  }

  static async updateUser(req: Request, res: Response) {
    try {
      const id = getParam(req.params.id, "user id");
      const { name, email, phone, role } = req.body;

      if (!name || !email || !role) {
        return res.status(400).json({
          error: "Name, email and role are required",
        });
      }

      const user = await prisma.user.update({
        where: { id },
        data: {
          name,
          email,
          phone,
          role,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
        },
      });

      res.json(user);
    } catch (error) {
      console.error("Update user error:", error);

      res.status(500).json({
        error: "Failed to update user",
      });
    }
  }

  static async updateUserStatus(req: Request, res: Response) {
    try {
      const id = getParam(req.params.id, "user id");
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({
          error: "Status is required",
        });
      }

      const user = await prisma.user.update({
        where: { id },
        data: { status },
        select: {
          id: true,
          status: true,
        },
      });

      res.json({
        success: true,
        status: user.status,
      });
    } catch (error) {
      console.error("Update user status error:", error);

      res.status(500).json({
        error: "Failed to update user status",
      });
    }
  }

  static async deleteUser(req: Request, res: Response) {
    try {
      const id = getParam(req.params.id, "user id");

      if (req.user?.id === id) {
        return res.status(400).json({
          error: "Cannot delete your own account",
        });
      }

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          role: true,
        },
      });

      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      await prisma.user.delete({
        where: { id },
      });

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "DELETE_USER",
          targetType: "user",
          targetId: id,
        });
      }

      res.json({
        success: true,
      });
    } catch (error) {
      console.error("Delete user error:", error);

      res.status(500).json({
        error: "Failed to delete user",
      });
    }
  }

  static async getUserActivity(req: Request, res: Response) {
    try {
      const id = getParam(req.params.id, "user id");

      const logs = await prisma.auditLog.findMany({
        where: {
          adminId: id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 50,
      });

      res.json(logs);
    } catch (error) {
      console.error("User activity error:", error);

      res.status(500).json({
        error: "Failed to load user activity",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // ORDERS / DRIVERS / MERCHANTS
  // ---------------------------------------------------------------------------

  static async getOrders(req: Request, res: Response) {
    try {
      const orders = await AdminService.getOrders();
      res.json(orders);
    } catch (error) {
      console.error("Orders error:", error);

      res.status(500).json({
        error: "Failed to load orders",
      });
    }
  }

  static async getDrivers(req: Request, res: Response) {
    try {
      const drivers = await AdminService.getDrivers();
      res.json(drivers);
    } catch (error) {
      console.error("Get drivers error:", error);

      res.status(500).json({
        error: "Failed to load drivers",
      });
    }
  }

  static async getMerchants(req: Request, res: Response) {
    try {
      const merchants = await AdminService.getMerchants();
      res.json(merchants);
    } catch (error) {
      console.error("Get merchants error:", error);

      res.status(500).json({
        error: "Failed to load merchants",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // ANALYTICS
  // ---------------------------------------------------------------------------

  static async getAnalytics(req: Request, res: Response) {
    try {
      const orders = await prisma.order.findMany({
        where: {
          status: "completed",
        },
        select: {
          amount: true,
          deliveryFee: true,
          platformFee: true,
          driverEarning: true,
        },
      });

      const totalRevenue = orders.reduce(
        (sum, order) => sum + toNumber(order.amount),
        0
      );

      const totalDeliveryFees = orders.reduce(
        (sum, order) => sum + toNumber(order.deliveryFee),
        0
      );

      const platformProfit = orders.reduce(
        (sum, order) => sum + toNumber(order.platformFee),
        0
      );

      const driverPayout = orders.reduce(
        (sum, order) => sum + toNumber(order.driverEarning),
        0
      );

      res.json({
        totalOrders: orders.length,
        totalRevenue,
        totalDeliveryFees,
        platformProfit,
        driverPayout,
      });
    } catch (error) {
      console.error("Analytics error:", error);

      res.status(500).json({
        error: "Failed to load analytics",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // DISPUTES
  // ---------------------------------------------------------------------------

  static async getDisputes(req: Request, res: Response) {
    try {
      const disputes = await prisma.dispute.findMany({
        include: {
          order: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                  phone: true,
                },
              },
              driver: {
                include: {
                  user: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
          resolvedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.json(disputes);
    } catch (error) {
      console.error("Disputes error:", error);

      res.status(500).json({
        error: "Failed to load disputes",
      });
    }
  }

  static async updateDispute(req: Request, res: Response) {
    try {
      const id = getParam(req.params.id, "dispute id");
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({
          error: "Status is required",
        });
      }

      const dispute = await prisma.dispute.update({
        where: { id },
        data: {
          status,
          resolvedById:
            status === "resolved" ? req.user?.id ?? undefined : undefined,
        },
      });

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "UPDATE_DISPUTE",
          targetType: "dispute",
          targetId: id,
        });
      }

      res.json({
        success: true,
        dispute,
      });
    } catch (error) {
      console.error("Update dispute error:", error);

      res.status(500).json({
        error: "Failed to update dispute",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // WITHDRAWALS
  // ---------------------------------------------------------------------------

  static async getWithdrawals(req: Request, res: Response) {
    try {
      const withdrawals = await prisma.withdrawal.findMany({
        include: {
          driver: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.json(withdrawals);
    } catch (error) {
      console.error("Withdrawals error:", error);

      res.status(500).json({
        error: "Failed to load withdrawals",
      });
    }
  }

  static async updateWithdrawal(req: Request, res: Response) {
    try {
      const id = getParam(req.params.id, "withdrawal id");
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({
          error: "Status is required",
        });
      }

      const withdrawal = await prisma.withdrawal.update({
        where: { id },
        data: {
          status,
        },
      });

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "UPDATE_WITHDRAWAL",
          targetType: "withdrawal",
          targetId: id,
        });
      }

      res.json({
        success: true,
        withdrawal,
      });
    } catch (error) {
      console.error("Update withdrawal error:", error);

      res.status(500).json({
        error: "Failed to update withdrawal",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // TOP DRIVERS
  // ---------------------------------------------------------------------------

  static async topDrivers(req: Request, res: Response) {
    try {
      const drivers = await prisma.order.groupBy({
        by: ["driverId"],
        _sum: {
          driverEarning: true,
        },
        where: {
          status: "completed",
          driverId: {
            not: null,
          },
        },
        orderBy: {
          _sum: {
            driverEarning: "desc",
          },
        },
        take: 5,
      });

      const driverDetails = await Promise.all(
        drivers.map(async (item) => {
          if (!item.driverId) {
            return null;
          }

          const driver = await prisma.driver.findUnique({
            where: {
              id: item.driverId,
            },
            include: {
              user: {
                select: {
                  name: true,
                  phone: true,
                },
              },
            },
          });

          if (!driver) {
            return null;
          }

          return {
            driverId: driver.id,
            name: driver.user?.name || "Unknown",
            phone: driver.user?.phone || null,
            totalEarnings: toNumber(item._sum.driverEarning),
          };
        })
      );

      res.json(driverDetails.filter(Boolean));
    } catch (error) {
      console.error("Top drivers error:", error);

      res.status(500).json({
        error: "Failed to load top drivers",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  static async exportData(req: Request, res: Response) {
    try {
      const format =
        typeof req.query.format === "string"
          ? req.query.format.toLowerCase()
          : "csv";

      const type =
        typeof req.query.type === "string"
          ? req.query.type.toLowerCase()
          : "orders";

      if (!["csv", "json"].includes(format)) {
        return res.status(400).json({
          error: "Unsupported export format",
        });
      }

      if (!["orders", "users", "financial"].includes(type)) {
        return res.status(400).json({
          error: "Unsupported export type",
        });
      }

      let data: Record<string, unknown>[] = [];
      let filename = "report";

      if (type === "orders") {
        const orders = await prisma.order.findMany({
          include: {
            user: true,
            merchant: true,
            driver: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        data = orders.map((order) => ({
          "Order ID": order.orderId,
          Amount: toNumber(order.amount),
          Status: order.status,
          Customer: order.user?.name || "N/A",
          Merchant: order.merchant?.businessName || "N/A",
          Driver: order.driver?.name || "N/A",
          Date: new Date(order.createdAt).toISOString(),
        }));

        filename = `orders_report_${
          new Date().toISOString().split("T")[0]
        }`;
      }

      if (type === "users") {
        const users = await prisma.user.findMany({
          select: {
            name: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        data = users.map((user) => ({
          Name: user.name,
          Email: user.email,
          Phone: user.phone,
          Role: user.role,
          Status: user.status || "active",
          Joined: new Date(user.createdAt).toISOString(),
        }));

        filename = `users_report_${
          new Date().toISOString().split("T")[0]
        }`;
      }

      if (type === "financial") {
        const completedOrders = await prisma.order.findMany({
          where: {
            status: "completed",
          },
          select: {
            amount: true,
            driverEarning: true,
            platformFee: true,
          },
        });

        const totalRevenue = completedOrders.reduce(
          (sum, order) => sum + toNumber(order.amount),
          0
        );

        const driverPayouts = completedOrders.reduce(
          (sum, order) => sum + toNumber(order.driverEarning),
          0
        );

        const platformFees = completedOrders.reduce(
          (sum, order) => sum + toNumber(order.platformFee),
          0
        );

        data = [
          {
            "Total Revenue": totalRevenue,
            "Driver Payouts": driverPayouts,
            "Platform Fees": platformFees,
            "Report Date": new Date().toISOString(),
          },
        ];

        filename = `financial_report_${
          new Date().toISOString().split("T")[0]
        }`;
      }

      if (format === "json") {
        res.setHeader("Content-Type", "application/json");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}.json"`
        );

        return res.json(data);
      }

      const headers = Object.keys(data[0] || {});

      const escapeCsv = (value: unknown): string => {
        if (value === null || value === undefined) {
          return '""';
        }

        return `"${String(value).replace(/"/g, '""')}"`;
      };

      const rows = [
        headers.map(escapeCsv).join(","),
        ...data.map((row) =>
          headers.map((header) => escapeCsv(row[header])).join(",")
        ),
      ];

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}.csv"`
      );

      res.send(rows.join("\n"));
    } catch (error) {
      console.error("Export error:", error);

      res.status(500).json({
        error: "Failed to export data",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // SETTINGS
  // ---------------------------------------------------------------------------

  static async getSettings(req: Request, res: Response) {
    try {
      const settings = await prisma.systemSettings.findFirst();

      if (!settings) {
        return res.json({
          id: "default",
          platformName: "HURIA Delivery",
          platformFeePercentage: 20,
          minDeliveryFee: 2000,
          maxDeliveryFee: 10000,
          freeDeliveryThreshold: 50000,
          currency: "TZS",
          maintenanceMode: false,
          driverAutoAssignEnabled: true,
          maxDriverDistance: 5,
          autoBackupEnabled: false,
          autoBackupTime: null,
          adminAlertPhones: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      res.json(settings);
    } catch (error) {
      console.error("Get settings error:", error);

      res.status(500).json({
        error: "Failed to load system settings",
      });
    }
  }

  static async saveSettings(req: Request, res: Response) {
    try {
      const {
        platformName,
        platformFeePercentage,
        minDeliveryFee,
        maxDeliveryFee,
        freeDeliveryThreshold,
        currency,
        maintenanceMode,
        driverAutoAssignEnabled,
        maxDriverDistance,
        autoBackupEnabled,
        autoBackupTime,
        adminAlertPhones,
      } = req.body;

      if (!platformName || !currency) {
        return res.status(400).json({
          error: "Platform name and currency are required",
        });
      }

      const platformFee = Number(platformFeePercentage);
      const minimumDelivery = Number(minDeliveryFee);
      const maximumDelivery = Number(maxDeliveryFee);
      const freeThreshold = Number(freeDeliveryThreshold);
      const driverDistance = Number(maxDriverDistance);

      if (
        !Number.isFinite(platformFee) ||
        platformFee < 0 ||
        platformFee > 100
      ) {
        return res.status(400).json({
          error: "Platform fee percentage must be between 0 and 100",
        });
      }

      if (
        !Number.isFinite(minimumDelivery) ||
        !Number.isFinite(maximumDelivery) ||
        minimumDelivery < 0 ||
        maximumDelivery < minimumDelivery
      ) {
        return res.status(400).json({
          error: "Invalid delivery fee configuration",
        });
      }

      if (!Number.isFinite(freeThreshold) || freeThreshold < 0) {
        return res.status(400).json({
          error: "Invalid free delivery threshold",
        });
      }

      if (!Number.isFinite(driverDistance) || driverDistance <= 0) {
        return res.status(400).json({
          error: "Maximum driver distance must be greater than zero",
        });
      }

      const updated = await prisma.systemSettings.upsert({
        where: {
          id: "default",
        },
        update: {
          platformName,
          platformFeePercentage: platformFee,
          minDeliveryFee: minimumDelivery,
          maxDeliveryFee: maximumDelivery,
          freeDeliveryThreshold: freeThreshold,
          currency,
          maintenanceMode: Boolean(maintenanceMode),
          driverAutoAssignEnabled: Boolean(driverAutoAssignEnabled),
          maxDriverDistance: driverDistance,
          autoBackupEnabled:
            typeof autoBackupEnabled === "boolean"
              ? autoBackupEnabled
              : false,
          autoBackupTime: autoBackupTime ?? null,
          adminAlertPhones: Array.isArray(adminAlertPhones)
            ? adminAlertPhones
            : [],
          updatedAt: new Date(),
        },
        create: {
          id: "default",
          platformName,
          platformFeePercentage: platformFee,
          minDeliveryFee: minimumDelivery,
          maxDeliveryFee: maximumDelivery,
          freeDeliveryThreshold: freeThreshold,
          currency,
          maintenanceMode: Boolean(maintenanceMode),
          driverAutoAssignEnabled: Boolean(driverAutoAssignEnabled),
          maxDriverDistance: driverDistance,
          autoBackupEnabled:
            typeof autoBackupEnabled === "boolean"
              ? autoBackupEnabled
              : false,
          autoBackupTime: autoBackupTime ?? null,
          adminAlertPhones: Array.isArray(adminAlertPhones)
            ? adminAlertPhones
            : [],
        },
      });

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "UPDATE_SYSTEM_SETTINGS",
          targetType: "systemSettings",
          targetId: "default",
        });
      }

      res.json(updated);
    } catch (error) {
      console.error("Save settings error:", error);

      res.status(500).json({
        error: "Failed to save system settings",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // BACKUPS
  // ---------------------------------------------------------------------------

  static async createBackup(req: Request, res: Response) {
    let backupFilepath: string | null = null;

    try {
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

      const filename = `backup_${timestamp}.dump`;
      backupFilepath = getSafeBackupPath(filename);

      const database = getDatabaseConfig();

      await execFileAsync(
        "pg_dump",
        [
          "-h",
          database.host,
          "-p",
          database.port,
          "-U",
          database.user,
          "-d",
          database.database,
          "-F",
          "c",
          "-f",
          backupFilepath,
        ],
        {
          env: {
            ...process.env,
            PGPASSWORD: database.password,
          },
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      const stat = await fs.promises.stat(backupFilepath);

      const backup = await prisma.backup.create({
        data: {
          filename,
          size: stat.size,
          type: "manual",
          status: "completed",
          createdAt: new Date(),
        },
      });

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "CREATE_BACKUP",
          targetType: "backup",
          targetId: backup.id,
        });
      }

      res.json({
        success: true,
        backup,
        filename,
      });
    } catch (error) {
      console.error("Backup error:", error);

      if (backupFilepath) {
        try {
          await fs.promises.unlink(backupFilepath);
        } catch {
          // Ignore cleanup failure.
        }
      }

      res.status(500).json({
        error: "Failed to create database backup",
      });
    }
  }

  static async scheduleBackup(req: Request, res: Response) {
    try {
      const { enabled, time } = req.body;

      if (typeof enabled !== "boolean") {
        return res.status(400).json({
          error: "enabled must be a boolean",
        });
      }

      if (enabled) {
        if (
          typeof time !== "string" ||
          !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
        ) {
          return res.status(400).json({
            error: "Backup time must use HH:mm format",
          });
        }
      }

      const schedule = await prisma.systemSettings.upsert({
        where: {
          id: "default",
        },
        update: {
          autoBackupEnabled: enabled,
          autoBackupTime: enabled ? time : null,
          updatedAt: new Date(),
        },
        create: {
          id: "default",
          autoBackupEnabled: enabled,
          autoBackupTime: enabled ? time : null,
        },
      });

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "UPDATE_BACKUP_SCHEDULE",
          targetType: "systemSettings",
          targetId: "default",
        });
      }

      res.json({
        success: true,
        schedule,
      });
    } catch (error) {
      console.error("Schedule backup error:", error);

      res.status(500).json({
        error: "Failed to update backup schedule",
      });
    }
  }

  static async downloadBackup(req: Request, res: Response) {
    try {
      const filename = getParam(
        req.params.filename,
        "backup filename"
      );

      const filepath = getSafeBackupPath(filename);

      try {
        await fs.promises.access(filepath, fs.constants.R_OK);
      } catch {
        return res.status(404).json({
          error: "Backup file not found",
        });
      }

      res.download(filepath, filename, (error) => {
        if (error && !res.headersSent) {
          console.error("Backup download error:", error);

          res.status(500).json({
            error: "Failed to download backup",
          });
        }
      });
    } catch (error) {
      console.error("Download backup error:", error);

      res.status(400).json({
        error: "Invalid backup filename",
      });
    }
  }

  static async restoreBackup(req: Request, res: Response) {
    try {
      const filename = getParam(req.body?.backup, "backup filename");

      const filepath = getSafeBackupPath(filename);

      try {
        await fs.promises.access(filepath, fs.constants.R_OK);
      } catch {
        return res.status(404).json({
          error: "Backup file not found",
        });
      }

      /*
       * Restore is intentionally explicit.
       *
       * The route should additionally be protected by a high-privilege
       * middleware at the routing layer. This endpoint replaces database
       * contents and therefore must never be available to ordinary admins.
       */
      const database = getDatabaseConfig();

      await execFileAsync(
        "pg_restore",
        [
          "-h",
          database.host,
          "-p",
          database.port,
          "-U",
          database.user,
          "-d",
          database.database,
          "-c",
          filepath,
        ],
        {
          env: {
            ...process.env,
            PGPASSWORD: database.password,
          },
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "RESTORE_BACKUP",
          targetType: "backup",
          targetId: filename,
        });
      }

      res.json({
        success: true,
        message: "Database restored successfully",
      });
    } catch (error) {
      console.error("Restore error:", error);

      res.status(500).json({
        error: "Failed to restore database backup",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // API KEYS
  // ---------------------------------------------------------------------------

  static async getApiKeys(req: Request, res: Response) {
    try {
      const apiKeys = await prisma.apiKey.findMany({
        orderBy: {
          createdAt: "desc",
        },
      });

      /*
       * The database contains SHA-256 hashes, not recoverable plaintext keys.
       * Therefore we cannot expose the original key again.
       */
      const maskedKeys = apiKeys.map((key) => ({
        ...key,
        key: "••••••••••••••••••••",
      }));

      res.json(maskedKeys);
    } catch (error) {
      console.error("Get API keys error:", error);

      res.status(500).json({
        error: "Failed to load API keys",
      });
    }
  }

  static async createApiKey(req: Request, res: Response) {
    try {
      const { name, permissions } = req.body;

      if (
        typeof name !== "string" ||
        name.trim().length < 2 ||
        name.trim().length > 100
      ) {
        return res.status(400).json({
          error: "API key name must be between 2 and 100 characters",
        });
      }

      const normalizedPermissions = Array.isArray(permissions)
        ? permissions
            .filter(
              (permission): permission is string =>
                typeof permission === "string" &&
                permission.trim().length > 0
            )
            .map((permission) => permission.trim())
        : ["read"];

      if (normalizedPermissions.length === 0) {
        return res.status(400).json({ error: "At least one permission is required" });
      }

      const apiKey = `pk_${crypto.randomBytes(32).toString("hex")}`;

      const hashedKey = crypto
        .createHash("sha256")
        .update(apiKey)
        .digest("hex");

      const newKey = await prisma.apiKey.create({
        data: {
          name: name.trim(),
          key: hashedKey,
          permissions: normalizedPermissions,
          status: "active",
          createdAt: new Date(),
          lastUsed: null,
        },
      });

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "CREATE_API_KEY",
          targetType: "apiKey",
          targetId: newKey.id,
        });
      }

      /*
       * The plaintext key is returned exactly once.
       */
      res.json({
        success: true,
        id: newKey.id,
        name: newKey.name,
        key: apiKey,
        message:
          "Store this API key securely. It will not be shown again.",
      });
    } catch (error) {
      console.error("Create API key error:", error);

      res.status(500).json({
        error: "Failed to create API key",
      });
    }
  }

  static async revokeApiKey(req: Request, res: Response) {
    try {
      const id = getParam(req.params.id, "API key id");

      const existing = await prisma.apiKey.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
        },
      });

      if (!existing) {
        return res.status(404).json({
          error: "API key not found",
        });
      }

      const updated = await prisma.apiKey.update({
        where: { id },
        data: {
          status: "revoked",
        },
      });

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "REVOKE_API_KEY",
          targetType: "apiKey",
          targetId: id,
        });
      }

      res.json({
        success: true,
        status: updated.status,
      });
    } catch (error) {
      console.error("Revoke API key error:", error);

      res.status(500).json({
        error: "Failed to revoke API key",
      });
    }
  }

  static async updateApiKey(req: Request, res: Response) {
    try {
      const id = getParam(req.params.id, "API key id");
      const { name, permissions, status } = req.body;

      const data: {
        name?: string;
        permissions?: unknown;
        status?: string;
      } = {};

      if (typeof name === "string") {
        const trimmedName = name.trim();

        if (
          trimmedName.length < 2 ||
          trimmedName.length > 100
        ) {
          return res.status(400).json({
            error: "API key name must be between 2 and 100 characters",
          });
        }

        data.name = trimmedName;
      }

      if (permissions !== undefined) {
        if (!Array.isArray(permissions)) {
          return res.status(400).json({
            error: "Permissions must be an array",
          });
        }

        const normalizedPermissions = permissions
          .filter(
            (permission): permission is string =>
              typeof permission === "string" &&
              permission.trim().length > 0
          )
          .map((permission) => permission.trim());

        if (normalizedPermissions.length === 0) {
          return res.status(400).json({ error: "At least one permission is required" });
        }

        data.permissions = normalizedPermissions;
      }

      if (status !== undefined) {
        if (
          typeof status !== "string" ||
          !["active", "revoked"].includes(status)
        ) {
          return res.status(400).json({
            error: "Invalid API key status",
          });
        }

        data.status = status;
      }

      const updated = await prisma.apiKey.update({
        where: { id },
        data,
      });

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "UPDATE_API_KEY",
          targetType: "apiKey",
          targetId: id,
        });
      }

      res.json({
        ...updated,
        key: "••••••••••••••••••••",
      });
    } catch (error) {
      console.error("Update API key error:", error);

      res.status(500).json({
        error: "Failed to update API key",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // SYSTEM HEALTH
  // ---------------------------------------------------------------------------

  static async getSystemHealth(req: Request, res: Response) {
    try {
      const startTime =
        global.serverStartTime instanceof Date
          ? global.serverStartTime
          : new Date();

      const uptimeMs = Math.max(
        0,
        Date.now() - startTime.getTime()
      );

      const uptime = {
        days: Math.floor(
          uptimeMs / (24 * 60 * 60 * 1000)
        ),
        hours: Math.floor(
          (uptimeMs % (24 * 60 * 60 * 1000)) /
            (60 * 60 * 1000)
        ),
        minutes: Math.floor(
          (uptimeMs % (60 * 60 * 1000)) /
            (60 * 1000)
        ),
      };

      let activeSessions = 0;

      try {
        activeSessions = await redis.scard(
          "active_sessions"
        );
      } catch (redisError) {
        console.error(
          "Redis session count error:",
          redisError
        );
      }

      const last24h = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      );

      const [errors, totalRequests] =
        await Promise.all([
          prisma.auditLog.count({
            where: {
              severity: "error",
              createdAt: {
                gte: last24h,
              },
            },
          }),
          prisma.auditLog.count({
            where: {
              createdAt: {
                gte: last24h,
              },
            },
          }),
        ]);

      const errorRate =
        totalRequests > 0
          ? Number(
              ((errors / totalRequests) * 100).toFixed(2)
            )
          : 0;

      const memory = process.memoryUsage();

      /*
       * Node provides process CPU usage, but it is cumulative. We expose
       * the current process CPU counters rather than inventing a fake value.
       */
      const cpuUsage = process.cpuUsage();

      res.json({
        uptime,
        activeSessions,
        errorRate,
        requestsLast24Hours: totalRequests,
        errorsLast24Hours: errors,

        memoryUsage: {
          heapUsedMb: Number(
            (memory.heapUsed / 1024 / 1024).toFixed(2)
          ),
          heapTotalMb: Number(
            (memory.heapTotal / 1024 / 1024).toFixed(2)
          ),
          rssMb: Number(
            (memory.rss / 1024 / 1024).toFixed(2)
          ),
          externalMb: Number(
            (memory.external / 1024 / 1024).toFixed(2)
          ),
        },

        cpuUsage: {
          userMicroseconds: cpuUsage.user,
          systemMicroseconds: cpuUsage.system,
        },

        serverTime: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Health check error:", error);

      res.status(500).json({
        error: "Failed to load system health",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // SUPPORT
  // ---------------------------------------------------------------------------

  static async getSupportTickets(req: Request, res: Response) {
    try {
      const tickets = await prisma.supportTicket.findMany({
        include: {
          user: {
            select: {
              name: true,
              email: true,
              phone: true,
            },
          },
          messages: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const now = new Date();

      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );

      const openTickets = tickets.filter(
        (ticket) =>
          ticket.status === "open" ||
          ticket.status === "in_progress"
      ).length;

      const resolvedToday = tickets.filter(
        (ticket) =>
          ticket.status === "resolved" &&
          new Date(ticket.updatedAt) >= todayStart
      ).length;

      /*
       * Calculate response time from ticket messages instead of returning
       * a hard-coded number.
       */
      let responseTimeTotalMinutes = 0;
      let responseCount = 0;

      for (const ticket of tickets) {
        const messages = [...ticket.messages].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() -
            new Date(b.createdAt).getTime()
        );

        let customerMessageTime: Date | null = null;

        for (const message of messages) {
          if (!message.isAdmin) {
            customerMessageTime = new Date(
              message.createdAt
            );
            continue;
          }

          if (customerMessageTime) {
            const diff =
              new Date(message.createdAt).getTime() -
              customerMessageTime.getTime();

            if (diff >= 0) {
              responseTimeTotalMinutes +=
                diff / 60000;
              responseCount++;
              customerMessageTime = null;
            }
          }
        }
      }

      const avgResponseTime =
        responseCount > 0
          ? Number(
              (
                responseTimeTotalMinutes /
                responseCount
              ).toFixed(1)
            )
          : 0;

      res.json({
        tickets,
        stats: {
          openTickets,
          avgResponseTime,
          resolvedToday,
        },
      });
    } catch (error) {
      console.error("Get tickets error:", error);

      res.status(500).json({
        error: "Failed to load support tickets",
      });
    }
  }

  static async updateSupportTicket(
    req: Request,
    res: Response
  ) {
    try {
      const id = getParam(
        req.params.id,
        "ticket id"
      );

      const { status } = req.body;

      if (!status) {
        return res.status(400).json({
          error: "Status is required",
        });
      }

      const ticket = await prisma.supportTicket.update({
        where: {
          id,
        },
        data: {
          status,
          updatedAt: new Date(),
        },
      });

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "UPDATE_SUPPORT_TICKET",
          targetType: "supportTicket",
          targetId: id,
        });
      }

      res.json({
        success: true,
        ticket,
      });
    } catch (error) {
      console.error("Update ticket error:", error);

      res.status(500).json({
        error: "Failed to update support ticket",
      });
    }
  }

  static async replyToTicket(
    req: Request,
    res: Response
  ) {
    try {
      const id = getParam(
        req.params.id,
        "ticket id"
      );

      const { message } = req.body;
      const adminId = req.user?.id;

      if (!adminId) {
        return res.status(401).json({
          error: "Authentication required",
        });
      }

      if (
        typeof message !== "string" ||
        message.trim().length === 0
      ) {
        return res.status(400).json({
          error: "Message is required",
        });
      }

      const ticket = await prisma.supportTicket.findUnique({
        where: {
          id,
        },
      });

      if (!ticket) {
        return res.status(404).json({
          error: "Support ticket not found",
        });
      }

      const ticketMessage =
        await prisma.supportMessage.create({
          data: {
            ticketId: id,
            senderId: adminId,
            message: message.trim(),
            isAdmin: true,
          },
        });

      await prisma.supportTicket.update({
        where: {
          id,
        },
        data: {
          updatedAt: new Date(),
          status: "in_progress",
        },
      });

      await writeAuditLog({
        adminId,
        action: "REPLY_SUPPORT_TICKET",
        targetType: "supportTicket",
        targetId: id,
      });

      res.json({
        success: true,
        message: ticketMessage,
      });
    } catch (error) {
      console.error("Reply error:", error);

      res.status(500).json({
        error: "Failed to reply to support ticket",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // ROLE MANAGEMENT
  // ---------------------------------------------------------------------------

  static async getRoles(req: Request, res: Response) {
    try {
      const roles = await prisma.userRole.findMany({
        include: {
          permissions: true,
          _count: {
            select: {
              users: true,
            },
          },
        },
      });

      res.json(roles);
    } catch (error) {
      console.error("Get roles error:", error);

      res.status(500).json({
        error: "Failed to load roles",
      });
    }
  }

  static async createRole(req: Request, res: Response) {
    try {
      const {
        name,
        permissions,
        description,
      } = req.body;

      if (
        typeof name !== "string" ||
        name.trim().length < 2
      ) {
        return res.status(400).json({
          error: "Role name is required",
        });
      }

      if (!Array.isArray(permissions)) {
        return res.status(400).json({
          error: "Permissions must be an array",
        });
      }

      const role = await prisma.userRole.create({
        data: {
          name: name.trim(),
          description,
          permissions: {
            create: permissions
              .filter(
                (permission): permission is string =>
                  typeof permission === "string" &&
                  permission.trim().length > 0
              )
              .map((permission) => ({
                name: permission.trim(),
              })),
          },
        },
        include: {
          permissions: true,
          _count: {
            select: {
              users: true,
            },
          },
        },
      });

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "CREATE_ROLE",
          targetType: "userRole",
          targetId: role.id,
        });
      }

      res.json({
        success: true,
        role,
      });
    } catch (error) {
      console.error("Create role error:", error);

      res.status(500).json({
        error: "Failed to create role",
      });
    }
  }

  static async updateRole(req: Request, res: Response) {
    try {
      const id = getParam(
        req.params.id,
        "role id"
      );

      const {
        name,
        permissions,
        description,
      } = req.body;

      if (
        typeof name !== "string" ||
        name.trim().length < 2
      ) {
        return res.status(400).json({
          error: "Role name is required",
        });
      }

      if (!Array.isArray(permissions)) {
        return res.status(400).json({
          error: "Permissions must be an array",
        });
      }

      const permissionNames = permissions.filter(
        (permission): permission is string =>
          typeof permission === "string" &&
          permission.trim().length > 0
      );

      const role = await prisma.$transaction(
        async (tx) => {
          await tx.permission.deleteMany({
            where: {
              userRoleId: id,
            },
          });

          return tx.userRole.update({
            where: {
              id,
            },
            data: {
              name: name.trim(),
              description,
              permissions: {
                create: permissionNames.map(
                  (permission) => ({
                    name: permission.trim(),
                  })
                ),
              },
            },
            include: {
              permissions: true,
              _count: {
                select: {
                  users: true,
                },
              },
            },
          });
        }
      );

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "UPDATE_ROLE",
          targetType: "userRole",
          targetId: id,
        });
      }

      res.json({
        success: true,
        role,
      });
    } catch (error) {
      console.error("Update role error:", error);

      res.status(500).json({
        error: "Failed to update role",
      });
    }
  }

  static async deleteRole(req: Request, res: Response) {
    try {
      const id = getParam(
        req.params.id,
        "role id"
      );

      const role = await prisma.userRole.findUnique({
        where: {
          id,
        },
        include: {
          _count: {
            select: {
              users: true,
            },
          },
        },
      });

      if (!role) {
        return res.status(404).json({
          error: "Role not found",
        });
      }

      if (role.name === "Super Admin") {
        return res.status(403).json({
          error: "Cannot delete Super Admin role",
        });
      }

      if (role._count.users > 0) {
        return res.status(409).json({
          error:
            "Cannot delete a role assigned to users. Reassign those users first.",
        });
      }

      await prisma.$transaction([
        prisma.permission.deleteMany({
          where: {
            userRoleId: id,
          },
        }),
        prisma.userRole.delete({
          where: {
            id,
          },
        }),
      ]);

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "DELETE_ROLE",
          targetType: "userRole",
          targetId: id,
        });
      }

      res.json({
        success: true,
      });
    } catch (error) {
      console.error("Delete role error:", error);

      res.status(500).json({
        error: "Failed to delete role",
      });
    }
  }

  static async getUserRoles(req: Request, res: Response) {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          userRole: {
            select: {
              name: true,
            },
          },
        },
        take: 50,
        orderBy: {
          createdAt: "desc",
        },
      });

      const formattedUsers = users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.userRole?.name || user.role,
      }));

      res.json(formattedUsers);
    } catch (error) {
      console.error("Get user roles error:", error);

      res.status(500).json({
        error: "Failed to load user roles",
      });
    }
  }

  static async assignUserRole(
    req: Request,
    res: Response
  ) {
    try {
      const id = getParam(
        req.params.id,
        "user id"
      );

      const { roleId } = req.body;

      if (
        typeof roleId !== "string" ||
        roleId.trim().length === 0
      ) {
        return res.status(400).json({
          error: "Role ID is required",
        });
      }

      const role = await prisma.userRole.findUnique({
        where: {
          id: roleId,
        },
      });

      if (!role) {
        return res.status(404).json({
          error: "Role not found",
        });
      }

      const user = await prisma.user.update({
        where: {
          id,
        },
        data: {
          userRoleId: roleId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          userRole: {
            select: {
              name: true,
            },
          },
        },
      });

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "ASSIGN_USER_ROLE",
          targetType: "user",
          targetId: id,
        });
      }

      res.json({
        success: true,
        user,
      });
    } catch (error) {
      console.error("Assign role error:", error);

      res.status(500).json({
        error: "Failed to assign user role",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // ADMIN USER MANAGEMENT
  // ---------------------------------------------------------------------------

  static async getAdminUsers(
    req: Request,
    res: Response
  ) {
    try {
      const users = await prisma.user.findMany({
        where: {
          role: "admin",
        },
        include: {
          userRole: {
            include: {
              permissions: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      /*
       * Do not return password hashes.
       */
      const safeUsers = users.map(
        ({ password, ...user }) => user
      );

      res.json(safeUsers);
    } catch (error) {
      console.error("Get admin users error:", error);

      res.status(500).json({
        error: "Failed to load admin users",
      });
    }
  }

  static async createAdminUser(
    req: Request,
    res: Response
  ) {
    try {
      const {
        name,
        email,
        phone,
        password,
        userRoleId,
      } = req.body;

      if (
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof phone !== "string" ||
        typeof password !== "string" ||
        typeof userRoleId !== "string"
      ) {
        return res.status(400).json({
          error:
            "Name, email, phone, password and role are required",
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          error:
            "Password must contain at least 8 characters",
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      const normalizedPhone = phone.trim();

      const role = await prisma.userRole.findUnique({
        where: {
          id: userRoleId,
        },
      });

      if (!role) {
        return res.status(404).json({
          error: "Selected role does not exist",
        });
      }

      const existingUser =
        await prisma.user.findFirst({
          where: {
            OR: [
              {
                email: normalizedEmail,
              },
              {
                phone: normalizedPhone,
              },
            ],
          },
        });

      if (existingUser) {
        return res.status(409).json({
          error:
            "A user with this email or phone already exists",
        });
      }

      const hashedPassword = await bcrypt.hash(
        password,
        12
      );

      const user = await prisma.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          phone: normalizedPhone,
          password: hashedPassword,
          role: "admin",
          userRoleId,
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
        include: {
          userRole: {
            include: {
              permissions: true,
            },
          },
        },
      });

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "CREATE_ADMIN_USER",
          targetType: "user",
          targetId: user.id,
        });
      }

      const {
        password: _password,
        ...safeUser
      } = user;

      res.status(201).json({
        success: true,
        user: safeUser,
      });
    } catch (error) {
      console.error("Create admin user error:", error);

      res.status(500).json({
        error: "Failed to create admin user",
      });
    }
  }

  static async updateAdminUserRole(
    req: Request,
    res: Response
  ) {
    try {
      const id = getParam(
        req.params.id,
        "admin user id"
      );

      const { userRoleId } = req.body;

      if (
        typeof userRoleId !== "string" ||
        userRoleId.trim().length === 0
      ) {
        return res.status(400).json({
          error: "Role ID is required",
        });
      }

      const [user, role] = await Promise.all([
        prisma.user.findUnique({
          where: {
            id,
          },
          include: {
            userRole: true,
          },
        }),
        prisma.userRole.findUnique({
          where: {
            id: userRoleId,
          },
        }),
      ]);

      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      if (user.role !== "admin") {
        return res.status(400).json({
          error: "Selected user is not an admin",
        });
      }

      if (!role) {
        return res.status(404).json({
          error: "Role not found",
        });
      }

      /*
       * Prevent an admin from stripping another Super Admin's role.
       */
      if (
        user.userRole?.name === "Super Admin" &&
        req.user?.id !== id
      ) {
        return res.status(403).json({
          error: "Cannot change another Super Admin's role",
        });
      }

      const updated =
        await prisma.user.update({
          where: {
            id,
          },
          data: {
            userRoleId,
          },
          include: {
            userRole: {
              include: {
                permissions: true,
              },
            },
          },
        });

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "UPDATE_ADMIN_ROLE",
          targetType: "user",
          targetId: id,
        });
      }

      const {
        password: _password,
        ...safeUser
      } = updated;

      res.json({
        success: true,
        user: safeUser,
      });
    } catch (error) {
      console.error("Update admin role error:", error);

      res.status(500).json({
        error: "Failed to update admin role",
      });
    }
  }

  static async deleteAdminUser(
    req: Request,
    res: Response
  ) {
    try {
      const id = getParam(
        req.params.id,
        "admin user id"
      );

      if (req.user?.id === id) {
        return res.status(400).json({
          error: "Cannot delete your own account",
        });
      }

      const user =
        await prisma.user.findUnique({
          where: {
            id,
          },
          include: {
            userRole: true,
          },
        });

      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      if (user.role !== "admin") {
        return res.status(400).json({
          error: "Selected user is not an admin",
        });
      }

      if (
        user.userRole?.name === "Super Admin"
      ) {
        return res.status(403).json({
          error: "Cannot delete Super Admin",
        });
      }

      await prisma.user.delete({
        where: {
          id,
        },
      });

      if (req.user?.id) {
        await writeAuditLog({
          adminId: req.user.id,
          action: "DELETE_ADMIN_USER",
          targetType: "user",
          targetId: id,
        });
      }

      res.json({
        success: true,
      });
    } catch (error) {
      console.error("Delete admin user error:", error);

      res.status(500).json({
        error: "Failed to delete admin user",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // REVENUE
  // ---------------------------------------------------------------------------

  static async getRevenue(
    req: Request,
    res: Response
  ) {
    try {
      const now = new Date();

      const today = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );

      const thisMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      );

      const thisYear = new Date(
        now.getFullYear(),
        0,
        1
      );

      const completedOrders =
        await prisma.order.findMany({
          where: {
            status: "completed",
          },
          select: {
            createdAt: true,
            amount: true,
            finalAmount: true,
          },
        });

      const dailyRevenue =
        completedOrders
          .filter(
            (order) =>
              new Date(order.createdAt) >= today
          )
          .reduce(
            (sum, order) =>
              sum +
              toNumber(
                order.finalAmount ??
                  order.amount
              ),
            0
          );

      const monthlyRevenue =
        completedOrders
          .filter(
            (order) =>
              new Date(order.createdAt) >=
              thisMonth
          )
          .reduce(
            (sum, order) =>
              sum +
              toNumber(
                order.finalAmount ??
                  order.amount
              ),
            0
          );

      const yearlyRevenue =
        completedOrders
          .filter(
            (order) =>
              new Date(order.createdAt) >=
              thisYear
          )
          .reduce(
            (sum, order) =>
              sum +
              toNumber(
                order.finalAmount ??
                  order.amount
              ),
            0
          );

      res.json({
        daily: dailyRevenue,
        monthly: monthlyRevenue,
        yearly: yearlyRevenue,
      });
    } catch (error) {
      console.error("Revenue error:", error);

      res.status(500).json({
        error: "Failed to load revenue",
      });
    }
  }
}

// -----------------------------------------------------------------------------
// LEGACY AUDIT LOG ENDPOINT
// -----------------------------------------------------------------------------

export async function fetchAuditLogs(
  req: Request,
  res: Response
) {
  try {
    const limitRaw = req.query.limit;

    const limit =
      typeof limitRaw === "string"
        ? Math.min(
            Math.max(parseInt(limitRaw, 10) || 50, 1),
            200
          )
        : 50;

    const logs = await prisma.auditLog.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    });

    res.json(logs);
  } catch (error) {
    console.error("Fetch audit logs error:", error);

    res.status(500).json({
      error: "Failed to fetch audit logs",
    });
  }
}