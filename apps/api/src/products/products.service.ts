import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../database/entities/product.entity';
import { ProducerProfile } from '../database/entities/producer-profile.entity';
import { ProductImage } from '../database/entities/product-image.entity';
import { ProductStatus } from '../database/enums';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProducerProfile)
    private readonly profileRepository: Repository<ProducerProfile>,
    @InjectRepository(ProductImage)
    private readonly imageRepository: Repository<ProductImage>,
  ) {}

  async findAll(): Promise<Product[]> {
    return this.productRepository.find({
      where: { status: ProductStatus.ACTIVE },
      // Note: We need to use QueryBuilder or specify the relation name mapped in Product.
      // Wait, Product doesn't have an @OneToMany(() => ProductImage) relation defined in product.entity.ts!
      relations: { producer: true },
    });
  }

  async findByProducer(userId: string): Promise<Product[]> {
    const profile = await this.profileRepository.findOne({ where: { user_id: userId } });
    if (!profile) return [];
    
    return this.productRepository.find({
      where: { producer_id: profile.id },
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<any> {
    if (id.startsWith('demo-saree-')) {
      const demoNum = id.replace('demo-saree-', '');
      return {
        id,
        title: `Authentic Handwoven Saree ${demoNum}`,
        description: 'Exquisite handwoven silk saree with traditional motifs. Verified authentic handloom.',
        base_price: 4500,
        mrp: 6000,
        slug: id,
        sku: `SKU-${id}`,
        status: ProductStatus.ACTIVE,
        producer: { display_name: 'Odisha Weavers Co-op' },
        trust_score: 98,
        ai_verification_badge: true
      };
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new NotFoundException('Product not found');
    }

    const product = await this.productRepository.findOne({
      where: { id, status: ProductStatus.ACTIVE },
      relations: { producer: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async create(userId: string, data: any): Promise<Product> {
    const profile = await this.profileRepository.findOne({ where: { user_id: userId } });
    if (!profile) {
      throw new NotFoundException('Producer profile not found for this user.');
    }

    const product = this.productRepository.create({
      producer_id: profile.id,
      title: data.title,
      description: data.description,
      sku: data.sku,
      slug: data.slug,
      base_price: data.base_price,
      mrp: data.mrp,
      category_id: data.category_id,
      status: ProductStatus.ACTIVE,
      hsn_code: data.hsn_code || '1234',
      trust_score: data.trust_score || 0,
      ai_verification_badge: data.ai_verification_badge || false,
    } as Partial<Product>);
    const savedProduct = await this.productRepository.save(product);

    if (data.images && Array.isArray(data.images)) {
      const imagesToSave = data.images.map((url: string, index: number) => {
        return this.imageRepository.create({
          product_id: savedProduct.id,
          file_key: url.split('/').pop() || `img-${index}`,
          url: url,
          is_primary: index === 0,
          sort_order: index,
        });
      });
      await this.imageRepository.save(imagesToSave);
    }

    return savedProduct;
  }
}
