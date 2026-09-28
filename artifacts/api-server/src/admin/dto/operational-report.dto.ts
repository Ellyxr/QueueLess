import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class OperationalReportQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'First UTC calendar day, inclusive' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-07', description: 'Last UTC calendar day, inclusive' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
