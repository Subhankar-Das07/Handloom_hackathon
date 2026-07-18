import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { ProducerProfile } from './producer-profile.entity';
import { OrderItem } from './order-item.entity';
import { OrderStatus } from '../enums';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  order_number: string;

  @Column({ type: 'uuid' })
  buyer_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'buyer_id' })
  buyer: User;

  @Column({ type: 'uuid' })
  producer_id: string;

  @ManyToOne(() => ProducerProfile)
  @JoinColumn({ name: 'producer_id' })
  producer: ProducerProfile;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING_PAYMENT })
  status: OrderStatus;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  subtotal: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  shipping_fee: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  discount_amount: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  tax_amount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  total_amount: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'jsonb' })
  shipping_address: any;

  @Column({ type: 'jsonb', nullable: true })
  billing_address: any;

  @Column({ type: 'varchar', length: 50, nullable: true })
  payment_method: string | null;

  @Column({ type: 'text', nullable: true })
  payment_reference: string | null;

  @Column({ type: 'text', nullable: true })
  tracking_number: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => OrderItem, (item) => item.order)
  items: OrderItem[];
}
