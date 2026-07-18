import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { UserRole } from '../enums';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 15, unique: true, nullable: true })
  phone: string | null;

  @Column({ default: false })
  phone_verified: boolean;

  @Column({ default: false })
  email_verified: boolean;

  @Column({ type: 'text', nullable: true })
  password_hash: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CONSUMER })
  role: UserRole;

  @Column({ default: true })
  is_active: boolean;

  @Column({ default: false })
  is_blocked: boolean;

  @Column({ type: 'text', nullable: true })
  blocked_reason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_login_at: Date | null;

  @Column({ type: 'smallint', default: 0 })
  login_attempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockout_until: Date | null;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  preferred_language: string;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  referral_code: string | null;

  @Column({ type: 'uuid', nullable: true })
  referred_by: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  oauth_provider: string | null;

  @Column({ type: 'text', nullable: true })
  oauth_provider_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
