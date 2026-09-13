import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class CreateGroupOrderDto {
  @ApiPropertyOptional({
    description:
      'Vendor that the group will order from. May be omitted to start an open group order and assign the vendor once the first item is added.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  vendorId?: string;
}
