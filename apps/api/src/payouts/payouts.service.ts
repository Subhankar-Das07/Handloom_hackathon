import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EscrowHold } from '../database/entities/escrow-hold.entity';
import { Order } from '../database/entities/order.entity';
import { EscrowStatus, OrderStatus } from '../database/enums';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @InjectRepository(EscrowHold)
    private readonly escrowRepository: Repository<EscrowHold>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  // Run every night at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processBatchPayouts() {
    this.logger.log('Starting daily payout batch job...');

    // Find all HELD escrows
    const heldEscrows = await this.escrowRepository.find({
      where: { status: EscrowStatus.HELD },
      relations: { order: true, producer: true }
    });

    for (const escrow of heldEscrows) {
      try {
        const order = escrow.order;
        
        // Only release if delivered (in a real system, we might wait 7 days after delivery)
        if (order.status === OrderStatus.DELIVERED) {
          // Calculate deductions
          const commissionRate = 0.05; // 5% platform commission
          const tdsRate = 0.01; // 1% TDS under Sec 194O
          
          const commissionAmount = Number(escrow.amount) * commissionRate;
          const tdsAmount = Number(escrow.amount) * tdsRate;
          
          const payoutAmount = Number(escrow.amount) - commissionAmount - tdsAmount;

          this.logger.log(`Processing payout for Escrow ${escrow.id}. Gross: ₹${escrow.amount}, Comm: ₹${commissionAmount}, TDS: ₹${tdsAmount}, Net: ₹${payoutAmount}`);

          // Mocking the RazorpayX Transfer call
          // await razorpayClient.transfers.create({ account: escrow.producer.bank_account_id, amount: payoutAmount * 100, currency: 'INR' });
          
          escrow.status = EscrowStatus.RELEASED;
          escrow.released_at = new Date();
          escrow.release_notes = `Payout successful via batch job. Net: ${payoutAmount}, TDS deducted: ${tdsAmount}`;
          
          await this.escrowRepository.save(escrow);
          this.logger.log(`Successfully released Escrow ${escrow.id} to Producer ${escrow.producer_id}`);
        }
      } catch (error) {
        this.logger.error(`Failed to process payout for Escrow ${escrow.id}`, error);
      }
    }

    this.logger.log('Daily payout batch job completed.');
  }
}
