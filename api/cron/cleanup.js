/**
 * Vercel Cron Function: /api/cron/cleanup
 * Tarea periódica para limpiar códigos de vinculación expirados e invitaciones vencidas en MySQL.
 */

import { query } from '../../src/db/mysql.js';

export default async function handler(req, res) {
  // Validación de seguridad para Cron Jobs de Vercel
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    // 1. Vencer invitaciones expiradas
    const resInv = await query(
      'UPDATE invitaciones SET status = "EXPIRED" WHERE status = "PENDING" AND expires_at < NOW()'
    );

    // 2. Marcar códigos de vinculación expirados como usados
    const resCod = await query(
      'UPDATE codigos_vinculacion SET used = 1 WHERE used = 0 AND expires_at < NOW()'
    );

    console.log(`[Cron Cleanup] Invitaciones vencidas: ${resInv.affectedRows}, Códigos limpiados: ${resCod.affectedRows}`);

    return res.status(200).json({
      success: true,
      invitacionesExpiradas: resInv.affectedRows,
      codigosLimpiados: resCod.affectedRows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron Cleanup Error]', error);
    return res.status(500).json({ error: error.message });
  }
}
