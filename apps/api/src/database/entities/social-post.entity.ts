import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum PostType {
  IMAGE_CAROUSEL = 'image_carousel',
  VIDEO_REEL = 'video_reel'
}

@Entity('social_posts')
export class SocialPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Ideally a ManyToOne relation to ProducerProfile, but keeping it simple with string ID to match existing patterns
  @Column({ type: 'varchar', length: 255 })
  producer_id: string;

  @Column({ type: 'enum', enum: PostType, default: PostType.IMAGE_CAROUSEL })
  type: PostType;

  @Column({ type: 'jsonb' })
  media_urls: string[]; // Array of strings (S3/CDN URLs)

  @Column({ type: 'text', nullable: true })
  caption: string;

  @Column({ type: 'jsonb', nullable: true })
  tagged_product_ids: string[]; // Array of UUID strings linking to Products

  @Column({ type: 'int', default: 0 })
  likes_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
