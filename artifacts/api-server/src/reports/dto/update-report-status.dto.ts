import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum ReportReviewStatus {
  IN_REVIEW = 'IN_REVIEW',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

export class UpdateReportStatusDto {
  @ApiProperty({ enum: ReportReviewStatus })
  @IsEnum(ReportReviewStatus)
  status!: ReportReviewStatus;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Required when resolving or dismissing' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
