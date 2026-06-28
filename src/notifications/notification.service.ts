import { Injectable } from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Injectable()
export class NotificationService {
  constructor(private readonly telegram: TelegramService) {}

  // LOW STOCK ALERT
  async notifyLowStock(params: {
    companyName: string;
    productName: string;
    sku: string;
    stock: number;
    minStock: number;
    unit: string;
  }): Promise<void> {
    const { companyName, productName, sku, stock, minStock, unit } = params;

    // Build Telegram message
    const message = [
      `⚠️ <b>LOW STOCK ALERT</b>`,
      ``,
      `🏢 <b>Company:</b> ${companyName}`,
      `📦 <b>Product:</b> ${productName}`,
      `🔖 <b>SKU:</b> <code>${sku}</code>`,
      ``,
      `📉 <b>Current Stock:</b> ${stock} ${unit}`,
      `🚨 <b>Minimum Level:</b> ${minStock} ${unit}`,
      ``,
      `⚡ <i>Please reorder immediately to avoid stockout.</i>`,
      ``,
      `🕐 ${this.getIndiaTime()}`,
    ].join('\n');

    await this.telegram.sendMessage(message);
  }

  // OUT OF STOCK ALERT

  async notifyOutOfStock(params: {
    companyName: string;
    productName: string;
    sku: string;
    unit: string;
  }): Promise<void> {
    const { companyName, productName, sku, unit } = params;

    const message = [
      `🚨 <b>OUT OF STOCK — CRITICAL</b>`,
      ``,
      `🏢 <b>Company:</b> ${companyName}`,
      `📦 <b>Product:</b> ${productName}`,
      `🔖 <b>SKU:</b> <code>${sku}</code>`,
      ``,
      `❌ <b>Stock:</b> 0 ${unit}`,
      ``,
      `🔴 <i>This product is completely out of stock!</i>`,
      `<i>Take immediate action to restock.</i>`,
      ``,
      `🕐 ${this.getIndiaTime()}`,
    ].join('\n');

    await this.telegram.sendMessage(message);
  }

  //  PAYMENT OVERDUE ALERT
  async notifyPaymentOverdue(params: {
    companyName: string;
    customerName: string;
    invoiceId: string;
    amount: number;
    dueDaysAgo: number;
  }): Promise<void> {
    const { companyName, customerName, invoiceId, amount, dueDaysAgo } = params;

    const message = [
      `💸 <b>PAYMENT OVERDUE</b>`,
      ``,
      `🏢 <b>Company:</b> ${companyName}`,
      `👤 <b>Customer:</b> ${customerName}`,
      `🧾 <b>Invoice:</b> <code>${invoiceId}</code>`,
      `💰 <b>Amount:</b> ₹${amount.toLocaleString('en-IN')}`,
      `📅 <b>Overdue by:</b> ${dueDaysAgo} day(s)`,
      ``,
      `⚡ <i>Follow up with the customer immediately.</i>`,
      ``,
      `🕐 ${this.getIndiaTime()}`,
    ].join('\n');

    await this.telegram.sendMessage(message);
  }

  //  DAILY SUMMARY REPORT
  async notifyDailySummary(params: {
    companyName: string;
    date: string;
    totalSales: number;
    totalDeliveries: number;
    pendingDeliveries: number;
    newCustomers: number;
    overduePayments: number;
  }): Promise<void> {
    const {
      companyName,
      date,
      totalSales,
      totalDeliveries,
      pendingDeliveries,
      newCustomers,
      overduePayments,
    } = params;

    const message = [
      `📊 <b>DAILY SUMMARY</b>`,
      ``,
      `🏢 <b>Company:</b> ${companyName}`,
      `📅 <b>Date:</b> ${date}`,
      ``,
      `💰 <b>Total Sales:</b> ₹${totalSales.toLocaleString('en-IN')}`,
      `🚚 <b>Deliveries Completed:</b> ${totalDeliveries}`,
      `⏳ <b>Pending Deliveries:</b> ${pendingDeliveries}`,
      `👤 <b>New Customers:</b> ${newCustomers}`,
      `💸 <b>Overdue Payments:</b> ${overduePayments}`,
      ``,
      `🕐 ${this.getIndiaTime()}`,
    ].join('\n');

    await this.telegram.sendMessage(message);
  }

  // TEST NOTIFICATION

  async notifyTest(companyName: string): Promise<void> {
    const message = [
      `✅ <b>TEST NOTIFICATION</b>`,
      ``,
      `🏢 <b>Company:</b> ${companyName}`,
      ``,
      `<i>Telegram is connected and working correctly!</i>`,
      `<i>Your Balaji Aqua ERP alerts are active.</i>`,
      ``,
      `🕐 ${this.getIndiaTime()}`,
    ].join('\n');

    await this.telegram.sendMessage(message);
  }

  private getIndiaTime(): string {
    return new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
}
