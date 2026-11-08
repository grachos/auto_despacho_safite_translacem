/**
 * Route guards. All of them FAIL CLOSED: if the secret env var is missing,
 * the request is rejected (503) instead of being let through.
 */

import crypto from 'node:crypto';

function clean(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function check(res, expectedRaw, providedRaw, envName) {
  const expected = clean(expectedRaw);
  if (!expected) {
    res.status(503).json({ error: `Servidor sin configurar: falta ${envName}.` });
    return false;
  }
  if (!safeEqual(expected, clean(providedRaw))) {
    res.status(401).json({ error: 'No autorizado.' });
    return false;
  }
  return true;
}

/** Admin key is accepted ONLY via the x-admin-key header (never query string). */
export function requireAdmin(req, res) {
  return check(res, process.env.ADMIN_KEY, req.headers['x-admin-key'], 'ADMIN_KEY');
}

/** Cron secret via "Authorization: Bearer <CRON_SECRET>". */
export function requireCron(req, res) {
  const header = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return check(res, process.env.CRON_SECRET, header, 'CRON_SECRET');
}
