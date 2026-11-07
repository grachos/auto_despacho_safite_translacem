/**
 * Vercel Serverless Function: POST /api/telegram/webhook
 * Recibe las actualizaciones de Telegram (mensajes, comandos y botones callback)
 */

import { handleTelegramUpdate } from '../../src/telegram/handler.js';

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  }

  // Validación opcional de token secreto si se configuró en setWebhook
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (headerSecret !== secret) {
      console.warn('[Telegram] Intento de acceso no autorizado al webhook');
      return res.status(401).json({ error: 'No autorizado' });
    }
  }

  const update = req.body;
  if (!update) {
    return res.status(400).json({ error: 'Cuerpo de solicitud vacío' });
  }

  try {
    await handleTelegramUpdate(update);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Telegram Webhook] Error procesando actualización:', err);
    // Respondemos 200 a Telegram para evitar que reintente en bucle infinito
    return res.status(200).json({ ok: false, error: err.message });
  }
}

