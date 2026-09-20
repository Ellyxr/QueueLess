import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class AddGroupOrderItemDto {
  @ApiProperty({
    description: 'Product to add to the group order',
    format: 'uuid',
  })
  @IsUUID()
  productId!: string;

  @ApiProperty({
    description: 'Quantity to add',
    example: 1,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  quantity!: number;
}
