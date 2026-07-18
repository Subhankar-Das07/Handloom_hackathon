import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { User } from './database/entities/user.entity';
import { ProducerProfile } from './database/entities/producer-profile.entity';
import { Product } from './database/entities/product.entity';
import { ProductCategory } from './database/entities/category.entity';
import { ProductVariant } from './database/entities/product-variant.entity';
import { ProductImage } from './database/entities/product-image.entity';
import { Order } from './database/entities/order.entity';
import { OrderItem } from './database/entities/order-item.entity';
import { VerificationDocument } from './database/entities/verification-document.entity';
import { GovernmentScheme } from './database/entities/government-scheme.entity';
import { SocialPost } from './database/entities/social-post.entity';
import { Follow } from './database/entities/follow.entity';
import { EscrowHold } from './database/entities/escrow-hold.entity';
import { Review } from './database/entities/review.entity';
import { RfqRequest } from './database/entities/rfq-request.entity';
import { PurchaseOrder } from './database/entities/purchase-order.entity';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { AdminModule } from './admin/admin.module';
import { ProducersModule } from './producers/producers.module';
import { SocialModule } from './social/social.module';
import { StorageModule } from './storage/storage.module';
import { PaymentsModule } from './payments/payments.module';
import { LogisticsModule } from './logistics/logistics.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PayoutsModule } from './payouts/payouts.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100, // 100 requests per minute per IP
    }]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_DATABASE || 'tanthavi_dev',
      entities: [User, ProducerProfile, Product, ProductCategory, ProductVariant, ProductImage, Order, OrderItem, VerificationDocument, GovernmentScheme, SocialPost, Follow, EscrowHold, Review, RfqRequest, PurchaseOrder],
      synchronize: true, // Use only in dev, for production use migrations
    }),
    AuthModule,
    ProductsModule,
    OrdersModule,
    AdminModule,
    ProducersModule,
    SocialModule,
    StorageModule,
    PaymentsModule,
    LogisticsModule,
    InvoicesModule,
    PayoutsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
