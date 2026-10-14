import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const REVIEW_COMMENT_MAX_LENGTH = 1000;

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5, description: 'Whole stars, 1 to 5' })
  @IsInt({ message: 'rating must be a whole number from 1 to 5' })
  @Min(1, { message: 'rating must be a whole number from 1 to 5' })
  @Max(5, { message: 'rating must be a whole number from 1 to 5' })
  rating!: number;

  @ApiPropertyOptional({
    maxLength: REVIEW_COMMENT_MAX_LENGTH,
    example: 'Hot and ready right on time.',
    description: 'Optional; trimmed, blank is treated as no comment',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(REVIEW_COMMENT_MAX_LENGTH, {
    message: `comment must be at most ${REVIEW_COMMENT_MAX_LENGTH} characters`,
  })
  comment?: string;
}
