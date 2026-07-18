import { Controller, Get, Patch, Post, Param, Body, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../database/enums';

@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('kyc/pending')
  async getPendingKyc() {
    return this.adminService.getPendingKyc();
  }

  @Get('kyc/:id/documents')
  async getKycDocuments(@Param('id') id: string) {
    return this.adminService.getKycDocuments(id);
  }

  @Patch('kyc/:id/approve')
  async approveKyc(@Param('id') id: string) {
    return this.adminService.approveKyc(id);
  }

  @Patch('kyc/:id/reject')
  async rejectKyc(@Param('id') id: string, @Body('reason') reason: string) {
    return this.adminService.rejectKyc(id, reason);
  }

  @Get('stats')
  async getStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('users')
  async getUsers() {
    return this.adminService.getAllUsers();
  }

  @Get('products')
  async getProducts() {
    return this.adminService.getAllProducts();
  }

  @Patch('products/:id/suspend')
  async suspendProduct(@Param('id') id: string) {
    return this.adminService.suspendProduct(id);
  }

  @Get('schemes')
  async getSchemes() {
    return this.adminService.getSchemes();
  }

  @Post('schemes')
  async createScheme(@Body() body: any) {
    return this.adminService.createScheme(body);
  }
}
