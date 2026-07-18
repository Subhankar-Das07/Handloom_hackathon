import { Controller, Post, Param, UseGuards } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/v1/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @UseGuards(JwtAuthGuard)
  @Post(':orderId/generate')
  async generateInvoice(@Param('orderId') orderId: string) {
    const url = await this.invoicesService.generateInvoice(orderId);
    return { success: true, url };
  }
}
