import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../database/entities/order.entity';
import { EscrowHold } from '../database/entities/escrow-hold.entity';
import { OrderStatus, EscrowStatus } from '../database/enums';
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(EscrowHold)
    private readonly escrowRepository: Repository<EscrowHold>,
  ) {}

  verifyRazorpaySignature(body: any, signature: string, secret: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('hex');
    
    return expectedSignature === signature;
  }

  async handleWebhook(event: any): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Received webhook event: ${event.event}`);

    if (event.event === 'order.paid' || event.event === 'payment.captured') {
      const orderId = event.payload.payment.entity.notes?.order_id;
      const paymentId = event.payload.payment.entity.id;
      const amount = event.payload.payment.entity.amount / 100; // Razorpay sends in paise

      if (!orderId) {
        this.logger.warn(`No order_id found in payment notes for payment ${paymentId}`);
        return { success: false, message: 'Missing order_id' };
      }

      const order = await this.orderRepository.findOne({ 
        where: { id: orderId },
        relations: { items: { product: true } }
      });

      if (!order) {
        this.logger.error(`Order ${orderId} not found`);
        return { success: false, message: 'Order not found' };
      }

      if (order.status === OrderStatus.PENDING_PAYMENT) {
        // Transition order status
        order.status = OrderStatus.PAYMENT_CONFIRMED;
        await this.orderRepository.save(order);

        // Generate Escrow Hold record
        const escrow = this.escrowRepository.create({
          order_id: order.id,
          producer_id: order.producer_id, // We need producer_id on the order!
          amount: amount,
          status: EscrowStatus.HELD,
          razorpay_payment_id: paymentId,
        });

        await this.escrowRepository.save(escrow);

        this.logger.log(`Order ${orderId} successfully transitioned to PAYMENT_CONFIRMED. Funds held in Escrow.`);
      }
    }

    return { success: true, message: 'Webhook processed' };
  }
}
