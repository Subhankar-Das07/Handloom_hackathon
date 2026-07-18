import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { KycStatus } from '../enums';

@Entity('producer_profiles')
export class ProducerProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 255, nullable: true })
  business_name: string | null;

  @Column({ type: 'varchar', length: 255 })
  display_name: string;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  craft_type: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  district: string | null;

  @Column({ type: 'enum', enum: KycStatus, default: KycStatus.NOT_SUBMITTED })
  kyc_status: KycStatus;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  ai_trust_score: number;

  @Column({ default: false })
  is_verified: boolean;

  @Column({ type: 'text', array: true, default: [] })
  verified_badges: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
