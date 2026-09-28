import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [negativeOrders, negativePasabuy, orders, requests] = await Promise.all([
    prisma.order.count({ where: { marketplaceFee: { lt: 0 } } }),
    prisma.pasabuyRequest.count({ where: { convenienceFee: { lt: 0 } } }),
    prisma.order.count(),
    prisma.pasabuyRequest.count(),
  ]);
  console.log(`Historical orders to snapshot: ${orders}`);
  console.log(`Historical Pasabuy requests to snapshot: ${requests}`);
  console.log(`Negative historical fee amounts: ${negativeOrders + negativePasabuy}`);
  if (negativeOrders || negativePasabuy) {
    throw new Error('Resolve negative historical fee amounts before deploying US-044');
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
