import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProducerProfile } from '../database/entities/producer-profile.entity';
import { VerificationDocument } from '../database/entities/verification-document.entity';
import { GovernmentScheme } from '../database/entities/government-scheme.entity';
import { User } from '../database/entities/user.entity';
import { Product } from '../database/entities/product.entity';
import { Order } from '../database/entities/order.entity';
import { KycStatus, ProductStatus } from '../database/enums';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(ProducerProfile)
    private readonly profileRepository: Repository<ProducerProfile>,
    @InjectRepository(VerificationDocument)
    private readonly docsRepository: Repository<VerificationDocument>,
    @InjectRepository(GovernmentScheme)
    private readonly schemeRepository: Repository<GovernmentScheme>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  async getPendingKyc() {
    return this.profileRepository.find({
      where: { kyc_status: KycStatus.UNDER_REVIEW },
      order: { updated_at: 'ASC' },
    });
  }

  async getKycDocuments(producerId: string) {
    return this.docsRepository.find({
      where: { producer_id: producerId },
    });
  }

  async approveKyc(producerId: string) {
    const profile = await this.profileRepository.findOne({ where: { id: producerId } });
    if (!profile) throw new NotFoundException('Producer not found');

    profile.kyc_status = KycStatus.APPROVED;
    profile.is_verified = true;
    profile.verified_badges = Array.from(new Set([...(profile.verified_badges || []), 'VERIFIED_ARTISAN']));
    
    // Also mark docs as verified
    await this.docsRepository.update({ producer_id: producerId }, { status: 'VERIFIED' });
    
    return this.profileRepository.save(profile);
  }

  async rejectKyc(producerId: string, reason: string) {
    const profile = await this.profileRepository.findOne({ where: { id: producerId } });
    if (!profile) throw new NotFoundException('Producer not found');

    profile.kyc_status = KycStatus.REJECTED;
    profile.is_verified = false;
    
    await this.docsRepository.update({ producer_id: producerId }, { status: 'REJECTED', rejection_reason: reason });
    
    return this.profileRepository.save(profile);
  }

  // --- Dashboard Stats ---
  async getDashboardStats() {
    const totalUsers = await this.userRepository.count();
    const activeListings = await this.productRepository.count({ where: { status: ProductStatus.ACTIVE } });
    const totalOrders = await this.orderRepository.count();
    const pendingKyc = await this.profileRepository.count({ where: { kyc_status: KycStatus.UNDER_REVIEW } });
    
    return {
      totalUsers,
      activeListings,
      totalOrders,
      pendingKyc
    };
  }

  // --- Users ---
  async getAllUsers() {
    return this.userRepository.find({
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        is_active: true,
        created_at: true
      },
      order: { created_at: 'DESC' }
    });
  }

  // --- Products ---
  async getAllProducts() {
    return this.productRepository.find({
      relations: { producer: true },
      order: { created_at: 'DESC' }
    });
  }

  async suspendProduct(productId: string) {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    
    product.status = ProductStatus.INACTIVE; // Suspend logic
    return this.productRepository.save(product);
  }

  // --- Schemes ---
  async getSchemes() {
    return this.schemeRepository.find({ order: { created_at: 'DESC' } });
  }

  async createScheme(data: any) {
    const scheme = this.schemeRepository.create(data);
    return this.schemeRepository.save(scheme);
  }
}
