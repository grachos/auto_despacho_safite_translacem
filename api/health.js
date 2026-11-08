/**
 * Vercel Serverless Function: GET /api/health
 * Diagnóstico del estado del sistema: Conectividad con MySQL Hostinger, Safite y Variables de Entorno.
 */

import { query } from '../src/db/mysql.js';

export default async function handler(req, res) {
  const t0 = Date.now();
  const checks = {
    database: { ok: false, error: null, latencyMs: null },
    safite: { ok: false, error: null, latencyMs: null },
    config: { ok: true, missingVars: [] },
  };

  // 1. Verificar variables críticas de entorno
  const requiredEnvVars = [
    'MYSQL_HOST',
    'MYSQL_USER',
    'MYSQL_PASSWORD',
    'MYSQL_DATABASE',
    'ENCRYPTION_KEY',
    'ADMIN_KEY',
    'TELEGRAM_BOT_TOKEN',
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      checks.config.missingVars.push(envVar);
    }
  }
  checks.config.ok = checks.config.missingVars.length === 0;

  // 2. Probar conexión a MySQL (Hostinger)
  if (process.env.MYSQL_HOST && process.env.MYSQL_USER) {
    const dbStart = Date.now();
    try {
      await query('SELECT 1 + 1 AS healthcheck');
      checks.database.ok = true;
      checks.database.latencyMs = Date.now() - dbStart;
    } catch (err) {
      checks.database.error = err.message;
    }
  } else {
    checks.database.error = 'Variables de MySQL no configuradas';
  }

  // 3. Probar alcance de la API de Safite
  const safiteUrl = process.env.SAFITE_API_URL || 'https://api.app.safiteapp.com/index.php';
  const safiteStart = Date.now();
  try {
    const safiteRes = await fetch(safiteUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });
    // Si responde (incluso 404 o 200), hay conectividad de red con Safite
    checks.safite.ok = safiteRes.status < 500;
    checks.safite.latencyMs = Date.now() - safiteStart;
  } catch (err) {
    checks.safite.error = err.message;
  }

  const isHealthy = checks.config.ok && checks.database.ok && checks.safite.ok;
  const statusCode = isHealthy ? 200 : 207; // 207 Multi-Status si hay componentes degradados

  return res.status(statusCode).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    totalLatencyMs: Date.now() - t0,
    checks,
  });
}
