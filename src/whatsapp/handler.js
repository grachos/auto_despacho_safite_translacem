/**
 * Manejador de eventos y mensajes de WhatsApp Cloud API para Safite & RNDC.
 * Estructurado para activarse cuando se configuren las credenciales de Meta.
 */

import { findUserByWhatsAppPhone, linkWhatsAppUser, getClientForUser, logDispatch } from '../store/userStore.js';
import { DispatchOrchestrator } from '../orchestrator.js';

export async function sendWhatsAppMessage(phone, text) {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneId || !token) {
    console.warn('[WhatsApp] WHATSAPP_PHONE_ID o WHATSAPP_TOKEN no configurados.');
    return;
  }

  const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: text },
    }),
  });
}

export async function handleWhatsAppMessage(message) {
  const fromPhone = message.from;
  const text = message.text?.body?.trim() || '';

  if (!text) return;

  // 1. Comando de Vinculación: VINCULAR 123456
  if (text.toUpperCase().startsWith('VINCULAR')) {
    const code = text.split(/\s+/)[1];
    if (!code) {
      return sendWhatsAppMessage(fromPhone, 'Para vincular tu cuenta envía: VINCULAR seguido del código de 6 dígitos.');
    }

    const linkedUser = await linkWhatsAppUser(code, fromPhone);
    if (!linkedUser) {
      return sendWhatsAppMessage(fromPhone, 'Ese código de vinculación no es válido o ya expiró.');
    }

    return sendWhatsAppMessage(
      fromPhone,
      `🎉 ¡Bienvenido, ${linkedUser.nombre}! Tu WhatsApp quedó vinculado a tu usuario de SAFITE (${linkedUser.safite_usuario}).`
    );
  }

  // 2. Verificar usuario vinculado
  const user = await findUserByWhatsAppPhone(fromPhone);
  if (!user) {
    return sendWhatsAppMessage(
      fromPhone,
      'Hola 👋 Tu número aún no está vinculado a una cuenta de Safite. Ingresa con tu link de invitación para vincularte.'
    );
  }

  // 3. Procesar consulta o solicitud de despacho
  const matchNumero = text.match(/\b\d{3,7}\b/);
  const numManifiesto = matchNumero ? Number(matchNumero[0]) : null;

  if (!numManifiesto) {
    return sendWhatsAppMessage(
      fromPhone,
      `Hola ${user.nombre}. Indícame el número de manifiesto que deseas consultar o despachar.`
    );
  }

  const client = await getClientForUser(user);
  const orchestrator = new DispatchOrchestrator(client);
  const resumen = await orchestrator.obtenerResumenViaje(numManifiesto);

  const respuesta =
    `📋 *MANIFIESTO #${resumen.numeroManifiesto}*\n` +
    `• Placa: ${resumen.placa || 'N/A'}\n` +
    `• Ruta: ${resumen.origen} ➡️ ${resumen.destino}\n` +
    `• RNDC: ${resumen.manifiestoAutorizadoRndc ? 'AUTORIZADO (#' + resumen.radicadoManifiestoRndc + ')' : 'PENDIENTE'}`;

  return sendWhatsAppMessage(fromPhone, respuesta);
}

