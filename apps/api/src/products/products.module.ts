import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from '../database/entities/product.entity';
import { ProductVariant } from '../database/entities/product-variant.entity';
import { ProductImage } from '../database/entities/product-image.entity';
import { ProductCategory } from '../database/entities/category.entity';
import { ProducerProfile } from '../database/entities/producer-profile.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductVariant, ProductImage, ProductCategory, ProducerProfile]),
  ],
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}
