// api/admin/subscribers.js — merged subscriber list + CSV export
// Routed by ?format= (default: json list, ?format=csv: file download) — both
// read the exact same `subscriber:*` records, so this saves a function slot.
import { kv } from '../_kv.js';
import { cors, verifyJWT, ok, err, normalizeRecord } from '../_lib.js';

// Prefix values that start with =,+,-,@ with a leading apostrophe so
// spreadsheet apps (Excel/Sheets) treat them as literal text instead of
// executing them as a formula (CSV/"formula injection" hardening).
const csvEscape = v => {
  let s = String(v || '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  try { verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }

  const emails = await kv.smembers('subscribers');
  const records = emails?.length
    ? (await Promise.all(emails.map(e => kv.hgetall(`subscriber:${e}`)))).filter(Boolean).map(r => normalizeRecord(r))
    : [];

  if (req.query?.format === 'csv') {
    records.sort((a, b) => (a.subscribedAt || '').localeCompare(b.subscribedAt || ''));
    const lines = ['email,name,subscribedAt'];
    for (const r of records) {
      lines.push([csvEscape(r.email), csvEscape(r.name), csvEscape(r.subscribedAt)].join(','));
    }
    const filename = `subscribers_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send('\uFEFF' + lines.join('\n')); // BOM for Excel UTF-8
  }

  records.sort((a, b) => (b.subscribedAt || '').localeCompare(a.subscribedAt || '')); // newest first
  return ok(res, { subscribers: records });
}
