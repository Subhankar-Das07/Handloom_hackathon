import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { ProducerProfile } from './producer-profile.entity';
import { ProductCategory } from './category.entity';
import { ProductImage } from './product-image.entity';
import { ProductStatus } from '../enums';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  producer_id: string;

  @ManyToOne(() => ProducerProfile)
  @JoinColumn({ name: 'producer_id' })
  producer: ProducerProfile;

  @Column({ type: 'uuid' })
  category_id: string;

  @ManyToOne(() => ProductCategory)
  @JoinColumn({ name: 'category_id' })
  category: ProductCategory;

  @Column({ type: 'varchar', length: 100, unique: true })
  sku: string;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'varchar', length: 500, unique: true })
  slug: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  base_price: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  mrp: number;

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.DRAFT })
  status: ProductStatus;

  @Column({ type: 'varchar', length: 20 })
  hsn_code: string;

  @Column({ type: 'int', default: 0 })
  trust_score: number;

  @Column({ type: 'boolean', default: false })
  ai_verification_badge: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => ProductImage, (image) => image.product)
  images: ProductImage[];
}
