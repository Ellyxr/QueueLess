import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'teststudent@example.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'TestPassword123!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    example: 'Test Student',
  })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiPropertyOptional({
    example: '09123456789',
  })
  @IsOptional()
  @IsString()
  phone?: string;
}
