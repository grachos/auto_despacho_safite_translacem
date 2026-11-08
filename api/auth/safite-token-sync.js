/**
 * Vercel Serverless Function: POST /api/auth/safite-token-sync
 * Endpoint utilizado por la Extensión de Chrome (o clientes autorizados) para
 * sincronizar y renovar automáticamente el token JWT activo de Safite en MySQL.
 */

import { validateSafiteToken } from '../../src/safite/auth.js';
import { query } from '../../src/db/mysql.js';
import { registerOrUpdateUser, generateLinkingCode, findUserById } from '../../src/store/userStore.js';

export default async function handler(req, res) {
  // Configurar CORS para permitir peticiones desde la extensión de Chrome o app.safiteapp.com
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  }

  const { token, autoRegister = true } = req.body || {};

  if (!token) {
    return res.status(400).json({ error: 'El parámetro "token" es obligatorio.' });
  }

  try {
    // 1. Validar el token directamente contra la API oficial de Safite
    const authResult = await validateSafiteToken(token);

    // 2. Buscar si el usuario ya existe en MySQL
    const existing = await query('SELECT * FROM usuarios WHERE safite_usuario = ? LIMIT 1', [authResult.usuario]);

    let userId;
    let linkingCode = null;
    let isLinked = false;
    let telegramUsername = null;

    if (existing.length > 0) {
      userId = existing[0].id;
      isLinked = !!existing[0].telegram_chat_id;
      telegramUsername = existing[0].telegram_username;

      // Actualizar token activo y fecha de expiración
      await query(
        `UPDATE usuarios 
         SET safite_token = ?, safite_token_expires_at = ?, safite_id_empresa = ?, safite_tenant_id = ?,
             status = CASE WHEN status = 'NEEDS_RELINK' THEN 'NEEDS_RELINK' ELSE 'ACTIVE' END
         WHERE id = ?`,
        [authResult.token, authResult.expiresAt, authResult.idEmpresa || 1282, authResult.tenantId, userId]
      );
      console.log(`[Token Sync] Token renovado exitosamente para usuario existente ${authResult.usuario} (ID ${userId}).`);
    } else if (autoRegister) {
      // Registrar nuevo usuario automáticamente con los datos de Safite
      userId = await registerOrUpdateUser({
        nombre: authResult.usuario,
        usuario: authResult.usuario,
        password: 'SESSION_EXTENSION',
        tenantId: authResult.tenantId,
        idEmpresa: authResult.idEmpresa || 1282,
        token: authResult.token,
        expiresAt: authResult.expiresAt,
      });
      console.log(`[Token Sync] Nuevo usuario registrado automáticamente vía extensión: ${authResult.usuario} (ID ${userId}).`);
    } else {
      return res.status(404).json({ error: `El usuario ${authResult.usuario} no está registrado en el Asistente.` });
    }

    // 3. Si no está vinculado a Telegram, generar un código de vinculación inmediato
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'Agent_TranslacemBot';
    let telegramUrl = null;

    if (!isLinked) {
      linkingCode = await generateLinkingCode(userId, 'TELEGRAM');
      telegramUrl = `https://t.me/${botUsername}?start=vincular_${linkingCode}`;
    }

    return res.status(200).json({
      success: true,
      mensaje: 'Token sincronizado exitosamente con el Asistente.',
      usuario: authResult.usuario,
      empresaId: authResult.idEmpresa || 1282,
      expiraEn: authResult.expiresAt,
      isLinked,
      telegramUsername,
      linkingCode,
      telegramUrl,
    });
  } catch (error) {
    console.error('[Token Sync Error]', error);
    return res.status(500).json({ error: error.message || 'Error al validar o sincronizar token.' });
  }
}

