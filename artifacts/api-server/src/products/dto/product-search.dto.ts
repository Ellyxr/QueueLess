import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ProductSearchDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;
}