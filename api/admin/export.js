// api/admin/export.js
import { kv } from '../_kv.js';
import { cors, verifyJWT, err } from '../_lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  try { verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }

  const emails = await kv.smembers('subscribers');
  if (!emails || emails.length === 0) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="subscribers.csv"');
    return res.status(200).send('email,name,subscribedAt\n');
  }

  const records = (await Promise.all(emails.map(e => kv.hgetall(`subscriber:${e}`)))).filter(Boolean);
  records.sort((a, b) => (a.subscribedAt || '').localeCompare(b.subscribedAt || ''));

  const csvEscape = v => `"${(v || '').replace(/"/g, '""')}"`;
  const lines = ['email,name,subscribedAt'];
  for (const r of records) {
    lines.push([csvEscape(r.email), csvEscape(r.name), csvEscape(r.subscribedAt)].join(','));
  }

  const filename = `subscribers_${new Date().toISOString().split('T')[0]}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send('\uFEFF' + lines.join('\n')); // BOM for Excel UTF-8
}
