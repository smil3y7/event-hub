// api/subscribe.js — merged subscribe + unsubscribe endpoint
// Routed by ?action= (default: subscribe) — same pattern as api/auth.js,
// kept together since both operate on the same `subscriber:*` records and
// this saves one function slot on Vercel's Hobby plan (12-function limit).
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

  const action = req.query?.action || 'subscribe';
  if (action === 'unsubscribe') return handleUnsubscribe(req, res);
  return handleSubscribe(req, res);
}

async function handleSubscribe(req, res) {
  const ip = getClientIp(req);
  const allowed = await checkRateLimit(`ratelimit:subscribe:${ip}`, 5, 3600); // 5 poskusov/uro/IP
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

// Self-service unsubscribe by email lookup — single shared link works for
// everyone since recipients are emailed via BCC (identical message).
async function handleUnsubscribe(req, res) {
  const ip = getClientIp(req);
  const allowed = await checkRateLimit(`ratelimit:unsubscribe:${ip}`, 10, 3600); // 10 poskusov/uro/IP
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
