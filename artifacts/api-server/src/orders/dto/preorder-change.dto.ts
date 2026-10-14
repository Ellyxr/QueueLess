import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ISO_WITH_OFFSET } from './create-order.dto';

// US-060: a student's changes to their own preorder before the cutoff.

export class ReschedulePreorderDto {
  @ApiProperty({
    description:
      'New pickup time, ISO 8601 with an explicit offset. Same rules as when reserving: ' +
      'in the future, past the lead time, inside a vendor pickup window (Asia/Manila).',
    example: '2026-10-16T09:00:00+08:00',
  })
  @Matches(ISO_WITH_OFFSET, {
    message: 'scheduledPickupAt must be an ISO 8601 date-time with a timezone offset (e.g. +08:00 or Z)',
  })
  scheduledPickupAt!: string;
}

export class CancelPreorderDto {
  @ApiPropertyOptional({ description: 'Optional reason shown to the vendor and on the refund' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
