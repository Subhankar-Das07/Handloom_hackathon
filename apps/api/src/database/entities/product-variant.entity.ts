import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './product.entity';

@Entity('product_variants')
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  product_id: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'varchar', length: 255 })
  variant_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  color: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  size: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  material: string | null;

  @Column({ type: 'varchar', length: 50 })
  sku_suffix: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  price_adjustment: number;

  @Column({ type: 'integer', default: 0 })
  stock_quantity: number;

  @Column({ type: 'integer', default: 0 })
  reserved_quantity: number;

  @Column({ type: 'integer', default: 5 })
  reorder_point: number;

  @Column({ type: 'integer', nullable: true })
  weight_grams: number | null;

  @Column({ type: 'text', nullable: true })
  image_url: string | null;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
