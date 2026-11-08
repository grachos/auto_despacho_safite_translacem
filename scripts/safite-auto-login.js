/**
 * Script de Renovación Automática Multi-Usuario con Playwright
 * 
 * Recorre todos los usuarios de la tabla `usuarios` en MySQL:
 * - Descifra la contraseña de cada usuario en memoria (AES-256-GCM).
 * - Utiliza la URL directa con nit y keyCompany para activar obtenerEmpresas automáticamente.
 * - Inicia sesión en SAFITE, captura el JWT (24 horas de vigencia) de localStorage.
 * - Actualiza la fecha de expiración y el token en MySQL para cada usuario individualmente.
 */

import { chromium } from 'playwright';
import 'dotenv/config';
import { query } from '../src/db/mysql.js';
import { decrypt } from '../src/crypto.js';

const SAFITE_NIT = process.env.SAFITE_NIT || '901599040-4';
const DEFAULT_ID_EMPRESA = process.env.SAFITE_ID_EMPRESA || '1282';

const SAFITE_LOGIN_URL = process.env.SAFITE_LOGIN_URL || 
  `https://app.safiteapp.com/login.html?nit=${SAFITE_NIT}&keyCompany=LVY7SMEezWqi7lO739SQcu6SoQtu819JU64ddFhBjY`;

/**
 * Autentica un usuario en Safite y extrae su token JWT
 */
async function authenticateUserInSafite(browser, user) {
  const { id, nombre, safite_usuario, plainPassword, idEmpresa = DEFAULT_ID_EMPRESA } = user;

  console.log(`\n▶ [Playwright] Renovando sesión para: "${nombre}" (Usuario: ${safite_usuario}, ID: ${id})...`);

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  try {
    console.log(`  └─ [1/4] Navegando a portal Safite (resolviendo empresa automáticamente)...`);
    
    // Esperar respuesta de obtenerEmpresas disparada automáticamente por la URL con nit y keyCompany
    await Promise.all([
      page.waitForResponse(r => r.url().includes('obtenerEmpresas'), { timeout: 35000 }),
      page.goto(SAFITE_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 35000 })
    ]);

    await page.waitForSelector('#nameUserL', { state: 'visible', timeout: 20000 });

    console.log(`  └─ [2/4] Llenando credenciales de acceso...`);
    await page.click('#nameUserL');
    await page.type('#nameUserL', safite_usuario, { delay: 30 });

    await page.click('#passUserL');
    await page.type('#passUserL', plainPassword, { delay: 30 });

    const select = await page.$('#empresaTipoS');
    if (select && await select.isVisible()) {
      console.log(`  └─ [3/4] Seleccionando empresa (${idEmpresa})...`);
      try {
        await page.selectOption('#empresaTipoS', String(idEmpresa));
      } catch {
        const options = await page.$$eval('#empresaTipoS option', opts => opts.map(o => o.value).filter(v => v !== '0'));
        if (options.length > 0) {
          await page.selectOption('#empresaTipoS', options[0]);
        }
      }
    }

    console.log(`  └─ [4/4] Enviando formulario de autenticación...`);
    const [authRes] = await Promise.all([
      page.waitForResponse(r => r.url().includes('authenticate'), { timeout: 25000 }),
      page.click('#formUsuarioEmpresa button[type="submit"]')
    ]);

    if (authRes.status() !== 200) {
      throw new Error(`Safite respondió con status ${authRes.status()}`);
    }

    await page.waitForTimeout(1500);
    const token = await page.evaluate(() => localStorage.getItem('token'));

    if (!token) {
      throw new Error('No se encontró el token JWT en localStorage tras el login.');
    }

    // Decodificar expiración del JWT
    let expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (decoded.exp) {
          expiresAt = new Date(decoded.exp * 1000);
        }
      }
    } catch {}

    // Actualizar en MySQL
    await query(
      `UPDATE usuarios 
       SET safite_token = ?, safite_token_expires_at = ?,
           status = CASE WHEN status = 'NEEDS_RELINK' THEN 'NEEDS_RELINK' ELSE 'ACTIVE' END
       WHERE id = ?`,
      [token, expiresAt, id]
    );

    console.log(`  ✔ ¡SESIÓN RENOVADA EXITOSAMENTE! Token válido hasta: ${expiresAt.toLocaleString('es-CO')}`);

    await context.close();
    return { success: true, usuario: safite_usuario, nombre, expiresAt };
  } catch (error) {
    console.error(`  ✖ Fallo al renovar usuario ${safite_usuario}:`, error.message);
    try {
      await page.screenshot({ path: `error-login-${safite_usuario}.png`, fullPage: true });
    } catch {}
    await context.close();
    return { success: false, usuario: safite_usuario, error: error.message };
  }
}

