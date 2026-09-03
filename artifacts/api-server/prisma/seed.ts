import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

console.log('DATABASE_URL loaded:', process.env.DATABASE_URL ? 'yes' : 'NO — missing!');

const prisma = new PrismaClient();

const SEED_PASSWORD = 'Password123!';
const SALT_ROUNDS = 10;

async function seed() {
  console.log('Connecting to database...');
  await prisma.$connect();
  console.log('Connected. Seeding...');

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);

  // --- BUYER test account ---
  const buyer = await prisma.user.upsert({
    where: { email: 'buyer@test.queueless.dev' },
    update: {},
    create: {
      email: 'buyer@test.queueless.dev',
      passwordHash,
      fullName: 'Test Buyer',
      studentEmailVerifiedAt: new Date(),
      roleAssignments: {
        create: { role: 'BUYER' },
      },
    },
  });

  // --- VENDOR_OWNER test account (+ a storefront) ---
  const vendorOwner = await prisma.user.upsert({
    where: { email: 'vendor@test.queueless.dev' },
    update: {},
    create: {
      email: 'vendor@test.queueless.dev',
      passwordHash,
      fullName: 'Test Vendor Owner',
      studentEmailVerifiedAt: new Date(),
      roleAssignments: {
        create: { role: 'VENDOR_OWNER' },
      },
      vendorOwned: {
        create: {
          name: 'Test Vendor Stall',
          vendorType: 'STUDENT',
          status: 'ACTIVE',
        },
      },
    },
  });

  // --- Extra vendor-owner accounts for non-ACTIVE statuses (US-009) ---
  const suspendedVendorOwner = await prisma.user.upsert({
    where: { email: 'vendor-suspended@test.queueless.dev' },
    update: {},
    create: {
      email: 'vendor-suspended@test.queueless.dev',
      passwordHash,
      fullName: 'Test Suspended Vendor Owner',
      studentEmailVerifiedAt: new Date(),
      roleAssignments: {
        create: { role: 'VENDOR_OWNER' },
      },
      vendorOwned: {
        create: {
          name: 'Test Suspended Vendor Stall',
          vendorType: 'STUDENT',
          status: 'SUSPENDED',
        },
      },
    },
  });

  const pendingVendorOwner = await prisma.user.upsert({
    where: { email: 'vendor-pending@test.queueless.dev' },
    update: {},
    create: {
      email: 'vendor-pending@test.queueless.dev',
      passwordHash,
      fullName: 'Test Pending Vendor Owner',
      roleAssignments: {
        create: { role: 'VENDOR_OWNER' },
      },
      vendorOwned: {
        create: {
          name: 'Test Pending Vendor Stall',
          vendorType: 'SAMPALOC_LANE',
          status: 'PENDING_APPROVAL',
        },
      },
    },
  });

  // --- Multi-role demonstration accounts (US-006: verify 1 vs 2 active roles) ---

  // Case 1: pure student (BUYER only)
  const studentOnly = await prisma.user.upsert({
    where: { email: 'student-only@test.queueless.dev' },
    update: {},
    create: {
      email: 'student-only@test.queueless.dev',
      passwordHash,
      fullName: 'Student Only',
      studentEmailVerifiedAt: new Date(),
      roleAssignments: {
        create: { role: 'BUYER' },
      },
    },
  });

  // Case 2: external vendor (VENDOR_OWNER only, not a student)
  const externalVendor = await prisma.user.upsert({
    where: { email: 'external-vendor@test.queueless.dev' },
    update: {},
    create: {
      email: 'external-vendor@test.queueless.dev',
      passwordHash,
      fullName: 'External Vendor',
      roleAssignments: {
        create: { role: 'VENDOR_OWNER' },
      },
      vendorOwned: {
        create: {
          name: 'External Vendor Stall',
          vendorType: 'SAMPALOC_LANE',
          status: 'ACTIVE',
        },
      },
    },
  });

  // Case 3: verified student who is ALSO a vendor owner (BUYER + VENDOR_OWNER)
  const studentVendor = await prisma.user.upsert({
    where: { email: 'student-vendor@test.queueless.dev' },
    update: {},
    create: {
      email: 'student-vendor@test.queueless.dev',
      passwordHash,
      fullName: 'Student Vendor',
      studentEmailVerifiedAt: new Date(),
      roleAssignments: {
        create: [{ role: 'BUYER' }, { role: 'VENDOR_OWNER' }],
      },
      vendorOwned: {
        create: {
          name: 'Student Vendor Stall',
          vendorType: 'STUDENT',
          status: 'ACTIVE',
        },
      },
    },
  });

  // --- ADMIN test account ---
  const admin = await prisma.user.upsert({
    where: { email: 'admin@test.queueless.dev' },
    update: {},
    create: {
      email: 'admin@test.queueless.dev',
      passwordHash,
      fullName: 'Test Admin',
      roleAssignments: {
        create: { role: 'ADMIN' },
      },
    },
  });

  console.log('Seeded test accounts (all use password: %s):', SEED_PASSWORD);
  console.log(' - buyer@test.queueless.dev  (BUYER)  id=%s', buyer.id);
  console.log(' - vendor@test.queueless.dev (VENDOR_OWNER, ACTIVE vendor) id=%s', vendorOwner.id);
  console.log(' - vendor-suspended@test.queueless.dev (VENDOR_OWNER, SUSPENDED vendor) id=%s', suspendedVendorOwner.id);
  console.log(' - vendor-pending@test.queueless.dev (VENDOR_OWNER, PENDING_APPROVAL vendor) id=%s', pendingVendorOwner.id);
  console.log(' - student-only@test.queueless.dev (BUYER only) id=%s', studentOnly.id);
  console.log(' - external-vendor@test.queueless.dev (VENDOR_OWNER only) id=%s', externalVendor.id);
  console.log(' - student-vendor@test.queueless.dev (BUYER + VENDOR_OWNER) id=%s', studentVendor.id);
  console.log(' - admin@test.queueless.dev  (ADMIN)  id=%s', admin.id);
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());