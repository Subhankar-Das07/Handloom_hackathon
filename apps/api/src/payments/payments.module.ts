import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Order } from '../database/entities/order.entity';
import { EscrowHold } from '../database/entities/escrow-hold.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, EscrowHold]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