/**
 * Lanza el navegador usando Chrome si existe o Chromium con flags de sigilo
 */
async function launchStealthBrowser() {
  const launchOptions = {
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ]
  };

  try {
    return await chromium.launch({ ...launchOptions, channel: 'chrome' });
  } catch {
    return await chromium.launch(launchOptions);
  }
}

/**
 * Función principal: Renueva todos los usuarios registrados
 */
async function main() {
  console.log('='.repeat(70));
  console.log(' [Playwright Multi-Usuario] Ciclo de Renovación de Sesiones SAFITE');
  console.log(` Fecha de ejecución: ${new Date().toLocaleString('es-CO')}`);
  console.log('='.repeat(70));

  let usersToRenew = [];
  try {
    const rows = await query(`
      SELECT id, nombre, safite_usuario, safite_password_encrypted, safite_id_empresa
      FROM usuarios
      WHERE status != 'INACTIVE'
    `);

    for (const r of rows) {
      if (!r.safite_password_encrypted || r.safite_password_encrypted === 'TOKEN_AUTH' || r.safite_password_encrypted === 'SESSION_EXTENSION') {
        continue;
      }

      try {
        const plainPassword = decrypt(r.safite_password_encrypted);
        usersToRenew.push({
          id: r.id,
          nombre: r.nombre,
          safite_usuario: r.safite_usuario,
          plainPassword,
          idEmpresa: r.safite_id_empresa || DEFAULT_ID_EMPRESA,
        });
      } catch (decErr) {
        console.warn(`⚠️ Error descifrando clave de ${r.safite_usuario}:`, decErr.message);
      }
    }
  } catch (dbErr) {
    console.error('❌ Error leyendo usuarios de la base de datos:', dbErr.message);
  }

  if (usersToRenew.length === 0) {
    const envUser = process.env.SAFITE_USER || 'PRUEBASAFITE';
    const envPass = process.env.SAFITE_PASSWORD || 'SAFITE123/*';
    usersToRenew.push({
      id: 1,
      nombre: 'Usuario Principal',
      safite_usuario: envUser,
      plainPassword: envPass,
      idEmpresa: DEFAULT_ID_EMPRESA,
    });
  }

  console.log(`📋 Despachadores a renovar en esta ronda: ${usersToRenew.length}`);

  const browser = await launchStealthBrowser();
  const summary = [];

  for (const user of usersToRenew) {
    const res = await authenticateUserInSafite(browser, user);
    summary.push(res);
  }

  await browser.close();

  console.log('\n' + '='.repeat(70));
  console.log(' RESUMEN FINAL DE RENOVACIÓN MULTI-USUARIO:');
  for (const item of summary) {
    console.log(` - ${item.usuario}: ${item.success ? '✅ ACTIVO (Expira ' + item.expiresAt?.toLocaleTimeString('es-CO') + ')' : '❌ ERROR: ' + item.error}`);
  }
  console.log('='.repeat(70));

  const allFailed = summary.length > 0 && summary.every(s => !s.success);
  process.exit(allFailed ? 1 : 0);
}

main().catch(err => {
  console.error('Error fatal en el runner:', err);
  process.exit(1);
});
