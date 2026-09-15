import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
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
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('BUYER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a PayMongo Sandbox checkout for a payment share',
  })
  @ApiResponse({
    status: 201,
    description: 'PayMongo checkout session created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Payment share cannot be paid',
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
      'Payment share has already been paid or the order cannot be paid',
  })
  async createCheckout(
    @CurrentUser() user: { sub: string },
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.paymentsService.createCheckout(
      user.sub,
      dto.paymentShareId,
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
    status: 401,
    description: 'Invalid PayMongo webhook signature',
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
      throw new InternalServerErrorException(
        'Raw webhook body is unavailable',
      );
    }

    this.paymentsService.verifyWebhookSignature(
      request.rawBody,
      signature,
    );

    return this.paymentsService.handleWebhookEvent(
      request.body,
    );
  }
}
