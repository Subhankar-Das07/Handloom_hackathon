import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../database/entities/order.entity';
import { StorageService } from '../storage/storage.service';
import PDFDocument from 'pdfkit';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly storageService: StorageService,
  ) {}

  async generateInvoice(orderId: string): Promise<string> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: {
        buyer: true,
        producer: true,
        items: { product: true }
      }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', async () => {
          const pdfBuffer = Buffer.concat(buffers);
          
          // Upload to S3/MinIO
          const key = `invoices/${order.order_number}-${Date.now()}.pdf`;
          try {
            const url = await this.storageService.uploadBuffer(pdfBuffer, key, 'application/pdf');
            this.logger.log(`Generated invoice for Order ${order.order_number}: ${url}`);
            
            // In a real scenario we might save the URL back to the order entity here
            resolve(url);
          } catch (uploadError) {
            this.logger.error('Failed to upload invoice PDF', uploadError);
            reject(uploadError);
          }
        });

        // Header
        doc.fontSize(20).text('TAX INVOICE', { align: 'center' }).moveDown();
        
        // Platform details
        doc.fontSize(10).text('Tanthavi Handloom Marketplace', 50, 90);
        doc.text('GSTIN: 27AABCU9603R1ZX');
        doc.text('New Delhi, India').moveDown();

        // Order Details
        doc.text(`Invoice No: INV-${order.order_number}`);
        doc.text(`Date: ${new Date().toLocaleDateString()}`);
        doc.text(`Order Ref: ${order.order_number}`).moveDown();

        // Billing
        doc.text('Bill To:');
        doc.text(order.shipping_address?.fullName || 'Customer');
        doc.text(order.buyer.email || 'N/A');
        const address = order.shipping_address;
        if (address) {
          doc.text(`${address.addressLine1}, ${address.city}, ${address.state} - ${address.pincode}`);
        }
        
        // Items Table
        doc.moveDown();
        const tableTop = 250;
        doc.font('Helvetica-Bold');
        doc.text('Item', 50, tableTop);
        doc.text('Qty', 300, tableTop);
        doc.text('Price', 350, tableTop);
        doc.text('Total', 450, tableTop);
        
        doc.font('Helvetica');
        let y = tableTop + 20;
        
        if (order.items && order.items.length > 0) {
          order.items.forEach(item => {
            doc.text(item.product_title, 50, y, { width: 200 });
            doc.text(item.quantity.toString(), 300, y);
            doc.text(`Rs. ${item.unit_price}`, 350, y);
            doc.text(`Rs. ${item.total_price}`, 450, y);
            y += 20;
          });
        } else {
          doc.text(`Order Total: Rs. ${order.total_amount}`, 50, y);
          y += 20;
        }

        doc.moveDown();
        y += 20;
        
        // Summary
        doc.font('Helvetica-Bold');
        doc.text('Summary', 350, y);
        doc.font('Helvetica');
        y += 15;
        doc.text(`Subtotal: Rs. ${order.subtotal}`, 350, y);
        y += 15;
        doc.text(`Tax (GST): Rs. ${order.tax_amount}`, 350, y);
        y += 15;
        doc.text(`Shipping: Rs. ${order.shipping_fee}`, 350, y);
        y += 15;
        doc.font('Helvetica-Bold');
        doc.text(`Total: Rs. ${order.total_amount}`, 350, y);

        // Footer
        doc.font('Helvetica').fontSize(10);
        doc.text('Thank you for supporting handloom artisans!', 50, 700, { align: 'center' });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
