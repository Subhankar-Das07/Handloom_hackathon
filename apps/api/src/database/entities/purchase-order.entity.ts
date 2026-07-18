import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { RfqRequest } from './rfq-request.entity';
import { Order } from './order.entity';

@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  po_number: string;

  @Column({ type: 'uuid' })
  rfq_id: string;

  @OneToOne(() => RfqRequest)
  @JoinColumn({ name: 'rfq_id' })
  rfq: RfqRequest;

  @Column({ type: 'uuid' })
  order_id: string; // The standard Order generated from this PO

  @OneToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'text', nullable: true })
  terms: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
