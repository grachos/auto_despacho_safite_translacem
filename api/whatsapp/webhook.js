/**
 * Vercel Serverless Function: GET/POST /api/whatsapp/webhook
 * Integración con WhatsApp Cloud API (Meta)
 */

import { handleWhatsAppMessage } from '../../src/whatsapp/handler.js';

export default async function handler(req, res) {
  // Verificación de Webhook por Meta (GET)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === expectedToken) {
      console.log('[WhatsApp Webhook] Verificado con éxito por Meta.');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Token de verificación de WhatsApp inválido.' });
  }

  // Recepción de mensajes (POST)
  if (req.method === 'POST') {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;
          if (value?.messages) {
            for (const message of value.messages) {
              await handleWhatsAppMessage(message);
            }
          }
        }
      }
      return res.status(200).json({ status: 'ok' });
    }

    return res.status(404).json({ error: 'Evento no reconocido' });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
