import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class VendorReportResponseDto {
  @IsIn(['RESPONSE', 'APPEAL']) kind!: 'RESPONSE' | 'APPEAL';
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) body!: string;
}
export class VendorReportNoticeDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) notice!: string;
}
export class ReviewVendorResponseDto {
  @IsIn(['ACCEPTED', 'REJECTED']) decision!: 'ACCEPTED' | 'REJECTED';
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) note!: string;
}
