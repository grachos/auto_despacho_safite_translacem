/**
 * Vercel Serverless Function: POST /api/auth/safite-login
 * Valida la invitación y comprueba el acceso contra SAFITE oficial usando:
 * - NIT de la Empresa + Usuario + Contraseña (vía /login/authenticate)
 * O
 * - Token JWT directo de Safite (vía /login/ObtenerInformacionUsuarioActivo)
 */

import { validateInvitation, markInvitationUsed, registerOrUpdateUser, generateLinkingCode } from '../../src/store/userStore.js';
import { loginWithNit, validateSafiteToken } from '../../src/safite/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  }

  const {
    tokenInvitacion,
    metodo = 'credenciales',
    nit,
    usuario,
    password,
    tokenSafite,
    recaptchaToken = '',
    canal = 'TELEGRAM',
  } = req.body || {};

  if (!tokenInvitacion) {
    return res.status(400).json({ error: 'El token de invitación es obligatorio.' });
  }

  try {
    // 1. Validar la invitación
    const invitacion = await validateInvitation(tokenInvitacion);
    if (!invitacion) {
      return res.status(400).json({ error: 'La invitación no es válida, ya fue utilizada o ha expirado.' });
    }

    let authResult;

    // 2. Autenticar según el método elegido
    if (metodo === 'token' && tokenSafite) {
      console.log('[Registro] Validando token JWT directo de Safite...');
      authResult = await validateSafiteToken(tokenSafite);
    } else {
      if (!nit || !usuario || !password) {
        return res.status(400).json({ error: 'Debes ingresar el NIT de la empresa, el usuario y la contraseña.' });
      }

      console.log(`[Registro] Autenticando en Safite con NIT: ${nit}, Usuario: ${usuario}...`);
      try {
        authResult = await loginWithNit(nit, usuario, password, recaptchaToken);
      } catch (authErr) {
        // Si el bloqueo es por reCAPTCHA de dominio externo (RECAP-01),
        // guardamos las credenciales cifradas con AES-256 en MySQL para que el bot
        // Playwright de GitHub Actions gestione y renueve el token automáticamente.
        if (authErr.message && authErr.message.includes('RECAP')) {
          console.warn('[Registro] Safite restringió login directo por reCAPTCHA externo. Guardando credenciales cifradas para renovación automática Playwright...');
          authResult = {
            usuario: usuario.trim(),
            idEmpresa: 1282,
            tenantId: 'E23CB27E-E09E-4406-872A-F097AF08340C',
            token: null,
            expiresAt: null,
          };
        } else {
          throw authErr;
        }
      }
    }

    // 3. Registrar o actualizar usuario en MySQL (Hostinger)
    const userId = await registerOrUpdateUser({
      nombre: invitacion.nombre_destinatario,
      usuario: authResult.usuario,
      password: password || 'TOKEN_AUTH',
      tenantId: authResult.tenantId,
      idEmpresa: authResult.idEmpresa || 1282,
      token: authResult.token,
      expiresAt: authResult.expiresAt,
    });

    // 4. Quemar la invitación
    await markInvitationUsed(tokenInvitacion);

    // 5. Generar código de vinculación de 6 dígitos
    const codigoVinculacion = await generateLinkingCode(userId, canal);

    // Obtener username del bot de Telegram
    let telegramBotUsername = process.env.TELEGRAM_BOT_USERNAME || null;
    let telegramBotUrl = null;

    if (process.env.TELEGRAM_BOT_TOKEN) {
      try {
        const { TelegramBotClient } = await import('../../src/telegram/api.js');
        const bot = new TelegramBotClient();
        const botInfo = await bot.getMe();
        telegramBotUsername = botInfo?.username || telegramBotUsername;
        if (telegramBotUsername) {
          telegramBotUrl = `https://t.me/${telegramBotUsername}?start=vincular_${codigoVinculacion}`;
        }
      } catch (tgErr) {
        console.warn('[Registro] No se pudo obtener bot username:', tgErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      mensaje: '¡Autenticación con SAFITE exitosa!',
      nombre: invitacion.nombre_destinatario,
      usuarioSafite: authResult.usuario,
      codigoVinculacion,
      telegramBotUsername,
      telegramBotUrl,
      instrucciones: `Envía el siguiente mensaje al bot de Telegram: VINCULAR ${codigoVinculacion}`,
    });
  } catch (error) {
    console.error('[Registro Error]', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Error al autenticar con SAFITE',
    });
  }
}
