import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './product.entity';
import { ProductVariant } from './product-variant.entity';

@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  product_id: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'uuid', nullable: true })
  variant_id: string | null;

  @ManyToOne(() => ProductVariant)
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant | null;

  @Column({ type: 'text' })
  file_key: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  alt_text: string | null;

  @Column({ type: 'smallint', default: 0 })
  sort_order: number;

  @Column({ default: false })
  is_primary: boolean;

  @Column({ type: 'integer', nullable: true })
  width_px: number | null;

  @Column({ type: 'integer', nullable: true })
  height_px: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
