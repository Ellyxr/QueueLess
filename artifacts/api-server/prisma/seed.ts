import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as path from 'path';
import * as dotenv from 'dotenv';

// tsx does NOT auto-load .env like the Prisma CLI wrapper does, so load it
// explicitly here — this makes the script work identically whether run via
// `prisma db seed`, `pnpm run prisma:seed`, or `tsx prisma/seed.ts` directly.
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

  // --- VENDOR_OWNER test account (+ a storefront, so downstream stories have data too) ---
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
  console.log(' - vendor@test.queueless.dev (VENDOR_OWNER) id=%s', vendorOwner.id);
  console.log(' - admin@test.queueless.dev  (ADMIN)  id=%s', admin.id);
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());