import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { GroupPaymentSplitMode } from '@prisma/client';

// BUG-005: the owner's split choice is applied in the same transaction that
// places the order, so it can no longer be lost between two requests.
export class FinalizeGroupOrderDto {
  @ApiPropertyOptional({
    enum: GroupPaymentSplitMode,
    default: GroupPaymentSplitMode.ITEM_BASED,
    description:
      'ITEM_BASED: each member pays for their items. EQUAL: the total is split evenly across all members. ' +
      'CUSTOM: no shares yet; the owner sets each amount with PATCH :groupOrderId/payment-split.',
  })
  @IsOptional()
  @IsEnum(GroupPaymentSplitMode)
  mode?: GroupPaymentSplitMode;
}
