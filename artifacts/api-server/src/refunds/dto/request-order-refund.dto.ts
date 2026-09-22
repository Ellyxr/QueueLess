import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const AUTO_REFUND_CATEGORIES = [
  'VENDOR_NOT_ACCEPTED',
  'VENDOR_UNRESPONSIVE',
] as const;

export const DISPUTE_REFUND_CATEGORIES = [
  'WRONG_ITEM',
  'MISSING_ITEM',
  'QUALITY_ISSUE',
  'INCORRECTLY_COMPLETED',
  'DISAGREEMENT',
  'OUTSIDE_WINDOW',
  'OTHER',
] as const;

export const REFUND_REQUEST_CATEGORIES = [
  ...AUTO_REFUND_CATEGORIES,
  ...DISPUTE_REFUND_CATEGORIES,
] as const;

export type RefundRequestCategory = (typeof REFUND_REQUEST_CATEGORIES)[number];

export class RequestOrderRefundDto {
  @IsIn(REFUND_REQUEST_CATEGORIES)
  category!: RefundRequestCategory;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUUID()
  orderItemId?: string;
}
