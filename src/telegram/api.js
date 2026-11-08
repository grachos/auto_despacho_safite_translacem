/**
 * Cliente ligero de Telegram Bot API para Vercel Serverless (Node.js 18+)
 * Sin dependencias externas; utiliza fetch nativo para arranques instantáneos (0ms cold start).
 */

export class TelegramBotClient {
  constructor(token = null) {
    this.token = token || process.env.TELEGRAM_BOT_TOKEN;
    if (!this.token) {
      throw new Error('TELEGRAM_BOT_TOKEN no configurado en variables de entorno.');
    }
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
  }

  async _request(method, payload = {}) {
    const url = `${this.baseUrl}/${method}`;
    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let data = await res.json();

    // Manejo inteligente de Rate Limiting (HTTP 429) de Telegram
    if (!data.ok && data.error_code === 429) {
      const waitSeconds = data.parameters?.retry_after || 1;
      const waitMs = (waitSeconds * 1000) + 300;
      console.warn(`[Telegram] Rate limit (429) en ${method}. Esperando ${waitSeconds}s antes de reintentar...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      data = await res.json();
    }

    if (!data.ok) {
      console.error(`[Telegram] Error en ${method}:`, data);
      throw new Error(`Error de Telegram (${data.error_code}): ${data.description}`);
    }
    return data.result;
  }

  /**
   * Envía un mensaje de texto con soporte de Markdown y botones interactivos (Inline Keyboards)
   */
  async sendMessage(chatId, text, { parseMode = 'Markdown', replyMarkup = null } = {}) {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    return this._request('sendMessage', payload);
  }

  /**
   * Actualiza el contenido de un mensaje existente (útil para actualizar el estado del botón a "Enviando..." y luego a "Aprobado")
   */
  async editMessageText(chatId, messageId, text, { parseMode = 'Markdown', replyMarkup = null } = {}) {
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: parseMode,
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    return this._request('editMessageText', payload);
  }

  /**
   * Responde al clic del botón en Telegram para quitar el estado de carga
   */
  async answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
    return this._request('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  /**
   * Muestra el estado "escribiendo..." en el chat mientras se procesa la solicitud
   */
  async sendChatAction(chatId, action = 'typing') {
    try {
      return await this._request('sendChatAction', {
        chat_id: chatId,
        action,
      });
    } catch {
      // Ignorar fallo no crítico en typing
    }
  }

  /**
   * Obtiene la información de un archivo de Telegram (ej. nota de voz)
   */
  async getFile(fileId) {
    return this._request('getFile', { file_id: fileId });
  }

  /**
   * Obtiene la URL de descarga directa de un archivo de Telegram
   */
  getFileDownloadUrl(filePath) {
    return `https://api.telegram.org/file/bot${this.token}/${filePath}`;
  }

  /**
   * Obtiene la información del bot actual (ej. username @MiBot)
   */
  async getMe() {
    return this._request('getMe');
  }

  /**
   * Obtiene el estado actual del webhook configurado en Telegram
   */
  async getWebhookInfo() {
    return this._request('getWebhookInfo');
  }

  /**
   * Configura el webhook de Telegram para apuntar a la URL de Vercel
   */
  async setWebhook(webhookUrl, secretToken = null) {
    const payload = { url: webhookUrl };
    if (secretToken) payload.secret_token = secretToken;
    return this._request('setWebhook', payload);
  }
}

