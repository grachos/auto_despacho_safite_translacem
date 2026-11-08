/**
 * Conexión a Base de Datos MySQL (Hostinger) usando mysql2/promise
 * Optimizado para entornos Serverless en Vercel con Connection Pool
 */

import mysql from 'mysql2/promise';
import 'dotenv/config';

let pool = null;

export function getDbPool() {
  if (!pool) {
    const host = process.env.MYSQL_HOST || 'localhost';
    const user = process.env.MYSQL_USER || 'root';
    const password = process.env.MYSQL_PASSWORD || '';
    const database = process.env.MYSQL_DATABASE || 'safite_agent_db';
    const port = Number(process.env.MYSQL_PORT) || 3306;

    pool = mysql.createPool({
      host,
      user,
      password,
      database,
      port,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });

    console.log(`[MySQL] Pool inicializado hacia ${host}:${port}/${database}`);
  }

  return pool;
}

/**
 * Ejecuta una consulta SQL parametrizada
 */
export async function query(sql, params = []) {
  const p = getDbPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

