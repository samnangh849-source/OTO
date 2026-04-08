import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || '';

export class GoogleSheetService {
  private static async request(action: string, data: any = {}, licenseKey?: string) {
    if (!GOOGLE_SCRIPT_URL) {
      console.error('GOOGLE_SCRIPT_URL is not defined in .env');
      return null;
    }

    try {
      const response = await axios.post(GOOGLE_SCRIPT_URL, {
        action,
        licenseKey, // Send licenseKey to separate data in GAS
        ...data
      });
      return response.data;
    } catch (error) {
      console.error(`GoogleSheetService error (${action}):`, error);
      return null;
    }
  }

  // TgAccount operations
  static async getAccounts(licenseKey?: string) {
    return this.request('get_accounts', {}, licenseKey);
  }

  static async saveAccount(account: any, licenseKey?: string) {
    return this.request('save_account', { account }, licenseKey);
  }

  static async deleteAccount(id: string, licenseKey?: string) {
    return this.request('delete_account', { id }, licenseKey);
  }

  // Message operations
  static async getMessages(licenseKey?: string, accountId?: string, lastId?: number) {
    return this.request('get_messages', { accountId, lastId }, licenseKey);
  }

  static async saveMessage(message: any, licenseKey?: string) {
    return this.request('save_message', { message }, licenseKey);
  }

  static async findMessage(telegramMessageId: number, accountId: string, licenseKey?: string) {
    return this.request('find_message', { telegramMessageId, accountId }, licenseKey);
  }

  static async findLastMessage(accountId: string, licenseKey?: string) {
    return this.request('find_last_message', { accountId }, licenseKey);
  }

  // Template operations
  static async getTemplates(licenseKey?: string) {
    return this.request('get_templates', {}, licenseKey);
  }

  static async saveTemplate(template: any, licenseKey?: string) {
    return this.request('save_template', { template }, licenseKey);
  }

  static async deleteTemplate(id: number, licenseKey?: string) {
    return this.request('delete_template', { id }, licenseKey);
  }

  // Setting operations
  static async getSettings(licenseKey?: string) {
    return this.request('get_settings', {}, licenseKey);
  }

  static async saveSetting(key: string, value: string, licenseKey?: string) {
    return this.request('save_setting', { key, value }, licenseKey);
  }
}
