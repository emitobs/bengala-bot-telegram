import express from 'express';
import { config, usePolling, validateConfig } from './config';
import { BengalaBot } from './bot';

async function main(): Promise<void> {
  const mode = usePolling ? 'polling' : 'webhook';
  console.log(`🛍️  Bengala Max — Telegram Image Bot (${mode} mode)`);
  console.log('===================================================\n');

  validateConfig();

  console.log(`📡 Backend API: ${config.apiUrl}`);
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

  if (usePolling) {
    // ---- Local development: long-polling ----
    // Delete any existing webhook so polling works
    await bot.telegraf.telegram.deleteWebhook();
    await bot.telegraf.launch();
    console.log('🤖 Bot iniciado en modo polling (desarrollo local).');
  } else {
    // ---- Production: webhook via Express ----
    console.log(`🌐 Webhook domain: ${config.webhookDomain}`);

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
  }

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
