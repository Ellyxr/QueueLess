import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// US-066: admin moderation of reviews.

export class HideReviewDto {
  @ApiProperty({ minLength: 3, maxLength: 500, example: 'Abusive language toward the vendor' })
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'A reason of at least 3 characters is required to hide a review' })
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The report that prompted this; it is resolved with the same note if still open',
  })
  @IsOptional()
  @IsUUID()
  reportId?: string;
}

export class RestoreReviewDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}
