import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreatePasabuyRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ maxLength: 250 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  dropoffLocation!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  dropoffLatitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  dropoffLongitude!: number;

  @ApiProperty({ description: 'The requester accepted the Pasabuy terms.' })
  @IsBoolean()
  termsAccepted!: boolean;
}
