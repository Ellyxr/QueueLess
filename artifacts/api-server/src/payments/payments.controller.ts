import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';

class CreateCheckoutDto {
  @IsUUID()
  paymentShareId!: string;
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('BUYER')
  @ApiBearerAuth()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Unique key used to prevent duplicate checkout sessions when a request is retried',
  })
  @ApiOperation({
    summary: 'Create a PayMongo Sandbox checkout for a payment share',
  })
  @ApiResponse({
    status: 201,
    description:
      'PayMongo checkout session created or safely reused',
  })
  @ApiResponse({
    status: 400,
    description:
      'Payment share cannot be paid or Idempotency-Key is missing or invalid',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Payment share not found',
  })
  @ApiResponse({
    status: 409,
    description:
      'Payment share has already been paid, the order cannot be paid, or the idempotency key conflicts with another request',
  })
  async createCheckout(
    @CurrentUser() user: { sub: string },
    @Headers('idempotency-key')
    idempotencyKey: string | undefined,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.paymentsService.createCheckout(
      user.sub,
      dto.paymentShareId,
      idempotencyKey,
    );
  }

  @Get('orders/:orderId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('BUYER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get payment status for an order',
  })
  @ApiResponse({
    status: 200,
    description: 'Order payment status retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Payment information for order not found',
  })
  async getOrderPaymentStatus(
    @CurrentUser() user: { sub: string },
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.getOrderPaymentStatus(
      user.sub,
      orderId,
    );
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive and verify PayMongo webhook events',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook received',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid PayMongo webhook event or resource',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired PayMongo webhook signature',
  })
  @ApiResponse({
    status: 404,
    description: 'Payment for PayMongo checkout session not found',
  })
  @ApiResponse({
    status: 500,
    description: 'Webhook raw body is unavailable',
  })
  async handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('paymongo-signature') signature: string | undefined,
  ) {
    if (!request.rawBody) {
      this.logger.error(
        'PayMongo webhook rejected: raw request body unavailable',
      );

      throw new InternalServerErrorException(
        'Raw webhook body is unavailable',
      );
    }

    try {
      this.paymentsService.verifyWebhookSignature(
        request.rawBody,
        signature,
      );
    } catch (error) {
      this.logger.warn(
        'PayMongo webhook rejected: signature validation failed',
      );

      throw error;
    }

    try {
      const result =
        await this.paymentsService.handleWebhookEvent(
          request.body,
        );

      this.logger.log(
        `PayMongo webhook handled: eventType=${
          result.eventType ?? 'unknown'
        }, processed=${result.processed}, duplicate=${
          result.duplicate ?? false
        }`,
      );

      return result;
    } catch (error) {
      this.logger.warn(
        'PayMongo webhook rejected: event validation or processing failed',
      );

      throw error;
    }
  }
}
