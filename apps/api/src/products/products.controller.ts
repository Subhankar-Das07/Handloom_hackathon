import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../database/enums';

@Controller('api/v1/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll() {
    return this.productsService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRODUCER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('producer')
  async findByProducer(@Request() req: any) {
    return this.productsService.findByProducer(req.user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRODUCER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.productsService.create(req.user.id, body);
  }
}
