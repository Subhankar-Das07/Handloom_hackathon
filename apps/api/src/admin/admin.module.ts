import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ProducerProfile } from '../database/entities/producer-profile.entity';
import { VerificationDocument } from '../database/entities/verification-document.entity';
import { GovernmentScheme } from '../database/entities/government-scheme.entity';
import { User } from '../database/entities/user.entity';
import { Product } from '../database/entities/product.entity';
import { Order } from '../database/entities/order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProducerProfile, VerificationDocument, GovernmentScheme, User, Product, Order])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
