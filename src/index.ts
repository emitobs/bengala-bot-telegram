import { config, validateConfig } from './config';
import { BengalaBot } from './bot';

async function main(): Promise<void> {
  console.log('🛍️  Bengala Max — Telegram Image Bot');
  console.log('====================================\n');

  // Validate configuration
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

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  try {
    await bot.start();
  } catch (error: any) {
    console.error('❌ Error fatal al iniciar el bot:', error.message);
    process.exit(1);
  }
}

main();
