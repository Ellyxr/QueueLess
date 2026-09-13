import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

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
}
