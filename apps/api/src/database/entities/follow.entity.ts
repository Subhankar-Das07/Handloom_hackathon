import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('follows')
@Unique(['follower_id', 'following_producer_id'])
export class Follow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  follower_id: string; // User ID of the consumer

  @Column({ type: 'varchar', length: 255 })
  following_producer_id: string; // Producer ID being followed

  @CreateDateColumn()
  created_at: Date;
}
