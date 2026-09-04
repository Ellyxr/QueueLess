import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

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
}
