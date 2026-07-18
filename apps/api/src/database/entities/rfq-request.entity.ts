import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Product } from './product.entity';
import { ProducerProfile } from './producer-profile.entity';

export enum RfqStatus {
  PENDING = 'PENDING',
  QUOTED = 'QUOTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED'
}

@Entity('rfq_requests')
export class RfqRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  product_id: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

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

  @Column({ type: 'integer' })
  requested_quantity: number;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'enum', enum: RfqStatus, default: RfqStatus.PENDING })
  status: RfqStatus;

  // The quote offered by the seller
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  quoted_unit_price: number | null;

  @Column({ type: 'text', nullable: true })
  seller_notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
