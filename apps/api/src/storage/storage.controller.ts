import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/v1/storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @UseGuards(JwtAuthGuard)
  @Post('presigned-url')
  async getPresignedUrl(@Body() body: { contentType: string, prefix?: string }) {
    if (!body.contentType) {
      throw new Error("Content type is required");
    }
    return this.storageService.getPresignedUploadUrl(body.contentType, body.prefix);
  }
}
