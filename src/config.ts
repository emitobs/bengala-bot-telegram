import dotenv from 'dotenv';
dotenv.config();

export const config = {
    /** Telegram bot token from @BotFather */
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',

    /** Telegram user IDs allowed to use the bot */
    allowedUserIds: (process.env.ALLOWED_USER_IDS || '')
        .split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id)),

    /** Backend API base URL */
    apiUrl: process.env.API_URL || 'http://localhost:3000/api',

    /** Admin credentials for authenticating with the backend */
    adminEmail: process.env.ADMIN_EMAIL || 'admin@bengalamax.uy',
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
};

export function validateConfig(): void {
    if (!config.telegramToken) {
        throw new Error('TELEGRAM_BOT_TOKEN is required');
    }
    if (config.allowedUserIds.length === 0) {
        console.warn('⚠️  ALLOWED_USER_IDS not set — bot is open to everyone!');
    }
}
