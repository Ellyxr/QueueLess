import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasabuyFeeTier, Prisma } from '@prisma/client';

const MARKETPLACE_RULE_VERSION = 'MARKETPLACE_PERCENT_V1';
const PASABUY_RULE_VERSION = 'PASABUY_CAMPUS_TIER_V1';

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

    if (!rate.isFinite() || rate.lessThan(0) || rate.greaterThan(100)) {
      throw new BadRequestException(
        'MARKETPLACE_FEE_RATE must be between 0 and 100',
      );
    }

    if (rate.decimalPlaces() > 6) {
      throw new BadRequestException('MARKETPLACE_FEE_RATE supports up to six decimal places');
    }

    return rate;
  }

  calculatePasabuyFee(inCampus: boolean) {
    return {
      feeTier: inCampus ? PasabuyFeeTier.IN_CAMPUS : PasabuyFeeTier.OUTSIDE_CAMPUS,
      amount: new Prisma.Decimal(inCampus ? 30 : 50),
      ruleVersion: PASABUY_RULE_VERSION,
    };
  }

  getPasabuyFeeOptions() {
    return {
      inCampus: this.calculatePasabuyFee(true).amount.toFixed(2),
      outsideCampus: this.calculatePasabuyFee(false).amount.toFixed(2),
    };
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
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    const totalAmount = normalizedSubtotal
      .add(marketplaceFee)
      .toDecimalPlaces(2);

    return {
      subtotal: normalizedSubtotal,
      marketplaceFeeRate,
      marketplaceFee,
      totalAmount,
      ruleVersion: MARKETPLACE_RULE_VERSION,
    };
  }
}
