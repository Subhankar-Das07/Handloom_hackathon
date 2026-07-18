import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ProducersService } from './producers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../database/enums';

@Controller('api/v1/producers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PRODUCER)
export class ProducersController {
  constructor(private readonly producersService: ProducersService) {}

  @Get('kyc/status')
  async getKycStatus(@Request() req: any) {
    return this.producersService.getKycStatus(req.user.id);
  }

  @Post('kyc/submit')
  async submitKyc(@Request() req: any, @Body() body: any) {
    return this.producersService.submitKycDocuments(req.user.id, body.documents);
  }
}
