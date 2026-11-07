/**
 * Gestión de Usuarios, Invitaciones, Vinculaciones y Sesiones en MySQL (Hostinger)
 */

import crypto from 'node:crypto';
import { query } from '../db/mysql.js';
import { encrypt, decrypt } from '../crypto.js';
import { authenticateWithSafite, refreshSafiteToken } from '../safite/auth.js';
import { SafiteSistransClient } from '../safiteClient.js';

// =========================================================================
// USUARIOS Y SESIÓN SAFITE
// =========================================================================

export async function findUserByTelegramChatId(chatId) {
  const rows = await query('SELECT * FROM usuarios WHERE telegram_chat_id = ? LIMIT 1', [chatId]);
  return rows[0] || null;
}

export async function findUserByWhatsAppPhone(phone) {
  const rows = await query('SELECT * FROM usuarios WHERE whatsapp_phone = ? LIMIT 1', [phone]);
  return rows[0] || null;
}

export async function findUserById(id) {
  const rows = await query('SELECT * FROM usuarios WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

export async function registerOrUpdateUser({ nombre, usuario, password, tenantId, idEmpresa, token, expiresAt }) {
  const encryptedPassword = encrypt(password);
  
  const existing = await query('SELECT id FROM usuarios WHERE safite_usuario = ? LIMIT 1', [usuario]);

  if (existing.length > 0) {
    const userId = existing[0].id;
    await query(
      `UPDATE usuarios 
       SET nombre = ?, safite_password_encrypted = ?, safite_tenant_id = ?, safite_id_empresa = ?,
           safite_token = ?, safite_token_expires_at = ?, status = 'ACTIVE'
       WHERE id = ?`,
      [nombre, encryptedPassword, tenantId, idEmpresa, token, expiresAt, userId]
    );
    return userId;
  } else {
    const res = await query(
      `INSERT INTO usuarios (nombre, safite_usuario, safite_password_encrypted, safite_tenant_id, safite_id_empresa, safite_token, safite_token_expires_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [nombre, usuario, encryptedPassword, tenantId, idEmpresa, token, expiresAt]
    );
    return res.insertId;
  }
}

/**
 * Obtiene un cliente SafiteSistransClient autenticado para un usuario específico.
 * Si el token está por vencer, lo renueva o se re-autentica automáticamente con las credenciales cifradas.
 */
export async function getClientForUser(user) {
  let activeToken = user.safite_token;
  const expiresAt = user.safite_token_expires_at ? new Date(user.safite_token_expires_at).getTime() : 0;
  const now = Date.now();

  // Si vence en menos de 5 minutos o ya venció, renovar
  if (!activeToken || expiresAt - now < 5 * 60 * 1000) {
    try {
      console.log(`[Auth] Refrescando token para usuario ${user.safite_usuario}...`);
      if (activeToken) {
        const refreshed = await refreshSafiteToken(activeToken);
        activeToken = refreshed.token;
        await query('UPDATE usuarios SET safite_token = ?, safite_token_expires_at = ? WHERE id = ?', [
          refreshed.token,
          refreshed.expiresAt,
          user.id,
        ]);
      } else {
        throw new Error('Token nulo, requiere login completo.');
      }
    } catch {
      console.log(`[Auth] Re-autenticando usuario ${user.safite_usuario} con credenciales cifradas...`);
      const plainPassword = decrypt(user.safite_password_encrypted);
      const authResult = await authenticateWithSafite(user.safite_usuario, plainPassword);
      activeToken = authResult.token;
      await query('UPDATE usuarios SET safite_token = ?, safite_token_expires_at = ? WHERE id = ?', [
        authResult.token,
        authResult.expiresAt,
        user.id,
      ]);
    }
  }

  return new SafiteSistransClient({ token: activeToken });
}

// =========================================================================
// INVITACIONES DE ACCESO
// =========================================================================

export async function createInvitation(nombreDestinatario, creadoPor = 'ADMIN') {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 48 * 3600 * 1000); // 48 horas

  await query(
    'INSERT INTO invitaciones (token, nombre_destinatario, creado_por, expires_at) VALUES (?, ?, ?, ?)',
    [token, nombreDestinatario, creadoPor, expiresAt]
  );

  return { token, expiresAt };
}

export async function validateInvitation(token) {
  const rows = await query('SELECT * FROM invitaciones WHERE token = ? AND status = "PENDING" LIMIT 1', [token]);
  if (rows.length === 0) return null;

  const inv = rows[0];
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    await query('UPDATE invitaciones SET status = "EXPIRED" WHERE id = ?', [inv.id]);
    return null;
  }
  return inv;
}

export async function markInvitationUsed(token) {
  await query('UPDATE invitaciones SET status = "USED", used_at = NOW() WHERE token = ?', [token]);
}

// =========================================================================
// CÓDIGOS DE VINCULACIÓN (TELEGRAM / WHATSAPP)
// =========================================================================

export async function generateLinkingCode(userId, canal = 'TELEGRAM') {
  // Generar código numérico de 6 dígitos
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

  // Inactivar códigos previos
  await query('UPDATE codigos_vinculacion SET used = 1 WHERE usuario_id = ? AND canal = ?', [userId, canal]);

  await query(
    'INSERT INTO codigos_vinculacion (usuario_id, codigo, canal, expires_at) VALUES (?, ?, ?, ?)',
    [userId, code, canal, expiresAt]
  );

  return code;
}

export async function linkTelegramUser(code, chatId, username = null) {
  const rows = await query(
    'SELECT * FROM codigos_vinculacion WHERE codigo = ? AND canal = "TELEGRAM" AND used = 0 LIMIT 1',
    [code.trim()]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return null; // Vencido
  }

  // Marcar como usado y vincular al usuario
  await query('UPDATE codigos_vinculacion SET used = 1 WHERE id = ?', [row.id]);
  await query(
    'UPDATE usuarios SET telegram_chat_id = ?, telegram_username = ? WHERE id = ?',
    [chatId, username, row.usuario_id]
  );

  return await findUserById(row.usuario_id);
}

export async function linkWhatsAppUser(code, phone) {
  const rows = await query(
    'SELECT * FROM codigos_vinculacion WHERE codigo = ? AND canal = "WHATSAPP" AND used = 0 LIMIT 1',
    [code.trim()]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return null;
  }

  await query('UPDATE codigos_vinculacion SET used = 1 WHERE id = ?', [row.id]);
  await query('UPDATE usuarios SET whatsapp_phone = ? WHERE id = ?', [phone, row.usuario_id]);

  return await findUserById(row.usuario_id);
}

// =========================================================================
// REGISTRO DE AUDITORÍA DE DESPACHOS
// =========================================================================

export async function logDispatch({ userId, canal, numeroManifiesto, radicadoRndc, estado, detalle }) {
  await query(
    `INSERT INTO despachos_log (usuario_id, canal, numero_manifiesto, radicado_rndc, estado, detalle)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, canal, numeroManifiesto, radicadoRndc, estado, JSON.stringify(detalle || {})]
  );
}
