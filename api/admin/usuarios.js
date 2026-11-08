/**
 * Vercel Serverless Function: POST & DELETE /api/admin/usuarios
 * Permite al administrador eliminar usuarios o desvincular sus cuentas de Telegram/WhatsApp.
 */

import { deleteUser, unlinkTelegramUser, generateLinkingCode, findUserById } from '../../src/store/userStore.js';
import { requireAdmin } from '../../src/auth/guards.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Método no permitido. Use POST o DELETE.' });
  }

  if (!requireAdmin(req, res)) return;

  const id = req.query.id || req.body?.id;
  const action = req.body?.action || (req.method === 'DELETE' ? 'delete' : 'delete');

  if (!id) {
    return res.status(400).json({ error: 'El parámetro "id" de usuario es obligatorio.' });
  }

  try {
    if (action === 'code') {
      const user = await findUserById(id);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
      const codigo = await generateLinkingCode(id, 'TELEGRAM');
      const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'Agent_TranslacemBot';
      return res.status(200).json({
        success: true,
        codigo,
        usuario: user.safite_usuario,
        nombre: user.nombre,
        telegramUrl: `https://t.me/${botUsername}?start=vincular_${codigo}`,
        mensaje: `Código de vinculación generado: VINCULAR ${codigo}`,
      });
    }

    if (action === 'unlink') {
      const ok = await unlinkTelegramUser(id);
      return res.status(200).json({
        success: ok,
        mensaje: 'Telegram desvinculado exitosamente del usuario.',
      });
    }

    const ok = await deleteUser(id);
    return res.status(200).json({
      success: ok,
      mensaje: 'Usuario y sus accesos eliminados exitosamente.',
    });
  } catch (error) {
    console.error('[Admin Usuarios Error]', error);
    return res.status(500).json({ error: error.message || 'Error al procesar acción sobre usuario.' });
  }
}

