/**
 * Script para registrar la URL de tu proyecto en Vercel como Webhook de Telegram.
 * 
 * Uso:
 * node scripts/setTelegramWebhook.js https://tu-proyecto.vercel.app
 */

import 'dotenv/config';
import { TelegramBotClient } from '../src/telegram/api.js';

const appUrl = process.argv[2] || process.env.VERCEL_PROJECT_URL;

if (!appUrl) {
  console.error('❌ Debes proporcionar la URL de tu app en Vercel.');
  console.log('Ejemplo: node scripts/setTelegramWebhook.js https://mi-agente-safite.vercel.app');
  process.exit(1);
}

async function main() {
  const cleanUrl = appUrl.replace(/\/$/, '');
  const webhookUrl = `${cleanUrl}/api/telegram/webhook`;
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || null;

  console.log(`📡 Registrando Webhook en Telegram: ${webhookUrl}`);

  try {
    const bot = new TelegramBotClient();
    const res = await bot.setWebhook(webhookUrl, secretToken);
    console.log('✅ Webhook registrado con éxito en Telegram:', res);
  } catch (err) {
    console.error('❌ Error al configurar Webhook:', err.message);
  }
}

main();

