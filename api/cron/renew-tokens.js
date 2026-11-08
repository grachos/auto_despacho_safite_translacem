/**
 * GET /api/cron/renew-tokens  (called by the Hostinger cron)
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Optional query: ?userId=<id> to force one user, ?hours=<n> window (default 6).
 * Renews as many expiring Safite sessions as fit in the time budget; the next
 * run picks up the rest. On failures it alerts the admin via Telegram
 * (set ADMIN_TELEGRAM_CHAT_ID).
 */

import { requireCron } from '../../src/auth/guards.js';
import { renewTokens } from '../../src/safite/browserLogin.js';
import { TelegramBotClient } from '../../src/telegram/api.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (!requireCron(req, res)) return;

  const userId = req.query.userId ? Number(req.query.userId) : null;
  const withinHours = req.query.hours ? Number(req.query.hours) : 6;

  try {
    const { results, pending } = await renewTokens({ withinHours, userId });
    const failed = results.filter((r) => !r.ok);

    const chatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
    if (failed.length && chatId && process.env.TELEGRAM_BOT_TOKEN) {
      const text =
        '⚠️ Renovación de tokens Safite con errores:\n' +
        failed.map((f) => `• ${f.usuario}: ${f.error}`).join('\n');
      await new TelegramBotClient().sendMessage(chatId, text, { parseMode: null }).catch(() => {});
    }

    return res.status(failed.length ? 207 : 200).json({
      success: failed.length === 0,
      renewed: results.length - failed.length,
      failed: failed.length,
      pending,
      results,
    });
  } catch (err) {
    console.error('[renew-tokens]', err);
    return res.status(500).json({ error: err.message });
  }
}
