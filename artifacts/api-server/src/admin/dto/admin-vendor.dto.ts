import { VendorStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateAdminVendorStatusDto {
  @IsEnum(VendorStatus)
  status!: VendorStatus;
}
