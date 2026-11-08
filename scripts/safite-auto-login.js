/**
 * Script de Automatización Headless con Playwright
 * Inicia sesión en SAFITE simulando un navegador real, resuelve de forma nativa
 * Google reCAPTCHA v3 en su propio dominio, extrae el token JWT (24h de validez)
 * y lo sincroniza con la base de datos MySQL a través de /api/auth/safite-token-sync.
 */

import { chromium } from 'playwright';
import 'dotenv/config';

const SAFITE_LOGIN_URL = process.env.SAFITE_LOGIN_URL || 
  'https://app.safiteapp.com/login.html?keyCompany=LVY7SMEezWqi7lO739SQcu6SoQtu819JU64ddFhBjY';

const SAFITE_NIT = process.env.SAFITE_NIT || '901599040-4';
const SAFITE_USER = process.env.SAFITE_USER || 'PRUEBASAFITE';
const SAFITE_PASSWORD = process.env.SAFITE_PASSWORD || 'SAFITE123/*';
const SAFITE_ID_EMPRESA = process.env.SAFITE_ID_EMPRESA || '1282';

const SYNC_API_URL = process.env.SYNC_API_URL || 
  'https://agentedespachotranslacem.vercel.app/api/auth/safite-token-sync';

async function renewSafiteToken() {
  console.log('='.repeat(60));
  console.log(`[Playwright] Iniciando renovación de sesión SAFITE para: ${SAFITE_USER}`);
  console.log(`[Playwright] URL: ${SAFITE_LOGIN_URL}`);
  console.log('='.repeat(60));

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  try {
    console.log('[Playwright] Navegando a la página de login de Safite...');
    await page.goto(SAFITE_LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // 1. Verificar si está en la pantalla inicial de NIT o directamente en Credenciales
    const nitInput = await page.$('#nit');
    const isNitVisible = nitInput && await nitInput.isVisible();

    if (isNitVisible) {
      console.log(`[Playwright] Pantalla de NIT detectada. Ingresando NIT: ${SAFITE_NIT}`);
      await page.fill('#nit', SAFITE_NIT);
      await page.click('#btn-submit-Nit');
      // Esperar a que pase al formulario de credenciales
      await page.waitForSelector('#nameUserL', { state: 'visible', timeout: 15000 });
    } else {
      console.log('[Playwright] Pantalla de credenciales detectada directamente (vía keyCompany).');
      await page.waitForSelector('#nameUserL', { state: 'visible', timeout: 15000 });
    }

    // 2. Ingresar Usuario y Contraseña
    console.log(`[Playwright] Ingresando usuario: ${SAFITE_USER}`);
    await page.fill('#nameUserL', SAFITE_USER);

    console.log('[Playwright] Ingresando contraseña...');
    await page.fill('#passUserL', SAFITE_PASSWORD);

    // 3. Seleccionar Empresa si está presente el select o combobox
    const selectEmpresa = await page.$('#empresaTipoS');
    if (selectEmpresa && await selectEmpresa.isVisible()) {
      console.log(`[Playwright] Seleccionando empresa ID: ${SAFITE_ID_EMPRESA}`);
      try {
        await page.selectOption('#empresaTipoS', SAFITE_ID_EMPRESA);
      } catch (err) {
        console.warn('[Playwright] No se pudo seleccionar empresa por ID exacto, intentando primer valor...', err.message);
        const options = await page.$$eval('#empresaTipoS option', opts => opts.map(o => o.value).filter(v => v !== '0'));
        if (options.length > 0) {
          await page.selectOption('#empresaTipoS', options[0]);
        }
      }
    }

    const comboEmpresa = await page.$('#empresaBuscar');
    if (comboEmpresa && await comboEmpresa.isVisible()) {
      console.log('[Playwright] Campo combobox de empresa detectado, buscando TRASLACEM...');
      await page.fill('#empresaBuscar', 'TRASLACEM');
      await page.waitForTimeout(500);
      const primeraOpcion = await page.$('#empresaLista li');
      if (primeraOpcion) {
        await primeraOpcion.click();
      }
    }

    // 4. Enviar formulario de login (esto dispara el reCAPTCHA v3 nativo)
    console.log('[Playwright] Enviando formulario de login (activando reCAPTCHA v3)...');
    
    // Escuchar respuesta ajax de autenticación
    const [authResponse] = await Promise.all([
      page.waitForResponse(response => 
        response.url().includes('/login/authenticate') && response.request().method() === 'POST',
        { timeout: 20000 }
      ),
      page.click('#formUsuarioEmpresa button[type="submit"]')
    ]);

    const authJson = await authResponse.json().catch(() => ({}));
    console.log('[Playwright] Respuesta de /login/authenticate recibida:', {
      status: authResponse.status(),
      hasToken: !!authJson.token,
      message: authJson.message || 'OK'
    });

    if (!authJson.token) {
      throw new Error(`Safite rechazó la autenticación: ${JSON.stringify(authJson)}`);
    }

    // 5. Esperar a que se guarde en localStorage
    await page.waitForTimeout(1000);
    const token = await page.evaluate(() => localStorage.getItem('token'));

    if (!token) {
      throw new Error('No se encontró el token en localStorage tras el login exitoso.');
    }

    console.log(`[Playwright] ¡Token capturado con éxito! Longitud: ${token.length} caracteres.`);

    // 6. Sincronizar el token con la API del Asistente en Vercel / MySQL
    console.log(`[Playwright] Enviando token a ${SYNC_API_URL}...`);
    const syncRes = await fetch(SYNC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, autoRegister: true })
    });

    const syncData = await syncRes.json().catch(() => ({}));

    if (!syncRes.ok) {
      throw new Error(`Fallo al sincronizar token con la API: ${JSON.stringify(syncData)}`);
    }

    console.log('='.repeat(60));
    console.log('¡RENOVACIÓN EXITOSA!');
    console.log(`Usuario: ${syncData.usuario}`);
    console.log(`Empresa ID: ${syncData.empresaId}`);
    console.log(`Expira en: ${syncData.expiraEn}`);
    console.log(`¿Vinculado a Telegram?: ${syncData.isLinked ? 'SÍ' : 'NO'}`);
    console.log('='.repeat(60));

    await browser.close();
    return syncData;
  } catch (error) {
    console.error('[Playwright Error]', error);
    try {
      await page.screenshot({ path: 'safite-login-error.png', fullPage: true });
      console.log('[Playwright] Captura de pantalla guardada en safite-login-error.png');
    } catch {}
    await browser.close();
    throw error;
  }
}

// Ejecutar si se llama directamente
renewSafiteToken()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
