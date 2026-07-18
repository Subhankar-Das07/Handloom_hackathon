import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { SocialPost } from '../database/entities/social-post.entity';
import { Product } from '../database/entities/product.entity';
import { ProducerProfile } from '../database/entities/producer-profile.entity';
import { Follow } from '../database/entities/follow.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SocialPost, Product, ProducerProfile, Follow])],
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
