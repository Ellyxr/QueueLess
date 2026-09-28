import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const active = await prisma.featuredListing.groupBy({
    by: ['vendorId'], where: { status: 'ACTIVE' }, _count: { _all: true },
  });
  const linked = await prisma.payment.groupBy({
    by: ['featuredListingId'], where: { featuredListingId: { not: null } },
    _count: { _all: true },
  });
  const duplicateActive = active.filter(row => row._count._all > 1);
  const duplicatePayments = linked.filter(row => row._count._all > 1);
  console.log(`Vendors with multiple legacy active listings: ${duplicateActive.length}`);
  console.log(`Listings with duplicate payments: ${duplicatePayments.length}`);
  if (duplicateActive.length || duplicatePayments.length) throw new Error('Resolve duplicates before deploying US-043 migrations');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
