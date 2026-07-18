import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { SocialPost, PostType } from '../database/entities/social-post.entity';
import { Product } from '../database/entities/product.entity';
import { ProducerProfile } from '../database/entities/producer-profile.entity';
import { Follow } from '../database/entities/follow.entity';

@Injectable()
export class SocialService {
  constructor(
    @InjectRepository(SocialPost)
    private postRepository: Repository<SocialPost>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProducerProfile)
    private producerRepository: Repository<ProducerProfile>,
    @InjectRepository(Follow)
    private followRepository: Repository<Follow>,
  ) {}

  async createPost(producerId: string, data: { caption: string, type: PostType, media_urls: string[], tagged_product_ids: string[] }) {
    const post = this.postRepository.create({
      producer_id: producerId,
      ...data
    });
    return this.postRepository.save(post);
  }

  async getFeed(page = 1, limit = 20) {
    const posts = await this.postRepository.find({
      order: { created_at: 'DESC' },
      take: limit,
      skip: (page - 1) * limit
    });

    // Hydrate the feed with product and producer data
    const hydratedPosts = await Promise.all(posts.map(async (post) => {
      let producer = null;
      if (post.producer_id) {
        producer = await this.producerRepository.findOne({ where: { user_id: post.producer_id } });
      }

      let taggedProducts: Product[] = [];
      if (post.tagged_product_ids && post.tagged_product_ids.length > 0) {
        taggedProducts = await this.productRepository.find({
          where: { id: In(post.tagged_product_ids) },
          select: { id: true, title: true, base_price: true, mrp: true, status: true } // only send safe fields
        });
        
        // Let's get the first image for the product as a thumbnail if we need it
        const productsWithImages = await Promise.all(taggedProducts.map(async (p) => {
          // In a real scenario, we'd join images, but for now we'll just mock it or assume the frontend handles it
          return p;
        }));
        taggedProducts = productsWithImages;
      }

      return {
        ...post,
        producer: producer ? { name: producer.business_name, avatar: null, is_verified: producer.is_verified } : null,
        tagged_products: taggedProducts
      };
    }));

    return hydratedPosts;
  }

  async followProducer(userId: string, producerId: string) {
    try {
      const follow = this.followRepository.create({
        follower_id: userId,
        following_producer_id: producerId
      });
      await this.followRepository.save(follow);
      return { success: true };
    } catch (error) {
      // Ignore unique constraint errors
      return { success: true };
    }
  }

  async unfollowProducer(userId: string, producerId: string) {
    await this.followRepository.delete({
      follower_id: userId,
      following_producer_id: producerId
    });
    return { success: true };
  }
}
