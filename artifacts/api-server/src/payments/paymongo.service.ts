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
  orderId?: string;
  pasabuyRequestId?: string;
  vendorSubscriptionId?: string;
  itemName?: string;
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
  idempotencyKey: string;
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

    const redirectParam = params.pasabuyRequestId
      ? `pasabuyRequestId=${encodeURIComponent(params.pasabuyRequestId)}`
      : params.vendorSubscriptionId
        ? `vendorSubscriptionId=${encodeURIComponent(params.vendorSubscriptionId)}`
        : `orderId=${encodeURIComponent(params.orderId ?? '')}`;

    const successUrlWithOrder =
      `${successUrl}${successUrl.includes('?') ? '&' : '?'}${redirectParam}`;

    const cancelUrlWithOrder =
      `${cancelUrl}${cancelUrl.includes('?') ? '&' : '?'}${redirectParam}`;

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
                    name: params.itemName ?? 'QueueLess Order Payment',
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

  async expireCheckoutSession(checkoutSessionId: string): Promise<boolean> {
    const secretKey = this.configService.get<string>('PAYMONGO_SECRET_KEY');
    if (!secretKey || !secretKey.startsWith('sk_test_')) {
      throw new InternalServerErrorException('PayMongo Sandbox secret key is not configured');
    }
    if (!/^cs_[A-Za-z0-9]+$/.test(checkoutSessionId)) {
      throw new BadGatewayException('Invalid PayMongo checkout session ID');
    }
    const response = await fetch(
      `https://api.paymongo.com/v1/checkout_sessions/${checkoutSessionId}/expire`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        },
      },
    );
    if (response.status === 400) {
      // A retry may see an already expired session; a paid session must wait
      // for its webhook and must not release the assigned deliverer.
      const current = await fetch(
        `https://api.paymongo.com/v1/checkout_sessions/${checkoutSessionId}`,
        { headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}` } },
      );
      if (!current.ok) return false;
      const body = (await current.json()) as { data?: { attributes?: { status?: string } } };
      return body.data?.attributes?.status === 'expired';
    }
    if (!response.ok) throw new BadGatewayException('Unable to expire PayMongo checkout');
    return true;
  }

  async retrievePayment(paymentResourceId: string): Promise<{
    status: string;
    amount: number;
    currency: string;
  }> {
    const secretKey = this.configService.get<string>('PAYMONGO_SECRET_KEY');
    if (!secretKey || !secretKey.startsWith('sk_test_')) {
      throw new InternalServerErrorException('PayMongo Sandbox secret key is not configured');
    }
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentResourceId)) {
      throw new BadGatewayException('Invalid PayMongo payment resource ID');
    }

    const response = await fetch(
      `https://api.paymongo.com/v1/payments/${paymentResourceId}`,
      { headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}` } },
    );
    if (!response.ok) {
      throw new BadGatewayException('Unable to verify PayMongo payment');
    }
    const resource = (await response.json()) as {
      data?: {
        id?: string;
        type?: string;
        attributes?: { status?: string; amount?: number; currency?: string };
      };
    };
    if (resource.data?.id !== paymentResourceId || resource.data.type !== 'payment' ||
      typeof resource.data.attributes?.status !== 'string' ||
      typeof resource.data.attributes.amount !== 'number' ||
      typeof resource.data.attributes.currency !== 'string') {
      throw new BadGatewayException('Invalid PayMongo payment resource');
    }
    return {
      status: resource.data.attributes.status,
      amount: resource.data.attributes.amount,
      currency: resource.data.attributes.currency,
    };
  }

  async retrieveCheckoutPaymentIds(checkoutSessionId: string): Promise<{
    referenceNumber: string;
    paymentIds: string[];
  }> {
    const secretKey = this.configService.get<string>('PAYMONGO_SECRET_KEY');
    if (!secretKey || !secretKey.startsWith('sk_test_')) {
      throw new InternalServerErrorException('PayMongo Sandbox secret key is not configured');
    }
    if (!/^cs_[A-Za-z0-9]+$/.test(checkoutSessionId)) {
      throw new BadGatewayException('Invalid PayMongo checkout session ID');
    }

    const response = await fetch(
      `https://api.paymongo.com/v1/checkout_sessions/${checkoutSessionId}`,
      { headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}` } },
    );
    if (!response.ok) throw new BadGatewayException('Unable to verify PayMongo checkout session');
    const resource = (await response.json()) as {
      data?: {
        id?: string;
        type?: string;
        attributes?: {
          reference_number?: string;
          payments?: Array<{ id?: string; type?: string }>;
        };
      };
    };
    if (!resource.data || resource.data.id !== checkoutSessionId ||
      resource.data.type !== 'checkout_session' ||
      !resource.data.attributes ||
      typeof resource.data.attributes.reference_number !== 'string' ||
      !Array.isArray(resource.data.attributes.payments)) {
      throw new BadGatewayException('Invalid PayMongo checkout session');
    }
    return {
      referenceNumber: resource.data.attributes.reference_number,
      paymentIds: resource.data.attributes.payments
        .filter((item) => item?.type === 'payment' &&
          typeof item.id === 'string' && /^pay_[A-Za-z0-9]+$/.test(item.id))
        .map((item) => item.id as string),
    };
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
            'Idempotency-Key': params.idempotencyKey,
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
