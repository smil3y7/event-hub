// api/admin/subscribers.js
import { kv } from '../_kv.js';
import { cors, verifyJWT, ok, err } from '../_lib.js';

function normalizeRecord(record) {
  if (!record) return record;
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = v === null || v === undefined ? '' : String(v);
  }
  return out;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  try { verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }

  const emails = await kv.smembers('subscribers');
  if (!emails || emails.length === 0) return ok(res, { subscribers: [] });

  const subscribers = (await Promise.all(
    emails.map(e => kv.hgetall(`subscriber:${e}`))
  )).filter(Boolean).map(normalizeRecord);

  subscribers.sort((a, b) => (b.subscribedAt || '').localeCompare(a.subscribedAt || '')); // newest first

  return ok(res, { subscribers });
}
