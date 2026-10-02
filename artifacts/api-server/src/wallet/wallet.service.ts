import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  PaymentProvider,
  PaymentStatus,
  PaymentPurpose,
  OrderStatus,
  PaymentShareStatus,
  LedgerEntryType,
} from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { PaymongoService } from "../payments/paymongo.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymongo: PaymongoService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // Retry only database conflicts; never run provider calls inside this callback.
  private async atomic<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10000,
          timeout: 30000,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2034", "P2002"].includes(error.code) &&
          attempt < 4
        )
          continue;
        throw error;
      }
    }
  }

  private key(value?: string) {
    const key = value?.trim();
    if (!key || key.length > 255)
      throw new BadRequestException("A valid Idempotency-Key is required");
    return key;
  }

  async get(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    return {
      balance: wallet?.balance.toFixed(2) ?? "0.00",
      currency: "PHP",
      mode: "SANDBOX",
    };
  }

  async history(userId: string, page = 1) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.walletEntry.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 20,
        take: 20,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceAfter: true,
          paymentId: true,
          refundId: true,
          createdAt: true,
        },
      }),
      this.prisma.walletEntry.count({ where: { userId } }),
    ]);
    return {
      items: items.map((e) => ({
        ...e,
        amount: e.amount.toFixed(2),
        balanceAfter: e.balanceAfter.toFixed(2),
      })),
      total,
      page,
      limit: 20,
    };
  }

  async topup(userId: string, amount: string, header?: string) {
    const key = `topup:${this.key(header)}`;
    if (!/^\d{1,5}(\.\d{1,2})?$/.test(amount))
      throw new BadRequestException(
        "Amount must have at most two decimal places",
      );
    const money = new Prisma.Decimal(amount);
    if (money.lt(20) || money.gt(10000))
      throw new BadRequestException(
        "Cash-in must be between PHP 20 and PHP 10,000",
      );
    const reservation = await this.atomic(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: {
          payerUserId_walletKey: { payerUserId: userId, walletKey: key },
        },
      });
      if (existing) {
        if (!existing.amount.eq(money))
          throw new ConflictException(
            "Idempotency-Key was used with another amount",
          );
        if (!existing.checkoutUrl)
          throw new ConflictException(
            "Cash-in checkout is being created or failed; check wallet before starting another cash-in",
          );
        return { payment: existing, replay: true };
      }
      const payment = await tx.payment.create({
        data: {
          payerUserId: userId,
          purpose: PaymentPurpose.WALLET_TOPUP,
          amount: money,
          walletKey: key,
        },
      });
      await this.audit(tx, userId, "WALLET_TOPUP_CREATED", payment.id, {
        amount: money.toFixed(2),
        status: "PENDING",
      });
      return { payment, replay: false };
    });
    let payment = reservation.payment;
    if (!reservation.replay) {
      const session = await this.paymongo.createCheckoutSession({
        amount: money.mul(100).toNumber(),
        referenceNumber: payment.id,
        walletTopupId: payment.id,
        description: "QueueLess sandbox wallet cash-in",
        itemName: "Wallet cash-in (sandbox)",
      });
      payment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: session.checkoutSessionId,
          checkoutUrl: session.checkoutUrl,
        },
      });
    }
    return {
      paymentId: payment.id,
      status: payment.status,
      amount: payment.amount.toFixed(2),
      checkoutUrl: payment.checkoutUrl,
      idempotentReplay: reservation.replay,
    };
  }

  async topupStatus(userId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, payerUserId: userId, purpose: PaymentPurpose.WALLET_TOPUP },
      select: { id: true, status: true, amount: true },
    });
    if (!payment) throw new NotFoundException("Cash-in not found");
    return { ...payment, amount: payment.amount.toFixed(2) };
  }

  async confirmTopup(paymentId: string, sessionId: string) {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    if (
      payment.provider !== PaymentProvider.PAYMONGO ||
      payment.purpose !== PaymentPurpose.WALLET_TOPUP ||
      (payment.providerPaymentId && payment.providerPaymentId !== sessionId)
    )
      throw new BadRequestException("Cash-in checkout does not match");
    const session = await this.paymongo.retrieveCheckoutPaymentIds(sessionId);
    if (
      session.referenceNumber !== payment.id ||
      !session.paymentIds.length ||
      session.paymentIds.length > 10
    )
      throw new BadRequestException("Cash-in reference cannot be verified");
    let paidId: string | undefined;
    for (const id of session.paymentIds) {
      const verified = await this.paymongo.retrievePayment(id);
      if (
        verified.status === "paid" &&
        verified.currency === "PHP" &&
        verified.amount === payment.amount.mul(100).toNumber()
      ) {
        paidId = id;
        break;
      }
    }
    if (!paidId)
      throw new BadRequestException(
        "Cash-in payment amount or status does not match",
      );
    return this.atomic(async (tx) => {
      const current = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      if (current.status === PaymentStatus.SUCCEEDED)
        return { duplicate: true };
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCEEDED,
          providerPaymentId: sessionId,
          providerPaymentResourceId: paidId,
        },
      });
      await this.credit(tx, payment.payerUserId, payment.amount, "TOPUP", {
        paymentId: payment.id,
      });
      await this.audit(tx, null, "WALLET_TOPUP_SUCCEEDED", payment.id, {
        amount: payment.amount.toFixed(2),
        source: "PAYMONGO_WEBHOOK",
      });
      return { duplicate: false };
    });
  }

  async purchaseStatus(userId: string, shareId: string) {
    const share = await this.prisma.paymentShare.findFirst({
      where: { id: shareId, payerUserId: userId },
      include: { order: { select: { id: true, status: true } } },
    });
    if (!share) throw new NotFoundException("Payment share not found");
    return {
      paymentShareId: share.id,
      amount: share.amountDue.toFixed(2),
      currency: "PHP",
      status: share.status,
      orderId: share.orderId,
      orderStatus: share.order.status,
    };
  }

  async pay(userId: string, shareId: string, header?: string) {
    const key = `purchase:${this.key(header)}`;
    const result = await this.atomic(async (tx) => {
      const replay = await tx.payment.findUnique({
        where: {
          payerUserId_walletKey: { payerUserId: userId, walletKey: key },
        },
        include: { paymentShares: true },
      });
      if (replay) {
        if (!replay.paymentShares.some((s) => s.id === shareId))
          throw new ConflictException(
            "Idempotency-Key belongs to another purchase",
          );
        return {
          paymentId: replay.id,
          orderId: replay.paymentShares[0].orderId,
          duplicate: true,
          paidOrder: null,
        };
      }
      const share = await tx.paymentShare.findFirst({
        where: { id: shareId, payerUserId: userId },
        include: { order: true, payment: true },
      });
      if (!share) throw new NotFoundException("Payment share not found");
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${share.orderId}::uuid FOR UPDATE`;
      if (
        share.status !== PaymentShareStatus.PENDING ||
        share.order.status !== OrderStatus.PENDING ||
        share.payment?.status === PaymentStatus.SUCCEEDED
      )
        throw new ConflictException("Order or payment share cannot be paid");
      if (share.amountDue.lte(0))
        throw new BadRequestException("Payment amount must be positive");
      const debit = await tx.wallet.updateMany({
        where: { userId, balance: { gte: share.amountDue } },
        data: { balance: { decrement: share.amountDue } },
      });
      if (debit.count !== 1)
        throw new ConflictException("Insufficient QueueLess wallet balance");
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      const payment = await tx.payment.create({
        data: {
          payerUserId: userId,
          walletKey: key,
          purpose: PaymentPurpose.ORDER_SHARE,
          provider: PaymentProvider.WALLET,
          amount: share.amountDue,
          status: PaymentStatus.SUCCEEDED,
        },
      });
      await tx.walletEntry.create({
        data: {
          userId,
          type: "PURCHASE",
          amount: share.amountDue.negated(),
          balanceAfter: wallet.balance,
          paymentId: payment.id,
        },
      });
      await tx.paymentShare.update({
        where: { id: share.id },
        data: { paymentId: payment.id, status: PaymentShareStatus.PAID },
      });
      await this.audit(tx, userId, "WALLET_PURCHASE", payment.id, {
        orderId: share.orderId,
        amount: share.amountDue.toFixed(2),
      });
      let paidOrder = null;
      if (
        (await tx.paymentShare.count({
          where: { orderId: share.orderId, status: PaymentShareStatus.PENDING },
        })) === 0
      ) {
        paidOrder = await tx.order.update({
          where: { id: share.orderId },
          data: { status: OrderStatus.PAID, paidAt: new Date() },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: share.orderId,
            status: OrderStatus.PAID,
            changedByUserId: userId,
            note: "Payment confirmed from QueueLess wallet",
          },
        });
        await tx.vendorLedgerEntry.create({
          data: {
            vendorId: paidOrder.vendorId,
            orderId: paidOrder.id,
            type: LedgerEntryType.ORDER_CREDIT,
            amount: paidOrder.totalAmount.sub(paidOrder.marketplaceFee),
          },
        });
        await this.audit(
          tx,
          userId,
          "ORDER_STATUS_UPDATED",
          share.orderId,
          { status: "PAID", paymentId: payment.id },
          "Order",
        );
      }
      return {
        paymentId: payment.id,
        orderId: share.orderId,
        duplicate: false,
        paidOrder,
      };
    });
    if (result.paidOrder)
      await this.realtime.emitOrderStatusUpdated(result.paidOrder.customerId, {
        orderId: result.orderId,
        status: OrderStatus.PAID,
        updatedAt: result.paidOrder.updatedAt,
      });
    return {
      paymentId: result.paymentId,
      orderId: result.orderId,
      status: "SUCCEEDED",
      provider: "WALLET",
      idempotentReplay: result.duplicate,
    };
  }

  async refund(refundId: string, actor: string | null) {
    return this.atomic(async (tx) => {
      const refund = await tx.refund.findUniqueOrThrow({
        where: { id: refundId },
        include: { payment: true },
      });
      if (refund.status === "PROCESSED")
        return {
          ...refund,
          amount: refund.amount.toFixed(2),
          idempotentReplay: true,
        };
      if (
        refund.status !== "APPROVED" ||
        refund.payment.provider !== PaymentProvider.WALLET ||
        refund.payment.status !== PaymentStatus.SUCCEEDED
      )
        throw new ConflictException("Wallet refund cannot be processed");
      const others = await tx.refund.aggregate({
        where: {
          paymentId: refund.paymentId,
          id: { not: refund.id },
          status: { in: ["REQUESTED", "APPROVED", "PROCESSED"] },
        },
        _sum: { amount: true },
      });
      if (
        refund.amount.lte(0) ||
        refund.amount.add(others._sum.amount ?? 0).gt(refund.payment.amount)
      )
        throw new ConflictException("Refund exceeds payment amount");
      // Lock/write payment too: concurrent partial refunds serialize on the same payment.
      await tx.payment.update({
        where: { id: refund.paymentId },
        data: { updatedAt: new Date() },
      });
      await this.credit(
        tx,
        refund.payment.payerUserId,
        refund.amount,
        "REFUND",
        { refundId },
      );
      const updated = await tx.refund.update({
        where: { id: refundId },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          providerRefundId: `wallet:${refundId}`,
        },
      });
      await this.audit(
        tx,
        actor,
        "REFUND_PROCESSED",
        refundId,
        {
          status: "PROCESSED",
          provider: "WALLET",
          amount: refund.amount.toFixed(2),
        },
        "Refund",
      );
      return {
        ...updated,
        amount: updated.amount.toFixed(2),
        idempotentReplay: false,
      };
    });
  }

  private async credit(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: Prisma.Decimal,
    type: string,
    reference: { paymentId?: string; refundId?: string },
  ) {
    const wallet = await tx.wallet.upsert({
      where: { userId },
      create: { userId, balance: amount },
      update: { balance: { increment: amount } },
    });
    await tx.walletEntry.create({
      data: {
        userId,
        type,
        amount,
        balanceAfter: wallet.balance,
        ...reference,
      },
    });
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorUserId: string | null,
    actionType: string,
    entityId: string,
    afterState: Prisma.InputJsonObject,
    entityType = "Payment",
  ) {
    return tx.auditRecord.create({
      data: { actorUserId, actionType, entityType, entityId, afterState },
    });
  }
}
