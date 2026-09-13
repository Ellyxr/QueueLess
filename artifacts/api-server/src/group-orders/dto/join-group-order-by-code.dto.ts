import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class JoinGroupOrderByCodeDto {
  @ApiProperty({
    description: 'Shareable group order join code',
    example: 'AB12CD',
  })
  @IsString()
  @Length(4, 8)
  code!: string;
}
