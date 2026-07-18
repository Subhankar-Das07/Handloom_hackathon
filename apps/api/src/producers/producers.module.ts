import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProducersController } from './producers.controller';
import { ProducersService } from './producers.service';
import { ProducerProfile } from '../database/entities/producer-profile.entity';
import { VerificationDocument } from '../database/entities/verification-document.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProducerProfile, VerificationDocument])],
  controllers: [ProducersController],
  providers: [ProducersService],
})
export class ProducersModule {}
