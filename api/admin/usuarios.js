/**
 * Vercel Serverless Function: POST & DELETE /api/admin/usuarios
 * Permite al administrador eliminar usuarios o desvincular sus cuentas de Telegram/WhatsApp.
 */

import { deleteUser, unlinkTelegramUser } from '../../src/store/userStore.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Método no permitido. Use POST o DELETE.' });
  }

  // Validación de seguridad de Administrador
  const adminKey = req.headers['x-admin-key'] || req.query.adminKey || req.body?.adminKey;
  const expectedKey = (process.env.ADMIN_KEY || '').trim().replace(/^["']|["']$/g, '');
  const providedKey = (adminKey || '').trim().replace(/^["']|["']$/g, '');

  if (expectedKey && providedKey !== expectedKey) {
    return res.status(401).json({ error: 'No autorizado. Se requiere x-admin-key válida.' });
  }

  const id = req.query.id || req.body?.id;
  const action = req.body?.action || (req.method === 'DELETE' ? 'delete' : 'delete');

  if (!id) {
    return res.status(400).json({ error: 'El parámetro "id" de usuario es obligatorio.' });
  }

  try {
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
