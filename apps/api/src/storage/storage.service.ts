import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private bucketName = 'tanthavi-uploads';

  constructor() {
    // Configured for MinIO locally, but seamlessly works with AWS S3 in prod
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'minioadmin',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'minioadmin',
      },
      forcePathStyle: true, // Required for MinIO
    });
  }

  async getPresignedUploadUrl(contentType: string, prefix: string = 'general'): Promise<{ uploadUrl: string, fileUrl: string }> {
    const extension = contentType.split('/')[1] || 'bin';
    const filename = `${prefix}/${uuidv4()}.${extension}`;
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: filename,
      ContentType: contentType,
    });

    // URL expires in 15 minutes
    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });
    
    // The public URL where the file will be accessible after upload
    const endpointUrl = process.env.S3_PUBLIC_ENDPOINT || 'http://localhost:9000';
    const fileUrl = `${endpointUrl}/${this.bucketName}/${filename}`;

    return { uploadUrl, fileUrl };
  }

  async uploadBuffer(buffer: Buffer, key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await this.s3Client.send(command);
    
    const endpointUrl = process.env.S3_PUBLIC_ENDPOINT || 'http://localhost:9000';
    return `${endpointUrl}/${this.bucketName}/${key}`;
  }
}
