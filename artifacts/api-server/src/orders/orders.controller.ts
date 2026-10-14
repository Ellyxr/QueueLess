import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { RequestOrderRefundDto } from '../refunds/dto/request-order-refund.dto';

import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';
import { CancelPreorderDto, ReschedulePreorderDto } from './dto/preorder-change.dto';
import { PreorderChangesService } from './preorder-changes.service';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly preorderChanges: PreorderChangesService,
  ) {}

  // ------------------------------------------------ US-060 preorder changes

  @Get(':orderId/preorder')
  @UseGuards(RolesGuard)
  @Roles('BUYER')
  @ApiOperation({
    summary: 'View my preorder: pickup time, change cutoff, whether it can be changed, windows to move to',
  })
  async viewPreorder(@CurrentUser() user: JwtPayload, @Param('orderId') orderId: string) {
    return this.preorderChanges.view(user.sub, orderId);
  }

  @Patch(':orderId/preorder/pickup-time')
  @UseGuards(RolesGuard)
  @Roles('BUYER')
  @ApiOperation({ summary: 'Change my preorder pickup time before the cutoff' })
  @ApiResponse({ status: 400, description: 'New time is not a valid slot' })
  @ApiResponse({ status: 404, description: 'Not my order' })
  @ApiResponse({ status: 409, description: 'Cutoff passed, reservation expired, or order no longer changeable' })
  async reschedulePreorder(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
    @Body() dto: ReschedulePreorderDto,
  ) {
    return this.preorderChanges.reschedule(user.sub, orderId, dto);
  }

  @Post(':orderId/preorder/cancel')
  @UseGuards(RolesGuard)
  @Roles('BUYER')
  @ApiOperation({ summary: 'Cancel my preorder before the cutoff; a paid preorder is refunded automatically' })
  @ApiResponse({ status: 404, description: 'Not my order' })
  @ApiResponse({ status: 409, description: 'Cutoff passed, reservation expired, or order no longer changeable' })
  async cancelPreorder(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
    @Body() dto: CancelPreorderDto,
  ) {
    return this.preorderChanges.cancel(user.sub, orderId, dto);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an individual order from an active cart',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Unique key for safely retrying the same order creation request',
  })
  @ApiResponse({
    status: 201,
    description: 'Individual order created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or unavailable cart/order data',
  })
  @ApiResponse({
    status: 409,
    description: 'Idempotency conflict or cart already checked out',
  })
  async createOrder(
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(
      user.sub,
      dto,
      idempotencyKey,
    );
  }

  @Get('vendor/queue')
  @UseGuards(RolesGuard)
  @Roles('VENDOR_OWNER')
  @ApiOperation({
    summary: 'Get the authenticated vendor order queue',
  })
  @ApiResponse({
    status: 200,
    description: 'Vendor order queue returned successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Authenticated user is not a vendor owner',
  })
  @ApiResponse({
    status: 404,
    description: 'Vendor not found for authenticated user',
  })
  async getVendorOrderQueue(@CurrentUser() user: JwtPayload) {
    return this.ordersService.getVendorOrderQueue(user.sub);
  }

  @Get('vendor/scheduled')
  @UseGuards(RolesGuard)
  @Roles('VENDOR_OWNER')
  @ApiOperation({
    summary:
      'Paid preorders held until their pickup window opens (US-059); each joins the live queue at queueReleaseAt',
  })
  async getVendorScheduledOrders(@CurrentUser() user: JwtPayload) {
    return this.ordersService.getVendorScheduledOrders(user.sub);
  }

  @Get('vendor/uncollected')
  @UseGuards(RolesGuard)
  @Roles('VENDOR_OWNER')
  @ApiOperation({
    summary: 'Preorders flagged UNCOLLECTED after the pickup grace period (US-062)',
  })
  async getVendorUncollectedOrders(@CurrentUser() user: JwtPayload) {
    return this.ordersService.getVendorUncollectedOrders(user.sub);
  }

  @Patch('vendor/:orderId/status')
  @UseGuards(RolesGuard)
  @Roles('VENDOR_OWNER')
  @ApiOperation({
    summary: 'Update the status of an order belonging to the authenticated vendor',
  })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid order status transition',
  })
  @ApiResponse({
    status: 403,
    description: 'Authenticated user is not authorized to update this order',
  })
  @ApiResponse({
    status: 404,
    description: 'Order or vendor not found',
  })
  async updateVendorOrderStatus(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateVendorOrderStatus(
      user.sub,
      orderId,
      dto,
    );
  }

  @Get('vendor/dashboard')
  async getVendorDashboard(@CurrentUser() user: JwtPayload) {
    return this.ordersService.getVendorDashboard(user.sub);
  }

  @Get('mine')
  @UseGuards(RolesGuard)
  @Roles('BUYER')
  @ApiOperation({
    summary: 'Get the authenticated buyer order history',
  })
  async getCustomerOrders(@CurrentUser() user: JwtPayload) {
    return this.ordersService.getCustomerOrders(user.sub);
  }

  @Get('ready-for-pickup')
  @UseGuards(RolesGuard)
  @Roles('BUYER')
  @ApiOperation({
    summary:
      'Orders ready for the authenticated student to collect (own, group member, or Pasabuy fulfiller), for buzzer recovery after reconnect',
  })
  @ApiResponse({
    status: 200,
    description: 'Ready orders with the same eventId/readyAt as the order.ready socket event',
  })
  async getReadyForPickup(@CurrentUser() user: JwtPayload) {
    return this.ordersService.getReadyForPickup(user.sub);
  }

  @Get(':orderId/status')
  @UseGuards(RolesGuard)
  @Roles('BUYER')
  @ApiOperation({
    summary: 'Get the authenticated student order status',
  })
  @ApiResponse({
    status: 200,
    description: 'Current authoritative order status returned successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async getOrderStatus(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.getOrderStatus(
      user.sub,
      orderId,
    );
  }


    @Post(':orderId/contact-vendor')
  @UseGuards(RolesGuard)
  @Roles('BUYER')
  @ApiOperation({
    summary: 'Notify the vendor that the buyer needs an update on this order',
  })
  async contactVendor(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.contactVendor(user.sub, orderId);
  }

  @Post(':orderId/refund-request')
  @UseGuards(RolesGuard)
  @Roles('BUYER')
  @ApiOperation({
    summary:
      'Request a refund for an order — auto-refunded when a timeout rule is met, otherwise queued for admin review',
  })
  async requestRefund(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
    @Body() dto: RequestOrderRefundDto,
  ) {
    return this.ordersService.requestRefund(user.sub, orderId, dto);
  }

  @Patch(':orderId/pickup')
  @UseGuards(RolesGuard)
  @Roles('BUYER')
  @ApiOperation({
    summary: 'Confirm pickup of an eligible order',
  })
  @ApiResponse({
    status: 200,
    description: 'Order pickup confirmed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Order is not eligible for pickup',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Order pickup has already been confirmed',
  })
  async confirmPickup(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.confirmPickup(
      user.sub,
      orderId,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one of the authenticated user’s orders',
  })
  @ApiResponse({
    status: 200,
    description: 'Order returned successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async getOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id') orderId: string,
  ) {
    return this.ordersService.getOrder(user.sub, orderId);
  }
}
