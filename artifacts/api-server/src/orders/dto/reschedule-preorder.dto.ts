import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class ReschedulePreorderDto {
  @ApiProperty({
    description: 'New pickup time (ISO 8601); must be a bookable slot from GET /vendors/:id/preorder-slots.',
    example: '2026-10-16T02:30:00.000Z',
  })
  @IsDateString()
  pickupAt!: string;
}
