/**
 * Vercel Serverless Function: POST /api/admin/invitaciones
 * Permite al administrador crear invitaciones de un solo uso para usuarios de Safite.
 */

import { createInvitation } from '../../src/store/userStore.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  }

  // Validación de seguridad de Administrador
  const adminKey = req.headers['x-admin-key'] || req.query.adminKey || req.body?.adminKey;
  const expectedKey = (process.env.ADMIN_KEY || '').trim().replace(/^["']|["']$/g, '');
  const providedKey = (adminKey || '').trim().replace(/^["']|["']$/g, '');

  if (expectedKey && providedKey !== expectedKey) {
    return res.status(401).json({ error: 'No autorizado. Se requiere x-admin-key válida.' });
  }

  const { nombreDestinatario, creadoPor = 'ADMIN' } = req.body || {};

  if (!nombreDestinatario) {
    return res.status(400).json({ error: 'El campo "nombreDestinatario" es obligatorio.' });
  }

  try {
    const { token, expiresAt } = await createInvitation(nombreDestinatario, creadoPor);
    const baseUrl = process.env.VERCEL_PROJECT_URL || 'https://tu-proyecto.vercel.app';
    const linkInvitacion = `${baseUrl.replace(/\/$/, '')}/invitacion.html?token=${token}`;

    return res.status(200).json({
      success: true,
      nombreDestinatario,
      token,
      expiresAt,
      linkInvitacion,
    });
  } catch (error) {
    console.error('[Admin Invitaciones Error]', error);
    return res.status(500).json({ error: error.message || 'Error al generar invitación' });
  }
}

