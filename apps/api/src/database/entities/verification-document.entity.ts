import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ProducerProfile } from './producer-profile.entity';

@Entity('verification_documents')
export class VerificationDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  producer_id: string;

  @ManyToOne(() => ProducerProfile)
  @JoinColumn({ name: 'producer_id' })
  producer: ProducerProfile;

  @Column({ type: 'varchar', length: 50 })
  document_type: string; // e.g., 'AADHAAR', 'ARTISAN_CARD', 'GSTIN'

  @Column({ type: 'varchar', length: 500 })
  document_url: string;

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  status: string; // PENDING, VERIFIED, REJECTED

  @Column({ type: 'text', nullable: true })
  rejection_reason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
