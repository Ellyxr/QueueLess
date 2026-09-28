import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum StudentIdDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class ReviewStudentIdDto {
  @ApiProperty({ enum: StudentIdDecision })
  @IsEnum(StudentIdDecision)
  decision!: StudentIdDecision;
}
