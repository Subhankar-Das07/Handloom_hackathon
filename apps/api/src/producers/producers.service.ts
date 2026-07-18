import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProducerProfile } from '../database/entities/producer-profile.entity';
import { VerificationDocument } from '../database/entities/verification-document.entity';
import { KycStatus } from '../database/enums';

@Injectable()
export class ProducersService {
  constructor(
    @InjectRepository(ProducerProfile)
    private readonly profileRepository: Repository<ProducerProfile>,
    @InjectRepository(VerificationDocument)
    private readonly docsRepository: Repository<VerificationDocument>,
  ) {}

  async getKycStatus(userId: string) {
    const profile = await this.profileRepository.findOne({ where: { user_id: userId } });
    if (!profile) throw new NotFoundException('Producer profile not found');
    return {
      kyc_status: profile.kyc_status,
      is_verified: profile.is_verified,
      verified_badges: profile.verified_badges,
    };
  }

  async submitKycDocuments(userId: string, documents: any[]) {
    const profile = await this.profileRepository.findOne({ where: { user_id: userId } });
    if (!profile) throw new NotFoundException('Producer profile not found');

    for (const doc of documents) {
      const newDoc = this.docsRepository.create({
        producer_id: profile.id,
        document_type: doc.document_type,
        document_url: doc.document_url,
        status: 'PENDING',
      });
      await this.docsRepository.save(newDoc);
    }

    profile.kyc_status = KycStatus.UNDER_REVIEW;
    await this.profileRepository.save(profile);

    return { success: true, message: 'KYC documents submitted for review' };
  }
}
