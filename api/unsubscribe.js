// api/unsubscribe.js — self-service unsubscribe by email lookup
// Single shared link works for everyone since recipients were emailed via BCC (identical message).
import { kv } from './_kv.js';
import { cors, ok, err, getClientIp, checkRateLimit } from './_lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  const ip = getClientIp(req);
  const allowed = await checkRateLimit(`ratelimit:unsubscribe:${ip}`, 10, 3600); // 10 attempts/hour/IP
  if (!allowed) return err(res, 'Preveč poskusov. Poskusi znova čez nekaj časa.', 429);

  const { email } = req.body || {};
  if (!email) return err(res, 'Email is required');

  const key = `subscriber:${email.toLowerCase().trim()}`;
  const existing = await kv.exists(key);
  if (!existing) return ok(res, { message: 'Not subscribed' }); // don't leak whether email exists either way

  await kv.del(key);
  await kv.srem('subscribers', email.toLowerCase().trim());

  return ok(res, { message: 'Unsubscribed successfully' });
}
