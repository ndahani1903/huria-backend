// prisma/seed.ts

import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // ============ CREATE ROLES ============
  console.log('📋 Creating roles...');

  const superAdminRole = await prisma.userRole.upsert({
    where: { name: 'Super Admin' },
    update: {},
    create: {
      name: 'Super Admin',
      description: 'Full system access - everything',
      permissions: {
        create: [
          { name: 'full_access' },
          { name: 'users' },
          { name: 'orders' },
          { name: 'revenue' },
          { name: 'withdrawals' },
          { name: 'analytics' },
          { name: 'disputes' },
          { name: 'settings' },
          { name: 'backup' },
          { name: 'api_keys' }
        ]
      }
    }
  });

  const financeAdminRole = await prisma.userRole.upsert({
    where: { name: 'Finance Admin' },
    update: {},
    create: {
      name: 'Finance Admin',
      description: 'Financial operations - revenue, withdrawals, analytics',
      permissions: {
        create: [
          { name: 'revenue' },
          { name: 'withdrawals' },
          { name: 'analytics' },
          { name: 'financial' }
        ]
      }
    }
  });

  const supportAdminRole = await prisma.userRole.upsert({
    where: { name: 'Support Admin' },
    update: {},
    create: {
      name: 'Support Admin',
      description: 'Customer support - users, disputes, orders',
      permissions: {
        create: [
          { name: 'users' },
          { name: 'orders' },
          { name: 'disputes' },
          { name: 'support' }
        ]
      }
    }
  });

  const operationsAdminRole = await prisma.userRole.upsert({
    where: { name: 'Operations Admin' },
    update: {},
    create: {
      name: 'Operations Admin',
      description: 'Daily operations - drivers, merchants, manual dispatch',
      permissions: {
        create: [
          { name: 'drivers' },
          { name: 'merchants' },
          { name: 'orders' },
          { name: 'manual_assign' },
          { name: 'manual_dispatch' }
        ]
      }
    }
  });

  const viewerRole = await prisma.userRole.upsert({
    where: { name: 'Viewer' },
    update: {},
    create: {
      name: 'Viewer',
      description: 'Read-only access',
      permissions: {
        create: [
          { name: 'read_only' },
          { name: 'analytics' }
        ]
      }
    }
  });

  console.log('✅ Roles created successfully!');

  // ============ CREATE ADMIN USERS ============
  console.log('👤 Creating admin users...');

  const adminUsers = [
    {
      name: 'Super Admin',
      email: 'grayson@huria.com',
      phone: '+255734053313',
      password: 'Temperature@1903#?',
      role: 'admin' as Role,
      roleId: superAdminRole.id,
      isSuperAdmin: true
    },
    {
      name: 'Finance Admin',
      email: 'finance@huria.com',
      phone: '+255712345678',
      password: 'Finance@2024#Secure',
      role: 'admin' as Role,
      roleId: financeAdminRole.id,
      isSuperAdmin: false
    },
    {
      name: 'Support Admin',
      email: 'support@huria.com',
      phone: '+255723456789',
      password: 'Support@2024#Help',
      role: 'admin' as Role,
      roleId: supportAdminRole.id,
      isSuperAdmin: false
    },
    {
      name: 'Operations Admin',
      email: 'operations@huria.com',
      phone: '+255734567890',
      password: 'Ops@2024#Dispatch',
      role: 'admin' as Role,
      roleId: operationsAdminRole.id,
      isSuperAdmin: false
    },
    {
      name: 'Viewer',
      email: 'viewer@huria.com',
      phone: '+255745678901',
      password: 'View@2024#Only',
      role: 'admin' as Role,
      roleId: viewerRole.id,
      isSuperAdmin: false
    }
  ];

  for (const admin of adminUsers) {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: admin.email }
    });

    if (existingUser) {
      console.log(`⚠️ User ${admin.email} already exists, skipping...`);
      continue;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(admin.password, 12);

    // Generate verification token
    const verifyToken = crypto.randomBytes(32).toString('hex');

    // Create user
    const user = await prisma.user.create({
      data: {
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        password: hashedPassword,
        role: admin.role,
        userRoleId: admin.roleId,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        verifyToken,
        verifyTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    console.log(`✅ Created admin: ${admin.name} (${admin.email})`);

    // If super admin, also create a merchant and driver record? (Optional)
    // This is useful for testing
    if (admin.isSuperAdmin) {
      // Create a test merchant for super admin
      const existingMerchant = await prisma.merchant.findUnique({
        where: { userId: user.id }
      });

      if (!existingMerchant) {
        await prisma.merchant.create({
          data: {
            userId: user.id,
            name: admin.name,
            phone: admin.phone,
            businessName: 'HURIA HQ',
            businessType: 'Administration',
            merchantType: 'GENERAL_ECOMMERCE',
            pickupAddress: 'Dar es Salaam, Tanzania',
            pickupLat: -6.7924,
            pickupLng: 39.2083,
            tier: 'premium',
            commissionRate: 0.02,
            verified: true,
            totalRevenue: 0,
            createdAt: new Date()
          }
        });
        console.log(`✅ Created test merchant for super admin`);
      }

      // Create test driver
      const existingDriver = await prisma.driver.findUnique({
        where: { userId: user.id }
      });

      if (!existingDriver) {
        await prisma.driver.create({
          data: {
            userId: user.id,
            name: admin.name,
            phone: admin.phone,
            licenseNumber: 'TEST-123456',
            nidaNumber: 'TEST-123456-789',
            status: 'available',
            vehicleType: 'car',
            vehiclePlate: 'TEST-1234',
            isActive: true,
            rating: 5.0,
            totalDeliveries: 0,
            totalEarnings: 0,
            createdAt: new Date()
          }
        });
        console.log(`✅ Created test driver for super admin`);
      }
    }
  }

  console.log('\n✅ Seeding completed successfully!');
  console.log('\n📋 ADMIN CREDENTIALS:');
  console.log('─────────────────────────────────');
  console.log('Super Admin:   grayson@huria.com');
  console.log('Password:      Temperature@1903#?');
  console.log('─────────────────────────────────');
  console.log('Finance Admin: finance@huria.com');
  console.log('Password:      Finance@2024#Secure');
  console.log('─────────────────────────────────');
  console.log('Support Admin: support@huria.com');
  console.log('Password:      Support@2024#Help');
  console.log('─────────────────────────────────');
  console.log('Ops Admin:     operations@huria.com');
  console.log('Password:      Ops@2024#Dispatch');
  console.log('─────────────────────────────────');
  console.log('Viewer:        viewer@huria.com');
  console.log('Password:      View@2024#Only');
  console.log('─────────────────────────────────');

  console.log('\n⚠️ IMPORTANT: Change passwords after first login!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });