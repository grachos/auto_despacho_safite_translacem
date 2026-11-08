/**
 * Vercel Serverless Function: POST /api/agent
 * Endpoint del Agente de IA para interactuar en lenguaje natural o llamadas estructuradas.
 * 
 * Body esperado:
 * { "message": "Despacha el manifiesto 17505 al ministerio" }
 * o
 * { "action": "despachar", "numeroManifiesto": 17505 }
 */

import { SafiteToolDispatcher } from '../src/agentTools.js';
import { requireAdmin } from '../src/auth/guards.js';

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  }

  if (!requireAdmin(req, res)) return;

  const { message, action, numeroManifiesto } = req.body || {};
  const dispatcher = new SafiteToolDispatcher();

  try {
    // 1. Invocación estructurada directa
    if (action) {
      if (action === 'consultar' || action === 'resumen') {
        const resumen = await dispatcher.execute('obtener_resumen_viaje', {
          numero_manifiesto: Number(numeroManifiesto),
        });
        return res.status(200).json({ success: true, data: resumen });
      }

      if (action === 'despachar') {
        const resultado = await dispatcher.execute('despachar_manifiesto_ministerio', {
          numero_manifiesto: Number(numeroManifiesto),
        });
        return res.status(200).json({ success: true, data: resultado });
      }
    }

    // 2. Procesamiento de Lenguaje Natural (Intenciones de despacho o consulta)
    if (message) {
      const matchNumero = message.match(/\b\d{3,7}\b/);
      const numViaje = matchNumero ? Number(matchNumero[0]) : null;

      const texto = message.toLowerCase();

      // Intención de Despacho / Firma
      if (texto.includes('despach') || texto.includes('firmar') || texto.includes('enviar') || texto.includes('transmitir')) {
        if (!numViaje) {
          return res.status(200).json({
            reply: 'Por favor indícame el número de manifiesto o viaje que deseas despachar al Ministerio.',
          });
        }

        const resDespacho = await dispatcher.execute('despachar_manifiesto_ministerio', {
          numero_manifiesto: numViaje,
        });

        const radicado = resDespacho.radicadoManifiestoRndc || 'N/A';
        const msgRespuesta = resDespacho.exito
          ? `✅ Viaje #${numViaje} despachado exitosamente ante el Ministerio de Transporte. Radicado RNDC: **${radicado}**.`
          : `⚠️ No se pudo completar el despacho del viaje #${numViaje}: ${resDespacho.mensaje || 'Error en la respuesta'}`;

        return res.status(200).json({
          reply: msgRespuesta,
          data: resDespacho,
        });
      }

      // Intención de Consulta / Estado / Diagnóstico
      if (texto.includes('consult') || texto.includes('estado') || texto.includes('ver') || texto.includes('como va') || texto.includes('resumen')) {
        if (!numViaje) {
          return res.status(200).json({
            reply: 'Por favor indícame el número del viaje o manifiesto que deseas consultar.',
          });
        }

        const resumen = await dispatcher.execute('obtener_resumen_viaje', {
          numero_manifiesto: numViaje,
        });

        const estadoRndc = resumen.manifiestoAutorizadoRndc
          ? `Autorizado en RNDC con radicado #${resumen.radicadoManifiestoRndc}`
          : 'Pendiente de firma en el Ministerio';

        const remesasPendientes = resumen.remesas.filter((r) => !r.autorizadaRndc).length;

        const reply = `📋 **Manifiesto #${numViaje}**\n` +
          `- **Placa**: ${resumen.placa || 'N/A'}\n` +
          `- **Conductor**: ${resumen.conductor || 'N/A'}\n` +
          `- **Ruta**: ${resumen.origen || 'N/A'} ➡️ ${resumen.destino || 'N/A'}\n` +
          `- **Estado RNDC**: ${estadoRndc}\n` +
          `- **Remesas**: ${resumen.totalRemesas} total (${remesasPendientes} pendientes de firma)\n\n` +
          (resumen.manifiestoAutorizadoRndc
            ? 'Este viaje ya está legalizado ante el Ministerio.'
            : '¿Deseas que proceda con el despacho ante el Ministerio?');

        return res.status(200).json({
          reply,
          data: resumen,
        });
      }

      // Mensaje de ayuda / fallback
      return res.status(200).json({
        reply: 'Hola. Soy tu Agente de Despachos SAFITE & RNDC. Puedes pedirme:\n' +
          '- *"Consulta el viaje 17505"*\n' +
          '- *"Despacha el manifiesto 17505 al ministerio"*\n' +
          '- *"Ver estado de remesas del viaje 17505"*',
      });
    }

    return res.status(400).json({ error: 'Debes proporcionar un mensaje o una acción.' });
  } catch (error) {
    console.error('Error en el Agente:', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Error procesando la solicitud en el Agente',
    });
  }
}

