/**
 * Manejador de eventos y mensajes de Telegram para Safite & RNDC con control Multi-Usuario.
 * - Requiere que el usuario esté vinculado con credenciales válidas de Safite en MySQL.
 * - Registra cada despacho formalmente al usuario que lo ejecutó.
 * - Aplica el patrón de Dos Fases (Two-Phase Commit) con botones interactivos.
 */

import { TelegramBotClient } from './api.js';
import { DispatchOrchestrator } from '../orchestrator.js';
import {
  findUserByTelegramChatId,
  linkTelegramUser,
  getClientForUser,
  logDispatch,
} from '../store/userStore.js';

export async function handleTelegramUpdate(update) {
  const bot = new TelegramBotClient();

  // =========================================================================
  // 1. GESTIÓN DE BOTONES INTERACTIVOS (CALLBACK QUERY)
  // =========================================================================
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data || '';
    const chatId = cb.message?.chat?.id;
    const messageId = cb.message?.message_id;

    // Verificar usuario autenticado
    const user = await findUserByTelegramChatId(chatId);
    if (!user) {
      await bot.answerCallbackQuery(cb.id, 'No estás vinculado a Safite.', true);
      return;
    }

    if (data.startsWith('confirm:')) {
      const numeroManifiesto = Number(data.split(':')[1]);

      await bot.answerCallbackQuery(cb.id, '⏳ Despachando a nombre de tu usuario en Safite...');

      await bot.editMessageText(
        chatId,
        messageId,
        `⏳ *Transmitiendo y radicando Manifiesto #${numeroManifiesto} ante el Ministerio de Transporte (RNDC)...*\n` +
        `_Operación ejecutada por el usuario Safite: \`${user.safite_usuario}\`_`
      );

      try {
        // Obtener cliente personalizado con la sesión del usuario
        const userClient = await getClientForUser(user);
        const orchestrator = new DispatchOrchestrator(userClient);
        const resultado = await orchestrator.despacharViajeAutonomo(numeroManifiesto);

        if (resultado.exito) {
          const radicado = resultado.radicadoManifiestoRndc || 'N/A';
          await bot.editMessageText(
            chatId,
            messageId,
            `✅ *¡DESPACHO AUTORIZADO POR EL MINISTERIO!* 🚛💨\n\n` +
            `• *Manifiesto Safite*: #${numeroManifiesto}\n` +
            `• *Radicado Oficial RNDC*: \`${radicado}\`\n` +
            `• *Despachador*: ${user.nombre} (\`${user.safite_usuario}\`)\n` +
            `• *Remesas procesadas*: ${resultado.remesas?.length || 1}\n\n` +
            `_El vehículo y la carga ya cuentan con autorización formal de tránsito en el RNDC._`
          );

          // Registrar auditoría en MySQL
          await logDispatch({
            userId: user.id,
            canal: 'TELEGRAM',
            numeroManifiesto,
            radicadoRndc: radicado,
            estado: 'SUCCESS',
            detalle: resultado,
          });
        } else {
          await bot.editMessageText(
            chatId,
            messageId,
            `⚠️ *No se pudo completar el despacho en RNDC*\n\n` +
            `Motivo: ${resultado.mensaje || 'Error en la respuesta del Ministerio.'}`
          );

          await logDispatch({
            userId: user.id,
            canal: 'TELEGRAM',
            numeroManifiesto,
            radicadoRndc: null,
            estado: 'FAILED',
            detalle: resultado,
          });
        }
      } catch (err) {
        console.error('[Telegram] Error al despachar:', err);
        await bot.editMessageText(
          chatId,
          messageId,
          `❌ *Error al despachar ante el Ministerio*\n${err.message || 'Error desconocido'}`
        );
      }
      return;
    }

    if (data.startsWith('cancel:')) {
      const numeroManifiesto = data.split(':')[1];
      await bot.answerCallbackQuery(cb.id, 'Operación cancelada');
      await bot.editMessageText(
        chatId,
        messageId,
        `❌ *Despacho del Manifiesto #${numeroManifiesto} cancelado.*\nNo se transmitió ninguna información al Ministerio.`
      );
      return;
    }

    return;
  }

  // =========================================================================
  // 2. GESTIÓN DE MENSAJES (TEXTO Y NOTAS DE VOZ)
  // =========================================================================
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const username = msg.from?.username || null;
    let texto = msg.text ? msg.text.trim() : '';

    // Soporte para Notas de Voz
    if (!texto && msg.voice) {
      const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return bot.sendMessage(
          chatId,
          '🎙️ _Recibí tu nota de voz._ Para habilitar el procesamiento de audio, configura `OPENAI_API_KEY` o `GROQ_API_KEY`. Mientras tanto, por favor escribe el número de viaje.'
        );
      }

      await bot.sendChatAction(chatId, 'record_voice');
      try {
        const fileInfo = await bot.getFile(msg.voice.file_id);
        const fileUrl = bot.getFileDownloadUrl(fileInfo.file_path);

        const audioRes = await fetch(fileUrl);
        const audioBuffer = await audioRes.arrayBuffer();

        const formData = new FormData();
        const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
        formData.append('file', blob, 'voice.ogg');
        formData.append('model', process.env.GROQ_API_KEY ? 'whisper-large-v3' : 'whisper-1');

        const whisperUrl = process.env.GROQ_API_KEY
          ? 'https://api.groq.com/openai/v1/audio/transcriptions'
          : 'https://api.openai.com/v1/audio/transcriptions';

        const transRes = await fetch(whisperUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });

        if (transRes.ok) {
          const transJson = await transRes.json();
          texto = (transJson.text || '').trim();
          await bot.sendMessage(chatId, `🎙️ _Te escuché:_ «${texto}»`);
        }
      } catch (voiceErr) {
        console.error('[Telegram Voice] Error al procesar audio:', voiceErr);
        return bot.sendMessage(chatId, '⚠️ No pude entender la nota de voz. Por favor escribe el mensaje en texto.');
      }
    }

    if (!texto) return;

    // -----------------------------------------------------------------------
    // COMANDO DE VINCULACIÓN: VINCULAR 123456 o /start vincular_123456
    // -----------------------------------------------------------------------
    const startVincularMatch = texto.match(/^\/start\s+vincular_?(\d+)/i);
    const vincularMatch = texto.match(/^VINCULAR\s+(\d+)/i);

    if (startVincularMatch || vincularMatch) {
      const codigo = (startVincularMatch ? startVincularMatch[1] : vincularMatch[1]).trim();

      const linkedUser = await linkTelegramUser(codigo, chatId, username);
      if (!linkedUser) {
        return bot.sendMessage(
          chatId,
          '❌ Ese código de vinculación no es válido o ya ha expirado. Ingresa a tu enlace de invitación para generar uno nuevo.'
        );
      }

      return bot.sendMessage(
        chatId,
        `🎉 *¡Felicitaciones, ${linkedUser.nombre}! Tu cuenta quedó vinculada exitosamente.*\n\n` +
        `• *Usuario Safite*: \`${linkedUser.safite_usuario}\`\n` +
        `• *Estado*: Activo\n\n` +
        `A partir de este momento, cada manifiesto que consultes o despaches desde este chat quedará registrado a tu nombre.\n\n` +
        `Escribe \`/ayuda\` o el número de un viaje para comenzar.`
      );
    }

    // -----------------------------------------------------------------------
    // VERIFICACIÓN DE USUARIO VINCULADO
    // -----------------------------------------------------------------------
    const user = await findUserByTelegramChatId(chatId);
    if (!user) {
      return bot.sendMessage(
        chatId,
        `👋 *¡Hola!* Tu cuenta de Telegram aún no está vinculada a un usuario de SAFITE.\n\n` +
        `Para comenzar:\n` +
        `1. Solicita a tu administrador un enlace de invitación.\n` +
        `2. Ingresa con tu usuario y contraseña de SAFITE.\n` +
        `3. Envía aquí el código entregado (Ej: \`VINCULAR 123456\`).`
      );
    }

    // Comandos de inicio o ayuda
    if (texto === '/start' || texto.toLowerCase().includes('ayuda') || texto === '/help') {
      const bienvenida =
        `👋 *Hola ${user.nombre} (@${user.safite_usuario})*\n\n` +
        `Soy tu Asistente de Despachos SAFITE & RNDC.\n\n` +
        `*Ejemplos de lo que puedes pedirme:*\n` +
        `• \`/resumen 17505\` o _"Cómo va el viaje 17505"_\n` +
        `• \`/despachar 17505\` o _"Despacha el manifiesto 17505"_\n` +
        `• También puedes enviarme una **nota de voz** diciendo el viaje a consultar.\n\n` +
        `_Recuerda: antes de transmitir al Ministerio, siempre te mostraré la tarjeta para que confirmes con un botón._`;

      return bot.sendMessage(chatId, bienvenida);
    }

    // Extracción de número de manifiesto o viaje
    const matchNumero = texto.match(/\b\d{3,7}\b/);
    const numManifiesto = matchNumero ? Number(matchNumero[0]) : null;

    if (!numManifiesto) {
      return bot.sendMessage(
        chatId,
        `Por favor indícame el número del manifiesto o viaje en Safite.\nEjemplo: \`/resumen 17505\``
      );
    }

    // Diagnóstico y Resumen
    await bot.sendChatAction(chatId, 'typing');

    try {
      const userClient = await getClientForUser(user);
      const orchestrator = new DispatchOrchestrator(userClient);
      const resumen = await orchestrator.obtenerResumenViaje(numManifiesto);

      const remesasPendientes = resumen.remesas.filter((r) => !r.autorizadaRndc).length;
      const estadoRndc = resumen.manifiestoAutorizadoRndc
        ? `✅ *Autorizado con radicado RNDC:* \`${resumen.radicadoManifiestoRndc}\``
        : `⏳ *Pendiente de firma en el Ministerio*`;

      const cuerpoMensaje =
        `📋 *RESUMEN DE VIAJE - SAFITE*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `• *Manifiesto*: #${resumen.numeroManifiesto}\n` +
        `• *Placa*: \`${resumen.placa || 'N/A'}\`\n` +
        `• *Conductor*: ${resumen.conductor || 'N/A'}\n` +
        `• *Ruta*: ${resumen.origen || 'N/A'} ➡️ ${resumen.destino || 'N/A'}\n` +
        `• *Remesas*: ${resumen.totalRemesas} (${remesasPendientes} pendientes de firma)\n` +
        `• *Estado RNDC*: ${estadoRndc}\n` +
        `• *Despachador*: ${user.nombre}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n`;

      if (resumen.manifiestoAutorizadoRndc) {
        return bot.sendMessage(
          chatId,
          `${cuerpoMensaje}\n_Este manifiesto ya está legalizado ante el RNDC. No requiere nuevo despacho._`
        );
      }

      const teclado = {
        inline_keyboard: [
          [
            {
              text: '🚀 Confirmar y Radicar en RNDC',
              callback_data: `confirm:${numManifiesto}`,
            },
            {
              text: '❌ Cancelar',
              callback_data: `cancel:${numManifiesto}`,
            },
          ],
        ],
      };

      return bot.sendMessage(
        chatId,
        `${cuerpoMensaje}\n¿Deseas firmar las remesas y radicar el manifiesto ante el Ministerio?`,
        { replyMarkup: teclado }
      );
    } catch (err) {
      console.error('[Telegram] Error al consultar viaje:', err);
      return bot.sendMessage(
        chatId,
        `⚠️ Error al consultar el viaje #${numManifiesto} en Safite: ${err.message}`
      );
    }
  }
}
