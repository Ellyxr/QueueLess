import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDefined, IsOptional, IsUUID, Matches, ValidateIf } from 'class-validator';

// A bare "2026-10-16T08:00" would be read in the server's timezone, so an
// explicit offset is required.
export const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export class CreateOrderDto {
  @ApiProperty({
    description: 'The active cart to convert into an individual order',
    format: 'uuid',
  })
  @IsUUID()
  cartId!: string;

  @ApiPropertyOptional({
    description: 'Optional event associated with the order',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({
    description:
      'Whether the buyer wants a Pasabuy runner to deliver the order instead of picking it up themselves',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPasabuyRequest?: boolean;

  @ApiPropertyOptional({ description: 'Marks an order placed as a vendor preorder', default: false })
  @IsOptional()
  @IsBoolean()
  isPreorder?: boolean;

  @ApiPropertyOptional({
    description:
      'US-057: pickup time for a preorder (required when isPreorder is true). ISO 8601 with ' +
      'an explicit offset, e.g. "2026-10-16T08:00:00+08:00". Must be inside a vendor pickup ' +
      'window (Asia/Manila) and past the minimum lead time.',
    example: '2026-10-16T08:00:00+08:00',
  })
  @ValidateIf((dto: CreateOrderDto) => dto.isPreorder === true || dto.scheduledPickupAt !== undefined)
  @IsDefined({ message: 'scheduledPickupAt is required for a preorder' })
  @Matches(ISO_WITH_OFFSET, {
    message: 'scheduledPickupAt must be an ISO 8601 date-time with a timezone offset (e.g. +08:00 or Z)',
  })
  scheduledPickupAt?: string;
}
