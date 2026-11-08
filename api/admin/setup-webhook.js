/**
 * Vercel Serverless Function: POST & GET /api/admin/setup-webhook
 * Permite vincular el Webhook de Telegram con 1 clic desde el Panel de Administración.
 */

import { TelegramBotClient } from '../../src/telegram/api.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  // Validación de seguridad de Administrador
  const adminKey = req.headers['x-admin-key'] || req.query.adminKey || req.body?.adminKey;
  const expectedKey = (process.env.ADMIN_KEY || '').trim().replace(/^["']|["']$/g, '');
  const providedKey = (adminKey || '').trim().replace(/^["']|["']$/g, '');

  if (expectedKey && providedKey !== expectedKey) {
    return res.status(401).json({ error: 'No autorizado. Se requiere x-admin-key válida.' });
  }

  // Comprobar si el token de Telegram está configurado
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(200).json({
      success: false,
      configured: false,
      error: 'TELEGRAM_BOT_TOKEN no está configurado en las variables de entorno de Vercel.',
      message: 'Agrega TELEGRAM_BOT_TOKEN en Vercel (Project Settings > Environment Variables) y haz un Redeploy.',
    });
  }

  try {
    const bot = new TelegramBotClient(token);

    // Si es GET, consultar el estado actual
    if (req.method === 'GET') {
      const [botInfo, webhookInfo] = await Promise.all([
        bot.getMe().catch((e) => ({ error: e.message })),
        bot.getWebhookInfo().catch((e) => ({ error: e.message })),
      ]);
      return res.status(200).json({
        success: true,
        configured: true,
        botInfo,
        webhookInfo,
      });
    }

    // Si es POST, configurar el Webhook con la URL de Vercel
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = process.env.VERCEL_PROJECT_URL || `${proto}://${host}`;
    const cleanUrl = baseUrl.replace(/\/$/, '');
    const webhookUrl = `${cleanUrl}/api/telegram/webhook`;

    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || null;
    const setResult = await bot.setWebhook(webhookUrl, secretToken);
    const botInfo = await bot.getMe();

    return res.status(200).json({
      success: true,
      configured: true,
      mensaje: 'Webhook de Telegram configurado exitosamente.',
      webhookUrl,
      bot: {
        id: botInfo.id,
        nombre: botInfo.first_name,
        username: botInfo.username,
        link: `https://t.me/${botInfo.username}`,
      },
      telegramResponse: setResult,
    });
  } catch (err) {
    console.error('[Admin Setup Webhook Error]', err);
    return res.status(500).json({
      success: false,
      configured: true,
      error: err.message || 'Error al configurar Webhook en Telegram',
    });
  }
}
