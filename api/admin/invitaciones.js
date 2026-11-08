/**
 * Vercel Serverless Function: POST /api/admin/invitaciones
 * Permite al administrador crear invitaciones de un solo uso para usuarios de Safite.
 */

import { createInvitation } from '../../src/store/userStore.js';
import { requireAdmin } from '../../src/auth/guards.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  }

  if (!requireAdmin(req, res)) return;

  const { nombreDestinatario, creadoPor = 'ADMIN' } = req.body || {};

  if (!nombreDestinatario) {
    return res.status(400).json({ error: 'El campo "nombreDestinatario" es obligatorio.' });
  }

  try {
    const { token, expiresAt } = await createInvitation(nombreDestinatario, creadoPor);
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = process.env.VERCEL_PROJECT_URL || (host ? `${proto}://${host}` : 'https://tu-proyecto.vercel.app');
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

