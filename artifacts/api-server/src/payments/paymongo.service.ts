import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

interface CreateCheckoutSessionParams {
  amount: number;
  description: string;
  referenceNumber: string;
  orderId: string;
}

interface PaymongoCheckoutSessionResponse {
  data: {
    id: string;
    type: string;
    attributes: {
      checkout_url: string;
      status: string;
    };
  };
}

interface CreateRefundParams {
  paymentResourceId: string;
  amount: number;
  reason?: string;
  notes?: string;
}

interface PaymongoRefundResponse {
  data: {
    id: string;
    type: string;
    attributes: {
      amount?: number;
      currency?: string;
      payment_id?: string;
      reason?: string;
      status: string;
      created_at?: number;
      updated_at?: number;
    };
  };
}

@Injectable()
export class PaymongoService {
  private readonly baseUrl = 'https://api.paymongo.com/v2';

  constructor(private readonly configService: ConfigService) {}

  async createCheckoutSession(
    params: CreateCheckoutSessionParams,
  ): Promise<{
    checkoutSessionId: string;
    checkoutUrl: string;
    status: string;
  }> {
    const secretKey =
      this.configService.get<string>('PAYMONGO_SECRET_KEY');

    const successUrl =
      this.configService.get<string>('PAYMONGO_SUCCESS_URL');

    const cancelUrl =
      this.configService.get<string>('PAYMONGO_CANCEL_URL');

    if (!secretKey || !secretKey.startsWith('sk_test_')) {
      throw new InternalServerErrorException(
        'PayMongo Sandbox secret key is not configured',
      );
    }

    if (!successUrl || !cancelUrl) {
      throw new InternalServerErrorException(
        'PayMongo redirect URLs are not configured',
      );
    }

    const authorization = Buffer.from(
      `${secretKey}:`,
    ).toString('base64');

    const orderIdParam = `orderId=${encodeURIComponent(params.orderId)}`;

    const successUrlWithOrder =
      `${successUrl}${successUrl.includes('?') ? '&' : '?'}${orderIdParam}`;

    const cancelUrlWithOrder =
      `${cancelUrl}${cancelUrl.includes('?') ? '&' : '?'}${orderIdParam}`;

    try {
      const response = await fetch(
        `${this.baseUrl}/checkout_sessions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authorization}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: {
              attributes: {
                line_items: [
                  {
                    currency: 'PHP',
                    amount: params.amount,
                    name: 'QueueLess Order Payment',
                    description: params.description,
                    quantity: 1,
                  },
                ],
                payment_method_types: [
                  'card',
                  'gcash',
                  'paymaya',
                  'grab_pay',
                  'shopee_pay',
                  'qrph',
                ],
                description: params.description,
                reference_number: params.referenceNumber,
                success_url: successUrlWithOrder,
                cancel_url: cancelUrlWithOrder,
                send_email_receipt: false,
                show_description: true,
                show_line_items: true,
              },
            },
          }),
        },
      );

      const responseBody = (await response.json()) as
        | PaymongoCheckoutSessionResponse
        | {
            errors?: Array<{
              code?: string;
              detail?: string;
            }>;
          };

      if (!response.ok) {
        const errorDetail =
          'errors' in responseBody
            ? responseBody.errors?.[0]?.detail
            : undefined;

        throw new BadGatewayException(
          errorDetail
            ? `PayMongo: ${errorDetail}`
            : 'Unable to create PayMongo checkout session',
        );
      }

      const checkout =
        responseBody as PaymongoCheckoutSessionResponse;

      return {
        checkoutSessionId: checkout.data.id,
        checkoutUrl: checkout.data.attributes.checkout_url,
        status: checkout.data.attributes.status,
      };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new BadGatewayException(
        'Unable to connect to PayMongo',
      );
    }
  }

  async createRefund(
    params: CreateRefundParams,
  ): Promise<{
    refundId: string;
    status: string;
  }> {
    const secretKey =
      this.configService.get<string>('PAYMONGO_SECRET_KEY');

    if (!secretKey || !secretKey.startsWith('sk_test_')) {
      throw new InternalServerErrorException(
        'PayMongo Sandbox secret key is not configured',
      );
    }

    if (
      !params.paymentResourceId ||
      !params.paymentResourceId.startsWith('pay_')
    ) {
      throw new BadGatewayException(
        'A valid PayMongo payment resource ID is required',
      );
    }

    if (
      !Number.isInteger(params.amount) ||
      params.amount < 100
    ) {
      throw new BadGatewayException(
        'PayMongo refund amount must be at least PHP 1.00',
      );
    }

    const authorization = Buffer.from(
      `${secretKey}:`,
    ).toString('base64');

    try {
      /*
       * Refunds use PayMongo's v1 endpoint even though checkout
       * sessions use the v2 API.
       */
      const response = await fetch(
        'https://api.paymongo.com/v1/refunds',
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authorization}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: {
              attributes: {
                amount: params.amount,
                payment_id: params.paymentResourceId,
                reason: params.reason ?? 'others',
                notes:
                  params.notes?.trim().slice(0, 255) ||
                  'QueueLess administrator refund',
              },
            },
          }),
        },
      );

      const responseBody = (await response.json()) as
        | PaymongoRefundResponse
        | {
            errors?: Array<{
              code?: string;
              detail?: string;
            }>;
          };

      if (!response.ok) {
        const errorDetail =
          'errors' in responseBody
            ? responseBody.errors?.[0]?.detail
            : undefined;

        throw new BadGatewayException(
          errorDetail
            ? `PayMongo refund failed: ${errorDetail}`
            : 'Unable to create PayMongo refund',
        );
      }

      const refund =
        responseBody as PaymongoRefundResponse;

      return {
        refundId: refund.data.id,
        status: refund.data.attributes.status,
      };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new BadGatewayException(
        'Unable to connect to PayMongo refund service',
      );
    }
  }

  verifyWebhookSignature(
    rawBody: Buffer,
    signatureHeader: string | undefined,
  ): void {
    const webhookSecret =
      this.configService.get<string>(
        'PAYMONGO_WEBHOOK_SECRET',
      );

    if (!webhookSecret) {
      throw new InternalServerErrorException(
        'PayMongo webhook secret is not configured',
      );
    }

    if (!signatureHeader) {
      throw new UnauthorizedException(
        'Missing PayMongo webhook signature',
      );
    }

    const signatureParts = signatureHeader
      .split(',')
      .map((part) => part.trim());

    const timestampPart = signatureParts.find((part) =>
      part.startsWith('t='),
    );

    const testSignaturePart = signatureParts.find((part) =>
      part.startsWith('te='),
    );

    const liveSignaturePart = signatureParts.find((part) =>
      part.startsWith('li='),
    );

    const timestamp = timestampPart?.substring(2);

    if (!timestamp) {
      throw new UnauthorizedException(
        'Invalid PayMongo webhook signature',
      );
    }

    const timestampSeconds = Number(timestamp);

    if (
      !Number.isFinite(timestampSeconds) ||
      !Number.isInteger(timestampSeconds)
    ) {
      throw new UnauthorizedException(
        'Invalid PayMongo webhook timestamp',
      );
    }

    const currentTimestampSeconds = Math.floor(
      Date.now() / 1000,
    );

    const timestampToleranceSeconds = 300;

    if (
      Math.abs(
        currentTimestampSeconds - timestampSeconds,
      ) > timestampToleranceSeconds
    ) {
      throw new UnauthorizedException(
        'Expired PayMongo webhook signature',
      );
    }

    // QueueLess currently uses PayMongo Sandbox,
    // so only test signatures are accepted.
    const receivedSignature =
      testSignaturePart?.substring(3);

    if (
      liveSignaturePart?.substring(3) &&
      !receivedSignature
    ) {
      throw new UnauthorizedException(
        'Live PayMongo webhook signatures are not accepted in Sandbox mode',
      );
    }

    if (!receivedSignature) {
      throw new UnauthorizedException(
        'Invalid PayMongo webhook signature',
      );
    }

    const signedPayload =
      `${timestamp}.${rawBody.toString('utf8')}`;

    const expectedSignature = createHmac(
      'sha256',
      webhookSecret,
    )
      .update(signedPayload)
      .digest('hex');

    const expectedBuffer = Buffer.from(
      expectedSignature,
      'utf8',
    );

    const receivedBuffer = Buffer.from(
      receivedSignature,
      'utf8',
    );

    /*
     * timingSafeEqual requires equal-length buffers.
     * A malformed signature must be rejected instead of allowing
     * timingSafeEqual to throw a RangeError.
     */
    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new UnauthorizedException(
        'Invalid PayMongo webhook signature',
      );
    }
  }
}