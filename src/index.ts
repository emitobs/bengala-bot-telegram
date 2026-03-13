import express from 'express';
import { config, validateConfig } from './config';
import { BengalaBot } from './bot';

async function main(): Promise<void> {
  console.log('🛍️  Bengala Max — Telegram Image Bot (webhook mode)');
  console.log('===================================================\n');

  validateConfig();

  console.log(`📡 Backend API: ${config.apiUrl}`);
  console.log(`🌐 Webhook domain: ${config.webhookDomain}`);
  console.log(`👤 Admin: ${config.adminEmail}`);
  console.log(
    `🔒 Usuarios autorizados: ${
      config.allowedUserIds.length > 0 ? config.allowedUserIds.join(', ') : 'TODOS (sin restricción)'
    }`,
  );
  console.log('');

  const bot = new BengalaBot();

  // Pre-authenticate with backend
  await bot.init();

  // Set up Express server for Passenger
  const app = express();

  // Health check endpoint
  app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'bengala-telegram-bot' });
  });

  // Telegram webhook endpoint
  const webhookUrl = `${config.webhookDomain}${config.webhookPath}`;
  app.use(bot.telegraf.webhookCallback(config.webhookPath));

  // Set the webhook with Telegram
  await bot.telegraf.telegram.setWebhook(webhookUrl);
  console.log(`🔗 Webhook set: ${webhookUrl}`);

  // Start HTTP server
  app.listen(config.port, () => {
    console.log(`🚀 Server listening on port ${config.port}`);
    console.log('🤖 Bengala Bot iniciado. Esperando mensajes via webhook...');
  });

  // Graceful shutdown
  process.once('SIGINT', () => {
    bot.stop('SIGINT');
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('❌ Error fatal al iniciar el bot:', error.message);
  process.exit(1);
});
