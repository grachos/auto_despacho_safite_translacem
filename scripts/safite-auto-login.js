/**
 * Local CLI: renews Safite tokens using the same logic as /api/cron/renew-tokens.
 * Usage: node scripts/safite-auto-login.js [--all] [--user <id>]
 *   (default: only users whose token expires in < 6h)
 */

import 'dotenv/config';
import { renewTokens } from '../src/safite/browserLogin.js';

const args = process.argv.slice(2);
const userIdx = args.indexOf('--user');
const userId = userIdx >= 0 ? Number(args[userIdx + 1]) : null;
const withinHours = args.includes('--all') ? 100000 : 6;

const { results, pending } = await renewTokens({ withinHours, userId, budgetMs: 15 * 60 * 1000 });
for (const r of results) {
  console.log(`${r.ok ? '✅' : '❌'} ${r.usuario} ${r.ok ? 'hasta ' + r.expiresAt.toLocaleString('es-CO') : r.error}`);
}
console.log(`Pendientes: ${pending}`);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
