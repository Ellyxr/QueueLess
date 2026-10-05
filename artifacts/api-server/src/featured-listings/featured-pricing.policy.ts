import { Prisma } from '@prisma/client';

export function listingEndDate(start: Date, days: number, months?: number | null) {
  if (!months) return new Date(start.getTime() + days * 86_400_000);
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end;
}

export function discountedPrice(base: Prisma.Decimal, percent: number) {
  return base.mul(100 - percent).div(100).toDecimalPlaces(2);
}

// One lock order throughout: pricing/introductory allocation, then vendor wallet.
export async function lockFeaturedPricing(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(136, 1)::text AS locked`;
}
export async function lockVendorWallet(tx: Prisma.TransactionClient, vendorId: string) {
  await tx.$queryRaw`SELECT id FROM vendors WHERE id = ${vendorId}::uuid FOR UPDATE`;
}
