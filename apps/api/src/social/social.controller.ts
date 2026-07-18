import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req, Query } from '@nestjs/common';
import { SocialService } from './social.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PostType } from '../database/entities/social-post.entity';

@Controller('api/v1/social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Get('feed')
  async getFeed(@Query('page') page: string = '1') {
    const pageNum = parseInt(page) || 1;
    return this.socialService.getFeed(pageNum, 10);
  }

  @UseGuards(JwtAuthGuard)
  @Post('posts')
  async createPost(@Req() req: any, @Body() body: { caption: string, type: string, media_urls: string[], tagged_product_ids: string[] }) {
    const producerId = req.user.userId; 
    const type = body.type === 'video_reel' ? PostType.VIDEO_REEL : PostType.IMAGE_CAROUSEL;
    
    return this.socialService.createPost(producerId, {
      ...body,
      type
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('follow/:id')
  async followProducer(@Req() req: any, @Param('id') producerId: string) {
    return this.socialService.followProducer(req.user.userId, producerId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('follow/:id')
  async unfollowProducer(@Req() req: any, @Param('id') producerId: string) {
    return this.socialService.unfollowProducer(req.user.userId, producerId);
  }
}
