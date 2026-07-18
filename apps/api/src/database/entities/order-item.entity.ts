import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Order } from './order.entity';
import { Product } from './product.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @ManyToOne(() => Order, (order) => order.items)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'uuid' })
  product_id: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'varchar', length: 500 })
  product_title: string;

  @Column({ type: 'varchar', length: 100 })
  sku: string;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  unit_price: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  total_price: number;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  gst_rate: number;

  @Column({ type: 'varchar', length: 20 })
  hsn_code: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
