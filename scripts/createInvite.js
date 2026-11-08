/**
 * Script CLI para generar rápidamente un enlace de invitación desde la terminal
 * 
 * Uso:
 * node scripts/createInvite.js "Nombre del Despachador"
 */

import 'dotenv/config';
import { createInvitation } from '../src/store/userStore.js';

const nombre = process.argv[2];

if (!nombre) {
  console.log('ℹ️ Debes proporcionar el nombre del despachador.');
  console.log('Ejemplo: node scripts/createInvite.js "Carlos Gomez"');
  process.exit(1);
}

async function main() {
  console.log(`✉️ Generando invitación para: "${nombre}" en MySQL Hostinger...`);

  try {
    const { token, expiresAt } = await createInvitation(nombre, 'CLI_ADMIN');
    const baseUrl = process.env.VERCEL_PROJECT_URL || 'https://auto-despacho-safite-translacem.vercel.app';
    const link = `${baseUrl.replace(/\/$/, '')}/invitacion.html?token=${token}`;

    console.log('\n🎉 ¡Invitación generada con éxito!');
    console.log(`• Destinatario: ${nombre}`);
    console.log(`• Vence en: ${expiresAt.toLocaleString()}`);
    console.log(`• Token: ${token}`);
    console.log(`\n👉 Enlace para el usuario:\n${link}\n`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error al generar invitación:', err.message);
    process.exit(1);
  }
}

main();
