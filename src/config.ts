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

    /** Webhook domain (e.g. https://bot.bengalamax.uy) */
    webhookDomain: process.env.WEBHOOK_DOMAIN || '',

    /** Port for the HTTP server (Passenger sets this automatically) */
    port: parseInt(process.env.PORT || '3000', 10),

    /** Secret path for the webhook (defaults to bot token for security) */
    webhookPath: process.env.WEBHOOK_PATH || '',
};

export function validateConfig(): void {
    if (!config.telegramToken) {
        throw new Error('TELEGRAM_BOT_TOKEN is required');
    }
    if (!config.webhookDomain) {
        throw new Error('WEBHOOK_DOMAIN is required (e.g. https://bot.bengalamax.uy)');
    }
    if (config.allowedUserIds.length === 0) {
        console.warn('⚠️  ALLOWED_USER_IDS not set — bot is open to everyone!');
    }
    // Use a hash of the token as webhook path for security
    if (!config.webhookPath) {
        config.webhookPath = `/webhook/${config.telegramToken.split(':')[0]}`;
    }
}
