import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../database/entities/order.entity';
import { OrderStatus } from '../database/enums';

@Injectable()
export class LogisticsService {
  private readonly logger = new Logger(LogisticsService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  async generateWaybill(orderId: string, producerId: string): Promise<Order> {
    const order = await this.orderRepository.findOne({ where: { id: orderId, producer_id: producerId } });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.PROCESSING) {
      throw new BadRequestException('Order must be in PROCESSING state to generate shipping label');
    }

    // Mocking Shiprocket API Integration
    this.logger.log(`Calling Shiprocket API to generate AWB for Order ${order.order_number}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock successful Shiprocket response
    const mockTrackingNumber = `AWB-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // Update order state
    order.tracking_number = mockTrackingNumber;
    order.status = OrderStatus.SHIPPED;

    await this.orderRepository.save(order);
    this.logger.log(`Order ${order.order_number} marked as SHIPPED with AWB ${mockTrackingNumber}`);

    return order;
  }
}
