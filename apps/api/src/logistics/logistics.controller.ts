import { Controller, Post, Param, UseGuards, Request } from '@nestjs/common';
import { LogisticsService } from './logistics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../database/enums';

@Controller('api/v1/logistics')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRODUCER, UserRole.ADMIN)
  @Post('ship/:orderId')
  async generateWaybill(@Request() req: any, @Param('orderId') orderId: string) {
    return this.logisticsService.generateWaybill(orderId, req.user.userId); // req.user.userId is mapped from JWT
  }
}
