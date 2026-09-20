import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpsertPasabuyProfileDto {
  @ApiProperty({
    description: 'Student ID required to accept and fulfill Pasabuy requests',
    example: '2023-123456',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  studentId!: string;
}
