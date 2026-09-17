// prisma/seed.ts

import "dotenv/config";

import {
  PrismaClient,
  Role,
} from "@prisma/client";

import bcrypt from "bcrypt";

import {
  normalizeTZPhone,
} from "../src/utils/phone";

const prisma = new PrismaClient();

/**
 * ============================================================
 * TYPES
 * ============================================================
 */

type RoleSeedConfig = {
  name: string;
  description: string;
  permissions: string[];
};

type AdminSeedConfig = {
  name: string;
  emailEnv: string;
  phoneEnv: string;
  passwordEnv: string;
  roleId: string;
  isSuperAdmin: boolean;
};

/**
 * ============================================================
 * ENVIRONMENT HELPERS
 * ============================================================
 */

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`
    );
  }

  return value;
}

function booleanEnv(
  name: string,
  defaultValue = false
): boolean {
  const value = process.env[name]
    ?.trim()
    .toLowerCase();

  if (!value) {
    return defaultValue;
  }

  return [
    "true",
    "1",
    "yes",
    "on",
  ].includes(value);
}

/**
 * ============================================================
 * NORMALIZATION
 * ============================================================
 */

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  return normalizeTZPhone(phone.trim());
}

/**
 * ============================================================
 * ROLE + PERMISSION SEEDING
 * ============================================================
 *
 * This function is fully idempotent.
 *
 * Example:
 *
 * Deployment #1:
 *   creates role
 *   creates permissions
 *
 * Deployment #2:
 *   finds existing role
 *   updates description
 *   keeps desired permissions
 *
 * If a permission is removed from this seed:
 *
 * Deployment #3:
 *   removes that obsolete permission
 *
 * This works because your Permission model has:
 *
 * @@unique([userRoleId, name])
 * ============================================================
 */

async function upsertRole(
  config: RoleSeedConfig
) {
  const role = await prisma.userRole.upsert({
    where: {
      name: config.name,
    },

    update: {
      description: config.description,
    },

    create: {
      name: config.name,
      description: config.description,
    },
  });

  /**
   * ----------------------------------------------------------
   * RECONCILE PERMISSIONS
   * ----------------------------------------------------------
   */

  await prisma.$transaction(async (tx) => {
    /**
     * Remove permissions that are no longer part of the
     * desired configuration.
     *
     * Example:
     *
     * Old:
     *   users
     *   orders
     *   revenue
     *
     * New:
     *   users
     *   orders
     *
     * "revenue" will be removed.
     */

    await tx.permission.deleteMany({
      where: {
        userRoleId: role.id,

        name: {
          notIn: config.permissions,
        },
      },
    });

    /**
     * Create missing permissions.
     *
     * Existing permissions are left untouched.
     */

    for (const permissionName of config.permissions) {
      await tx.permission.upsert({
        where: {
          userRoleId_name: {
            userRoleId: role.id,
            name: permissionName,
          },
        },

        update: {},

        create: {
          name: permissionName,
          userRoleId: role.id,
        },
      });
    }
  });

  console.log(
    `✅ Role reconciled: ${config.name}`
  );

  return role;
}

/**
 * ============================================================
 * CREATE ALL ROLES
 * ============================================================
 */

async function seedRoles() {
  console.log("");
  console.log("📋 Seeding roles and permissions...");

  const superAdminRole = await upsertRole({
    name: "Super Admin",

    description:
      "Full system access - everything",

    permissions: [
      "full_access",
      "users",
      "orders",
      "revenue",
      "withdrawals",
      "analytics",
      "disputes",
      "settings",
      "backup",
      "api_keys",
    ],
  });

  const financeAdminRole = await upsertRole({
    name: "Finance Admin",

    description:
      "Financial operations - revenue, withdrawals, analytics",

    permissions: [
      "revenue",
      "withdrawals",
      "analytics",
      "financial",
    ],
  });

  const supportAdminRole = await upsertRole({
    name: "Support Admin",

    description:
      "Customer support - users, disputes, orders",

    permissions: [
      "users",
      "orders",
      "disputes",
      "support",
    ],
  });

  const operationsAdminRole = await upsertRole({
    name: "Operations Admin",

    description:
      "Daily operations - drivers, merchants, manual dispatch",

    permissions: [
      "drivers",
      "merchants",
      "orders",
      "manual_assign",
      "manual_dispatch",
    ],
  });

  const viewerRole = await upsertRole({
    name: "Viewer",

    description:
      "Read-only access",

    permissions: [
      "read_only",
      "analytics",
    ],
  });

  console.log(
    "✅ All roles and permissions reconciled successfully"
  );

  return {
    superAdminRole,
    financeAdminRole,
    supportAdminRole,
    operationsAdminRole,
    viewerRole,
  };
}

/**
 * ============================================================
 * CREATE / RECONCILE ADMIN
 * ============================================================
 *
 * Existing users:
 *
 * - Role is corrected
 * - UserRole is corrected
 * - Phone is normalized
 * - Account is activated
 * - Verification state is maintained
 * - Password is NOT changed
 * - Refresh token is NOT changed
 *
 * New users:
 *
 * - Password is hashed with bcrypt
 * - Account is created as verified
 * ============================================================
 */

async function createOrReconcileAdmin(
  config: AdminSeedConfig
) {
  const email = normalizeEmail(
    requiredEnv(config.emailEnv)
  );

  const phone = normalizePhone(
    requiredEnv(config.phoneEnv)
  );

  const password = requiredEnv(
    config.passwordEnv
  );

  /**
   * ----------------------------------------------------------
   * FIND EXISTING USER
   * ----------------------------------------------------------
   */

  const existingUser =
    await prisma.user.findUnique({
      where: {
        email,
      },
    });

  /**
   * ----------------------------------------------------------
   * EXISTING USER
   * ----------------------------------------------------------
   */

  if (existingUser) {
    /**
     * We intentionally DO NOT update:
     *
     * - password
     * - refreshTokenHash
     *
     * A deployment must never unexpectedly change an
     * administrator's password.
     */

    await prisma.user.update({
      where: {
        id: existingUser.id,
      },

      data: {
        name: config.name,

        phone,

        role: Role.admin,

        userRoleId: config.roleId,

        status: "active",

        emailVerified: true,

        emailVerifiedAt:
          existingUser.emailVerifiedAt ??
          new Date(),

        phoneVerified: true,

        phoneVerifiedAt:
          existingUser.phoneVerifiedAt ??
          new Date(),

        /**
         * Seeded administrators do not need active
         * email/phone verification tokens.
         */

        verifyToken: null,

        verifyTokenExpires: null,

        phoneOTP: null,

        phoneOTPExpiresAt: null,

        phoneOTPAttempts: 0,
      },
    });

    console.log(
      `♻️ Reconciled admin: ${config.name} (${email})`
    );

    return existingUser;
  }

  /**
   * ----------------------------------------------------------
   * NEW ADMIN
   * ----------------------------------------------------------
   */

  const passwordHash = await bcrypt.hash(
    password,
    12
  );

  const user = await prisma.user.create({
    data: {
      name: config.name,

      email,

      phone,

      password: passwordHash,

      role: Role.admin,

      userRoleId: config.roleId,

      status: "active",

      /**
       * Seeded admin accounts are trusted system
       * accounts, so they start verified.
       */

      emailVerified: true,

      emailVerifiedAt: new Date(),

      phoneVerified: true,

      phoneVerifiedAt: new Date(),

      verifyToken: null,

      verifyTokenExpires: null,

      phoneOTP: null,

      phoneOTPExpiresAt: null,

      phoneOTPAttempts: 0,
    },
  });

  console.log(
    `✅ Created admin: ${config.name} (${email})`
  );

  return user;
}

/**
 * ============================================================
 * OPTIONAL TEST DATA
 * ============================================================
 *
 * Production:
 *
 *   SEED_TEST_DATA=false
 *
 * Development:
 *
 *   SEED_TEST_DATA=true
 *
 * This creates:
 *
 * - HURIA HQ merchant
 * - TEST driver
 *
 * only when explicitly enabled.
 * ============================================================
 */

async function seedTestData(
  superAdminUserId: string,
  superAdminName: string,
  superAdminPhone: string
) {
  const enabled = booleanEnv(
    "SEED_TEST_DATA",
    false
  );

  if (!enabled) {
    console.log(
      "ℹ️ Test data disabled"
    );

    return;
  }

  console.log(
    "🧪 SEED_TEST_DATA=true — creating development test data..."
  );

  const phone = normalizePhone(
    superAdminPhone
  );

  /**
   * ----------------------------------------------------------
   * TEST MERCHANT
   * ----------------------------------------------------------
   */

  const existingMerchant =
    await prisma.merchant.findUnique({
      where: {
        userId: superAdminUserId,
      },
    });

  if (!existingMerchant) {
    await prisma.merchant.create({
      data: {
        userId: superAdminUserId,

        name: superAdminName,

        phone,

        businessName: "HURIA HQ",

        businessType: "Administration",

        merchantType:
          "GENERAL_ECOMMERCE",

        pickupAddress:
          "Dar es Salaam, Tanzania",

        pickupLat: -6.7924,

        pickupLng: 39.2083,

        tier: "premium",

        commissionRate: 0.02,

        verified: true,

        totalRevenue: 0,
      },
    });

    console.log(
      "✅ Created test merchant"
    );
  } else {
    console.log(
      "ℹ️ Test merchant already exists"
    );
  }

  /**
   * ----------------------------------------------------------
   * TEST DRIVER
   * ----------------------------------------------------------
   */

  const existingDriver =
    await prisma.driver.findUnique({
      where: {
        userId: superAdminUserId,
      },
    });

  if (!existingDriver) {
    const driver =
      await prisma.driver.create({
        data: {
          userId: superAdminUserId,

          name: superAdminName,

          phone,

          licenseNumber:
            "TEST-123456",

          nidaNumber:
            "TEST-123456-789",

          status: "available",

          vehicleType: "car",

          vehiclePlate:
            "TEST-1234",

          isActive: true,

          isBusy: false,

          rating: 5.0,

          totalDeliveries: 0,

          totalEarnings: 0,
        },
      });

    /**
     * Add development test driver to Redis
     * availability set.
     */

    try {
      const redisModule =
        await import(
          "../src/config/redis"
        );

      const redis = redisModule.default;

      await redis.sadd(
        "drivers:available",
        driver.id
      );

      console.log(
        "✅ Added test driver to Redis availability"
      );
    } catch (error) {
      /**
       * Test data creation should not make the entire
       * seed fail simply because Redis isn't available.
       */

      console.warn(
        "⚠️ Test driver created, but Redis availability registration failed."
      );

      console.warn(error);
    }

    console.log(
      "✅ Created test driver"
    );
  } else {
    console.log(
      "ℹ️ Test driver already exists"
    );
  }
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

async function main() {
  console.log("");
  console.log(
    "=========================================="
  );
  console.log(
    "🌱 HURIA DATABASE SEED"
  );
  console.log(
    "=========================================="
  );

  /**
   * ----------------------------------------------------------
   * STEP 1
   * ROLES + PERMISSIONS
   * ----------------------------------------------------------
   */

  const {
    superAdminRole,
    financeAdminRole,
    supportAdminRole,
    operationsAdminRole,
    viewerRole,
  } = await seedRoles();

  /**
   * ----------------------------------------------------------
   * STEP 2
   * ADMIN CONFIGURATION
   * ----------------------------------------------------------
   *
   * Every credential comes from the deployment environment.
   * Nothing sensitive is hardcoded.
   * ----------------------------------------------------------
   */

  const superAdminConfig: AdminSeedConfig = {
    name: "Super Admin",

    emailEnv:
      "SUPER_ADMIN_EMAIL",

    phoneEnv:
      "SUPER_ADMIN_PHONE",

    passwordEnv:
      "SUPER_ADMIN_PASSWORD",

    roleId:
      superAdminRole.id,

    isSuperAdmin: true,
  };

  const financeAdminConfig: AdminSeedConfig = {
    name: "Finance Admin",

    emailEnv:
      "FINANCE_ADMIN_EMAIL",

    phoneEnv:
      "FINANCE_ADMIN_PHONE",

    passwordEnv:
      "FINANCE_ADMIN_PASSWORD",

    roleId:
      financeAdminRole.id,

    isSuperAdmin: false,
  };

  const supportAdminConfig: AdminSeedConfig = {
    name: "Support Admin",

    emailEnv:
      "SUPPORT_ADMIN_EMAIL",

    phoneEnv:
      "SUPPORT_ADMIN_PHONE",

    passwordEnv:
      "SUPPORT_ADMIN_PASSWORD",

    roleId:
      supportAdminRole.id,

    isSuperAdmin: false,
  };

  const operationsAdminConfig: AdminSeedConfig = {
    name: "Operations Admin",

    emailEnv:
      "OPERATIONS_ADMIN_EMAIL",

    phoneEnv:
      "OPERATIONS_ADMIN_PHONE",

    passwordEnv:
      "OPERATIONS_ADMIN_PASSWORD",

    roleId:
      operationsAdminRole.id,

    isSuperAdmin: false,
  };

  const viewerConfig: AdminSeedConfig = {
    name: "Viewer",

    emailEnv:
      "VIEWER_ADMIN_EMAIL",

    phoneEnv:
      "VIEWER_ADMIN_PHONE",

    passwordEnv:
      "VIEWER_ADMIN_PASSWORD",

    roleId:
      viewerRole.id,

    isSuperAdmin: false,
  };

  const adminConfigs: AdminSeedConfig[] = [
    superAdminConfig,
    financeAdminConfig,
    supportAdminConfig,
    operationsAdminConfig,
    viewerConfig,
  ];

  /**
   * ----------------------------------------------------------
   * STEP 3
   * ADMIN USERS
   * ----------------------------------------------------------
   */

  console.log("");
  console.log(
    "👤 Creating/reconciling admin accounts..."
  );

  let superAdminUserId:
    | string
    | null = null;

  let superAdminPhone:
    | string
    | null = null;

  for (const config of adminConfigs) {
    const user =
      await createOrReconcileAdmin(
        config
      );

    if (config.isSuperAdmin) {
      superAdminUserId =
        user.id;

      superAdminPhone =
        requiredEnv(
          config.phoneEnv
        );
    }
  }

  /**
   * ----------------------------------------------------------
   * STEP 4
   * OPTIONAL TEST DATA
   * ----------------------------------------------------------
   */

  if (
    superAdminUserId &&
    superAdminPhone
  ) {
    await seedTestData(
      superAdminUserId,
      superAdminConfig.name,
      superAdminPhone
    );
  }

  /**
   * ----------------------------------------------------------
   * COMPLETE
   * ----------------------------------------------------------
   */

  console.log("");
  console.log(
    "=========================================="
  );
  console.log(
    "✅ DATABASE SEEDING COMPLETED"
  );
  console.log(
    "=========================================="
  );
  console.log("");

  console.log(
    "🔐 Admin passwords were not printed."
  );

  console.log(
    "🔐 Credentials are managed through environment variables."
  );

  console.log("");
}

/**
 * ============================================================
 * EXECUTION
 * ============================================================
 */

main()
  .catch((error) => {
    console.error("");
    console.error(
      "=========================================="
    );
    console.error(
      "❌ DATABASE SEEDING FAILED"
    );
    console.error(
      "=========================================="
    );

    if (error instanceof Error) {
      console.error(
        error.message
      );
    } else {
      console.error(
        error
      );
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
