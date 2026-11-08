/**
 * Headless Safite login (Playwright). Works on Vercel (serverless Chromium)
 * and locally (regular Playwright Chromium).
 * Needed because Safite protects /login/authenticate with reCAPTCHA.
 */

import { chromium } from 'playwright-core';
import { query } from '../db/mysql.js';
import { decrypt } from '../crypto.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export async function launchBrowser() {
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (serverless) {
    const { default: sparticuz } = await import('@sparticuz/chromium');
    return chromium.launch({
      args: [...sparticuz.args, '--disable-blink-features=AutomationControlled'],
      executablePath: await sparticuz.executablePath(),
      headless: true,
    });
  }
  const args = ['--disable-blink-features=AutomationControlled', '--no-sandbox'];
  try {
    return await chromium.launch({ headless: true, args, channel: 'chrome' });
  } catch {
    return chromium.launch({ headless: true, args });
  }
}

function jwtExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    if (payload.exp) return new Date(payload.exp * 1000);
  } catch {}
  return new Date(Date.now() + 24 * 3600 * 1000);
}

function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`Timeout de ${Math.round(ms / 1000)} s renovando sesión.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

/** Logs one user in and returns { token, expiresAt }. Throws on failure. */
export async function loginWithBrowser(browser, { usuario, password, idEmpresa }, mark = () => {}) {
  const loginUrl = process.env.SAFITE_LOGIN_URL;
  if (!loginUrl) throw new Error('Falta SAFITE_LOGIN_URL.');

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: UA });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();

  try {
    mark('goto_login');
    const [empresasRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('obtenerEmpresas'), { timeout: 35000 }),
      page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }),
    ]);
    mark('wait_form');
    try {
      await page.waitForSelector('#nameUserL', { state: 'visible', timeout: 20000 });
    } catch (e) {
      // Diagnostics: what does Safite actually show to this IP?
      const body = await empresasRes.text().catch(() => '');
      const visible = await page
        .evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300))
        .catch(() => '');
      const diag = {
        pageUrl: page.url().split('?')[0],
        title: await page.title().catch(() => ''),
        empresasStatus: empresasRes.status(),
        empresasBody: body.slice(0, 300),
        visibleText: visible,
      };
      throw new Error(`Formulario de login no apareció. ${JSON.stringify(diag)}`);
    }
    mark('form_visible');
    mark('typing');

    await page.click('#nameUserL');
    await page.type('#nameUserL', usuario, { delay: 30 });
    await page.click('#passUserL');
    await page.type('#passUserL', password, { delay: 30 });

    const select = await page.$('#empresaTipoS');
    if (select && (await select.isVisible())) {
      try {
        await page.selectOption('#empresaTipoS', String(idEmpresa));
      } catch {
        const options = await page.$$eval('#empresaTipoS option', (o) =>
          o.map((x) => x.value).filter((v) => v !== '0')
        );
        if (options.length) await page.selectOption('#empresaTipoS', options[0]);
      }
    }

    mark('submit');
    const [authRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('authenticate'), { timeout: 25000 }),
      page.click('#formUsuarioEmpresa button[type="submit"]'),
    ]);
    if (authRes.status() !== 200) throw new Error(`Safite respondió ${authRes.status()}`);

    mark('auth_response_' + authRes.status());
    await page.waitForTimeout(1500);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    if (!token) throw new Error('No se encontró el token JWT tras el login.');

    return { token, expiresAt: jwtExpiry(token) };
  } catch (err) {
    // Local/CI only: keep a screenshot for the workflow's "upload artifact on failure" step.
    if (!process.env.VERCEL) {
      await page.screenshot({ path: `error-login-${usuario}.png`, fullPage: true }).catch(() => {});
    }
    throw err;
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Users whose token is missing or expires within `withinHours`, soonest first.
 * Skips users with no stored password (token-only registrations).
 */
export async function getUsersToRenew({ withinHours = 6, userId = null } = {}) {
  const rows = userId
    ? await query('SELECT * FROM usuarios WHERE id = ? AND status != "INACTIVE"', [userId])
    : await query(
        `SELECT * FROM usuarios
         WHERE status != 'INACTIVE'
           AND (safite_token IS NULL OR safite_token_expires_at IS NULL
                OR safite_token_expires_at < DATE_ADD(NOW(), INTERVAL ? HOUR))
         ORDER BY safite_token_expires_at IS NOT NULL, safite_token_expires_at ASC`,
        [withinHours]
      );

  const users = [];
  for (const r of rows) {
    const enc = r.safite_password_encrypted;
    if (!enc || enc === 'TOKEN_AUTH' || enc === 'SESSION_EXTENSION') continue;
    try {
      users.push({
        id: r.id,
        nombre: r.nombre,
        usuario: r.safite_usuario,
        password: decrypt(enc),
        idEmpresa: r.safite_id_empresa || process.env.SAFITE_ID_EMPRESA,
      });
    } catch (e) {
      console.warn(`[Renew] No se pudo descifrar la clave de ${r.safite_usuario}: ${e.message}`);
    }
  }
  return users;
}

export async function saveToken(userId, { token, expiresAt }) {
  await query(
    `UPDATE usuarios SET safite_token = ?, safite_token_expires_at = ?,
       status = CASE WHEN status = 'NEEDS_RELINK' THEN 'NEEDS_RELINK' ELSE 'ACTIVE' END
     WHERE id = ?`,
    [token, expiresAt, userId]
  );
}

/**
 * Renews as many users as fit in `budgetMs`. Returns per-user results.
 */
export async function renewTokens({
  withinHours = 6,
  userId = null,
  maxUsers = Infinity,
  trace = [],
  budgetMs = 240000,
  perUserMs = 50000,
} = {}) {
  const started = Date.now();
  const mark = (stage) => {
    trace.push({ ms: Date.now() - started, stage });
    console.log(`[Renew] +${Date.now() - started}ms ${stage}`);
  };
  mark('query_users');
  const all = await getUsersToRenew({ withinHours, userId });
  const users = all.slice(0, maxUsers);
  const total = all.length;
  const results = [];
  mark(`users_found_${total}`);
  if (!users.length) return { results, pending: 0 };

  mark('launch_browser');
  const browser = await withTimeout(launchBrowser(), 25000);
  mark('browser_ready');
  try {
    for (const u of users) {
      if (Date.now() - started + perUserMs > budgetMs) break;
      mark(`login_start_${u.usuario}`);
      try {
        const out = await withTimeout(loginWithBrowser(browser, u, mark), perUserMs);
        await saveToken(u.id, out);
        results.push({ id: u.id, usuario: u.usuario, ok: true, expiresAt: out.expiresAt });
      } catch (err) {
        results.push({ id: u.id, usuario: u.usuario, ok: false, error: err.message });
      }
    }
  } finally {
    await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
    mark('browser_closed');
  }
  return { results, pending: Math.max(total - results.length, 0) };
}
