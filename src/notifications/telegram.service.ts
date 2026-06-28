import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService {
  // Logger is NestJS's built-in way to print colored logs
  private readonly logger = new Logger(TelegramService.name);

  // Telegram Bot token from environment variables
  private readonly botToken: string;

  // chat ID where messages will be sent
  private readonly chatId: string;

  // Base URL for Telegram Bot API
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN') ?? '';
    this.chatId = this.config.get<string>('TELEGRAM_CHAT_ID') ?? '';
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendMessage(message: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      this.logger.warn(
        'Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env',
      );
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });

      const data = (await response.json()) as {
        ok: boolean;
        description?: string;
      };

      if (!data.ok) {
        this.logger.error(`Telegram API error: ${data.description}`);
        return false;
      }

      this.logger.log(`✅ Telegram message sent to chat ${this.chatId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send Telegram message: ${error}`);
      return false;
    }
  }
}
