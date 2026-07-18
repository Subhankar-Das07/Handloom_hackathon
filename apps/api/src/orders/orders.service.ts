import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../database/entities/order.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { Product } from '../database/entities/product.entity';
import { ProducerProfile } from '../database/entities/producer-profile.entity';
import { OrderStatus, ProductStatus } from '../database/enums';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProducerProfile)
    private producerProfileRepository: Repository<ProducerProfile>,
  ) {}

  async create(buyerId: string, data: any): Promise<Order> {
    const { items, shipping_address } = data;
    
    if (!items || items.length === 0) {
      throw new Error('Order items cannot be empty');
    }

    // Safe UUID check pattern
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let dbProduct: Product | null = null;
    const isFirstItemUuid = uuidRegex.test(items[0].product_id);
    
    if (isFirstItemUuid) {
      dbProduct = await this.productRepository.findOne({ where: { id: items[0].product_id } });
    }

    // Fallback: If product doesn't exist or is a demo ID, resolve or seed a real DB product
    if (!dbProduct) {
      dbProduct = await this.productRepository.findOne({ where: {} });
      
      if (!dbProduct) {
        let producer = await this.producerProfileRepository.findOne({ where: {} });
        if (!producer) {
          producer = this.producerProfileRepository.create({
            id: '888e4567-e89b-12d3-a456-426614174888',
            user_id: buyerId,
            display_name: 'Demo Artisan',
            business_name: 'Handloom Collective',
            is_verified: true,
          });
          producer = await this.producerProfileRepository.save(producer);
        }

        const newDemoProduct = this.productRepository.create({
          id: '999e4567-e89b-12d3-a456-426614174999',
          title: 'Banarasi Katan Silk Handloom Saree (Demo)',
          slug: 'banarasi-katan-silk-handloom-saree-demo',
          sku: 'DEMO-BAN-001',
          base_price: 18500,
          mrp: 22000,
          hsn_code: '5007',
          status: ProductStatus.ACTIVE,
          producer_id: producer.id,
          category_id: '123e4567-e89b-12d3-a456-426614174000',
        });
        dbProduct = await this.productRepository.save(newDemoProduct);
      }
    }

    if (!dbProduct) {
      throw new NotFoundException('Failed to resolve or create fallback product');
    }

    let subtotal = 0;
    const resolvedItems = [];

    // 2. Resolve all items, verify prices, calculate subtotal
    for (const item of items) {
      let product: Product | null = null;
      const isItemUuid = uuidRegex.test(item.product_id);
      
      if (isItemUuid) {
        product = await this.productRepository.findOne({ where: { id: item.product_id } });
      }
      
      const activeProduct = product || dbProduct;
      
      const itemSubtotal = Number(activeProduct.base_price) * item.quantity;
      subtotal += itemSubtotal;

      resolvedItems.push({
        product: activeProduct,
        quantity: item.quantity,
        price: Number(activeProduct.base_price),
        total: itemSubtotal,
      });
    }

    const gstRate = 5; // 5% GST on handloom
    const taxAmount = (subtotal * gstRate) / 100;
    const totalAmount = subtotal + taxAmount;

    // 3. Create the Order
    const orderNumber = `TNT-${Date.now().toString().slice(-8)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const order = this.orderRepository.create({
      order_number: orderNumber,
      buyer_id: buyerId,
      producer_id: dbProduct.producer_id,
      status: OrderStatus.PAYMENT_CONFIRMED, // Pre-approve mock payments for demo flow
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      shipping_address,
      currency: 'INR',
      payment_method: 'Razorpay (Mocked)',
    });

    const savedOrder = await this.orderRepository.save(order);

    // 4. Save order items
    for (const resolved of resolvedItems) {
      const orderItem = this.orderItemRepository.create({
        order_id: savedOrder.id,
        product_id: resolved.product.id,
        product_title: resolved.product.title,
        sku: resolved.product.sku,
        quantity: resolved.quantity,
        unit_price: resolved.price,
        total_price: resolved.total,
        gst_rate: gstRate,
        hsn_code: resolved.product.hsn_code || '5007',
      });
      await this.orderItemRepository.save(orderItem);
    }

    return savedOrder;
  }

  async findAll(userId: string, role: string): Promise<Order[]> {
    if (role === 'producer') {
      const profile = await this.producerProfileRepository.findOne({ where: { user_id: userId } });
      if (!profile) {
        return [];
      }
      return this.orderRepository.find({
        where: { producer_id: profile.id },
        order: { created_at: 'DESC' },
      });
    } else {
      return this.orderRepository.find({
        where: { buyer_id: userId },
        order: { created_at: 'DESC' },
      });
    }
  }

  async findOne(id: string): Promise<any> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    const items = await this.orderItemRepository.find({ where: { order_id: id } });
    return {
      ...order,
      items,
    };
  }

  async updateStatus(id: string, status: OrderStatus, userId: string, role: string): Promise<Order> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    if (role === 'producer') {
      const profile = await this.producerProfileRepository.findOne({ where: { user_id: userId } });
      if (!profile || order.producer_id !== profile.id) {
        throw new NotFoundException(`Order ${id} not found or unauthorized`);
      }
    } else {
      throw new Error('Only producers can update order status');
    }

    order.status = status;
    return this.orderRepository.save(order);
  }
}
