import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('government_schemes')
export class GovernmentScheme {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  department_name: string;

  @Column({ type: 'jsonb', nullable: true })
  eligibility_criteria: any;

  @Column({ type: 'varchar', length: 100, nullable: true })
  benefit_amount: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  apply_url: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
