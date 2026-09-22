import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

@Injectable()
export class PricingService {
  constructor(private readonly configService: ConfigService) {}

  getMarketplaceFeeRate(): Prisma.Decimal {
    const rawRate = this.configService.get<string>(
      'MARKETPLACE_FEE_RATE',
      '0',
    );

    let rate: Prisma.Decimal;

    try {
      rate = new Prisma.Decimal(rawRate);
    } catch {
      throw new BadRequestException(
        'MARKETPLACE_FEE_RATE must be a valid number',
      );
    }

    if (rate.lessThan(0) || rate.greaterThan(100)) {
      throw new BadRequestException(
        'MARKETPLACE_FEE_RATE must be between 0 and 100',
      );
    }

    return rate;
  }

  getPasabuyDeliveryFee(): Prisma.Decimal {
    const rawFee = this.configService.get<string>(
      'PASABUY_DELIVERY_FEE',
      '35',
    );

    let fee: Prisma.Decimal;

    try {
      fee = new Prisma.Decimal(rawFee);
    } catch {
      throw new BadRequestException(
        'PASABUY_DELIVERY_FEE must be a valid number',
      );
    }

    if (fee.lessThan(0)) {
      throw new BadRequestException(
        'PASABUY_DELIVERY_FEE must be zero or greater',
      );
    }

    return fee.toDecimalPlaces(2);
  }

  calculateOrderTotals(subtotal: Prisma.Decimal) {
    if (subtotal.lessThan(0)) {
      throw new BadRequestException(
        'Subtotal must be zero or greater',
      );
    }

    const normalizedSubtotal = subtotal.toDecimalPlaces(2);
    const marketplaceFeeRate = this.getMarketplaceFeeRate();

    const marketplaceFee = normalizedSubtotal
      .mul(marketplaceFeeRate)
      .div(100)
      .toDecimalPlaces(2);

    const totalAmount = normalizedSubtotal
      .add(marketplaceFee)
      .toDecimalPlaces(2);

    return {
      subtotal: normalizedSubtotal,
      marketplaceFeeRate,
      marketplaceFee,
      totalAmount,
    };
  }
}