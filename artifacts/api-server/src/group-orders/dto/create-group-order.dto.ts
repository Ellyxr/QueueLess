import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateGroupOrderDto {
  @ApiProperty({
    description: 'Vendor that the group will order from',
    format: 'uuid',
  })
  @IsUUID()
  vendorId!: string;
}
