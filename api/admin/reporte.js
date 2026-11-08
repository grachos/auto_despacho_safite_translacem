/**
 * Vercel Serverless Function: GET /api/admin/reporte
 * Retorna métricas, listado de usuarios y el historial de auditoría de despachos ante el RNDC.
 */

import { query } from '../../src/db/mysql.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  // Validación de seguridad de Administrador
  const adminKey = req.headers['x-admin-key'] || req.query.adminKey || req.body?.adminKey;
  const expectedKey = process.env.ADMIN_KEY;

  if (expectedKey && adminKey !== expectedKey) {
    return res.status(401).json({ error: 'No autorizado. Se requiere x-admin-key válida.' });
  }

  try {
    // 1. Usuarios registrados
    const usuarios = await query(
      `SELECT id, nombre, email, safite_usuario, telegram_chat_id, telegram_username, 
              whatsapp_phone, status, created_at, updated_at
       FROM usuarios 
       ORDER BY id DESC`
    );

    // 2. Historial de despachos con atribución
    const despachos = await query(
      `SELECT d.id, d.canal, d.numero_manifiesto, d.radicado_rndc, d.estado, d.detalle, d.created_at,
              u.nombre AS despachador, u.safite_usuario
       FROM despachos_log d
       JOIN usuarios u ON d.usuario_id = u.id
       ORDER BY d.created_at DESC
       LIMIT 100`
    );

    // 3. Invitaciones activas o pendientes
    const invitaciones = await query(
      `SELECT id, token, nombre_destinatario, creado_por, status, expires_at, used_at, created_at
       FROM invitaciones
       ORDER BY created_at DESC
       LIMIT 50`
    );

    // 4. Métricas consolidadas
    const totalDespachos = despachos.length;
    const despachosExitosos = despachos.filter((d) => d.estado === 'SUCCESS').length;
    const usuariosActivos = usuarios.filter((u) => u.telegram_chat_id || u.whatsapp_phone).length;

    return res.status(200).json({
      success: true,
      metricas: {
        totalDespachos,
        despachosExitosos,
        usuariosActivos,
        totalUsuarios: usuarios.length,
      },
      usuarios,
      despachos,
      invitaciones,
    });
  } catch (error) {
    console.error('[Admin Reporte Error]', error);
    return res.status(500).json({ error: error.message || 'Error al generar reporte de administración' });
  }
}

