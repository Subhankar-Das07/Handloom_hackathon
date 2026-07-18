import { Controller, Post, Body, Headers, Res, HttpStatus, Logger } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('api/v1/payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);
  private readonly webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_secret_123';

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook')
  async handleRazorpayWebhook(@Body() body: any, @Headers('x-razorpay-signature') signature: string, @Res() res: any) {
    if (!signature) {
      return res.status(HttpStatus.BAD_REQUEST).send('Missing signature');
    }

    const isValid = this.paymentsService.verifyRazorpaySignature(body, signature, this.webhookSecret);
    
    if (!isValid && process.env.NODE_ENV === 'production') {
      this.logger.error('Invalid Razorpay signature');
      return res.status(HttpStatus.BAD_REQUEST).send('Invalid signature');
    } else if (!isValid) {
      this.logger.warn('Invalid signature, but allowing in development mode');
    }

    try {
      const result = await this.paymentsService.handleWebhook(body);
      if (result.success) {
        return res.status(HttpStatus.OK).send(result.message);
      } else {
        return res.status(HttpStatus.BAD_REQUEST).send(result.message);
      }
    } catch (error) {
      this.logger.error('Error processing webhook', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Webhook processing failed');
    }
  }
}
