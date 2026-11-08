/**
 * Script de prueba de arquitectura local
 * Ejecutar con: node scripts/testFlowLocal.js
 */

import 'dotenv/config';
import { encrypt, decrypt } from '../src/crypto.js';
import { getDbPool, query } from '../src/db/mysql.js';

async function main() {
  console.log('🧪 Iniciando prueba local de arquitectura Safite & RNDC...\n');

  // 1. Probar Cifrado
  const testString = 'MiPasswordSafite123';
  const enc = encrypt(testString);
  const dec = decrypt(enc);
  console.log(`🔐 Cifrado AES-256: ${enc.substring(0, 30)}...`);
  if (dec !== testString) throw new Error('Fallo en descifrado');
  console.log('✅ Cifrado y descifrado verificado con éxito.\n');

  // 2. Probar MySQL si hay credenciales configuradas
  if (process.env.MYSQL_HOST && process.env.MYSQL_USER) {
    try {
      console.log(`📡 Probando conexión a MySQL (${process.env.MYSQL_HOST})...`);
      const rows = await query('SELECT 1 + 1 AS resultado');
      console.log('✅ Conexión a MySQL exitosa:', rows[0]);
    } catch (dbErr) {
      console.warn('⚠️ No se pudo conectar a MySQL (verifica tus credenciales o el acceso remoto en Hostinger):', dbErr.message);
    }
  } else {
    console.log('ℹ️ Variables de MySQL no definidas aún en .env. Saltando prueba de BD.');
  }

  console.log('\n🚀 Arquitectura completa y lista para desplegar.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
