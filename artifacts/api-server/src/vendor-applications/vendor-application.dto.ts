import { Type } from 'class-transformer';
import { Equals, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { VendorApplicationDocumentKind, VendorApplicationStatus } from '@prisma/client';
import { VENDOR_TERMS_VERSION } from './vendor-application.policy';
export class SubmitVendorApplicationDto {
  @IsString() @MinLength(1) @MaxLength(100) businessName!: string;
  @IsString() @MinLength(1) @MaxLength(100) foodCategory!: string;
  @IsUUID() validIdDocumentId!: string;
  @IsUUID() idSelfieDocumentId!: string;
  @Matches(/^\d{6,34}$/) bankAccountNumber!: string;
  @IsString() @MinLength(1) @MaxLength(150) bankAccountHolderName!: string;
  @IsUUID() planId!: string;
  @Equals(true) termsAccepted!: boolean;
  @Equals(VENDOR_TERMS_VERSION) termsVersion!: string;
}
export class UploadApplicationDocumentDto {
  @IsEnum(VendorApplicationDocumentKind) kind!: VendorApplicationDocumentKind;
}
export class SubmitContractDto {
  @IsUUID() documentId!: string;
}
enum ReviewAction { APPROVE = 'APPROVE', REJECT = 'REJECT' }
export class ReviewApplicationDto {
  @IsEnum(ReviewAction) action!: ReviewAction;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}
export class RejectContractDto {
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
export class ListVendorApplicationsDto {
  @IsOptional() @IsEnum(VendorApplicationStatus) status?: VendorApplicationStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
