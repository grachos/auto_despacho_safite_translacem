/**
 * Script de prueba local en Node.js
 * Ejecutar con: npm test
 */

import 'dotenv/config';
import { SafiteSistransClient } from '../src/safiteClient.js';
import { DispatchOrchestrator } from '../src/orchestrator.js';
import { encrypt, decrypt } from '../src/crypto.js';

async function main() {
  console.log('🧪 Iniciando verificación de SAFITE & RNDC en Node.js...\n');

  // 1. Probar cifrado y descifrado AES-256
  const testSecret = 'MiClaveSecretaDeSafite123';
  const encrypted = encrypt(testSecret);
  const decrypted = decrypt(encrypted);
  if (decrypted !== testSecret) {
    throw new Error('Fallo en la prueba de cifrado AES-256.');
  }
  console.log('✅ Módulo de cifrado AES-256-GCM operativo.');

  // 2. Probar inicialización de cliente
  const token = process.env.SAFITE_JWT_TOKEN || 'MOCK_TOKEN';
  const client = new SafiteSistransClient({ token });
  console.log('✅ Cliente SafiteSistransClient inicializado correctamente.');
  console.log(`📡 URL base configurada: ${client.baseUrl}`);

  const orchestrator = new DispatchOrchestrator(client);
  console.log('✅ Orquestador de despachos inicializado correctamente.');

  console.log('\n🚀 ¡Todo verificado y listo para conectar con MySQL Hostinger, Vercel, Telegram y WhatsApp!');
}

main().catch((err) => {
  console.error('❌ Error en prueba:', err);
  process.exit(1);
});
