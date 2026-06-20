// api/subscribe.js
import { kv } from './_kv.js';
import { cors, ok, err, getClientIp, checkRateLimit } from './_lib.js';
import { randomUUID } from 'crypto';

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  const ip = getClientIp(req);
  const allowed = await checkRateLimit(`ratelimit:subscribe:${ip}`, 5, 3600); // 5 attempts/hour/IP
  if (!allowed) return err(res, 'Preveč poskusov. Poskusi znova čez nekaj časa.', 429);

  const { email, name = '' } = req.body || {};
  if (!email) return err(res, 'Email is required');
  if (!isValidEmail(email)) return err(res, 'Invalid email address');

  const key = `subscriber:${email.toLowerCase()}`;
  const existing = await kv.exists(key);
  if (existing) return ok(res, { message: 'Already subscribed' });

  await kv.hset(key, {
    email: email.toLowerCase(),
    name: name.trim().substring(0, 100),
    subscribedAt: new Date().toISOString(),
    unsubscribeToken: randomUUID()
  });
  await kv.sadd('subscribers', email.toLowerCase());

  return ok(res, { message: 'Subscribed successfully' }, 201);
}
