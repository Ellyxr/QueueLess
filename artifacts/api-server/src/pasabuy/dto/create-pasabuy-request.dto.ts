import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

const coordinate = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() ? Number(value) : value;

export class PreviewPasabuyRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ maxLength: 250 })
  @IsString()
  @IsOptional()
  @MaxLength(250)
  dropoffLocation?: string;

  @Transform(coordinate)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  dropoffLatitude!: number;

  @Transform(coordinate)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  dropoffLongitude!: number;

}

export class CreatePasabuyRequestDto extends PreviewPasabuyRequestDto {
  @IsOptional() @IsBoolean()
  outsideRadiusConfirmed?: boolean;

  @ApiProperty({ description: 'The requester accepted the Pasabuy terms.' })
  @IsBoolean()
  termsAccepted!: boolean;
}
