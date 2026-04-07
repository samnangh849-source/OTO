import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || '';

export class GoogleSheetService {
  private static async request(action: string, data: any = {}) {
    if (!GOOGLE_SCRIPT_URL) {
      console.error('GOOGLE_SCRIPT_URL is not defined in .env');
      return null;
    }

    try {
      const response = await axios.post(GOOGLE_SCRIPT_URL, {
        action,
        ...data
      });
      return response.data;
    } catch (error) {
      console.error(`GoogleSheetService error (${action}):`, error);
      return null;
    }
  }

  // TgAccount operations
  static async getAccounts() {
    return this.request('get_accounts');
  }

  static async saveAccount(account: any) {
    return this.request('save_account', { account });
  }

  static async deleteAccount(id: string) {
    return this.request('delete_account', { id });
  }

  // Message operations
  static async getMessages(accountId?: string, lastId?: number) {
    return this.request('get_messages', { accountId, lastId });
  }

  static async saveMessage(message: any) {
    return this.request('save_message', { message });
  }

  static async findMessage(telegramMessageId: number, accountId: string) {
    return this.request('find_message', { telegramMessageId, accountId });
  }

  static async findLastMessage(accountId: string) {
    return this.request('find_last_message', { accountId });
  }

  // Template operations
  static async getTemplates() {
    return this.request('get_templates');
  }

  static async saveTemplate(template: any) {
    return this.request('save_template', { template });
  }

  static async deleteTemplate(id: number) {
    return this.request('delete_template', { id });
  }

  // User operations
  static async getUsers() {
    return this.request('get_users');
  }

  static async saveUser(user: any) {
    return this.request('save_user', { user });
  }

  // Setting operations
  static async getSettings() {
    return this.request('get_settings');
  }

  static async saveSetting(key: string, value: string) {
    return this.request('save_setting', { key, value });
  }
}
