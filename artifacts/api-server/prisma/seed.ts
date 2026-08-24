import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
  // Reference data only. Feature records are intentionally not seeded.
  await prisma.$connect();
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());