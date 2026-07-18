import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Order } from './order.entity';
import { ProducerProfile } from './producer-profile.entity';
import { EscrowStatus } from '../enums';

@Entity('escrow_holds')
export class EscrowHold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'uuid' })
  producer_id: string;

  @ManyToOne(() => ProducerProfile)
  @JoinColumn({ name: 'producer_id' })
  producer: ProducerProfile;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: EscrowStatus, default: EscrowStatus.HELD })
  status: EscrowStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  razorpay_payment_id: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  razorpay_transfer_id: string | null;

  @Column({ type: 'text', nullable: true })
  release_notes: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  released_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
