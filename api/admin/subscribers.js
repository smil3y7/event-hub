// api/admin/subscribers.js — merged subscriber list + CSV export + send-invite
// Routed by ?format= (default: json list, ?format=csv: file download) for GET,
// and ?action=send-invite for POST — all operate on the same subscriber data,
// so keeping them together saves a function slot.
import { kv } from '../_kv.js';
import { cors, verifyJWT, ok, err, normalizeRecord, pipelineHgetall, sendEmail, escapeHtml, logAudit } from '../_lib.js';

// Prefix values that start with =,+,-,@ with a leading apostrophe so
// spreadsheet apps (Excel/Sheets) treat them as literal text instead of
// executing them as a formula (CSV/"formula injection" hardening).
const csvEscape = v => {
  let s = String(v || '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

// Resend's practical per-call recipient limit can change — check their
// current docs if you have a very large subscriber list before relying on
// this chunk size. Sending in chunks means a single oversized list can't
// silently fail the whole invite in one go.
const EMAIL_CHUNK_SIZE = 45;

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let caller;
  try { caller = verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }
  // Subscriber emails are personal data — reserved for admin/master, not editor.
  if (caller.role !== 'admin' && caller.role !== 'master') return err(res, 'Forbidden', 403);

  if (req.method === 'POST' && req.query?.action === 'send-invite') {
    const { eventId } = req.body || {};
    if (!eventId) return err(res, 'Missing eventId');

    const ev = await kv.hgetall(`event:${eventId}`);
    if (!ev) return err(res, 'Event not found', 404);

    const emails = await kv.smembers('subscribers');
    if (!emails?.length) return err(res, 'Ni naročnikov, ki bi jim lahko poslal vabilo.');

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const eventUrl = `${proto}://${req.headers.host}/events?id=${encodeURIComponent(eventId)}`;
    const subject = `Vabilo: ${ev.title || 'Dogodek'}`;
    const html = `
      <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#222">
        <h2 style="font-weight:400">${escapeHtml(ev.title)}</h2>
        <p style="color:#555;font-size:0.9rem">${escapeHtml(ev.date || '')}${ev.time ? ' · ' + escapeHtml(ev.time) : ''}${ev.location ? ' · ' + escapeHtml(ev.location) : ''}</p>
        <p style="line-height:1.6">${(ev.description || '').substring(0, 600)}</p>
        <p><a href="${eventUrl}" style="color:#7c6dfa">Več informacij in prijava →</a></p>
      </div>`;

    const chunks = [];
    for (let i = 0; i < emails.length; i += EMAIL_CHUNK_SIZE) chunks.push(emails.slice(i, i + EMAIL_CHUNK_SIZE));

    let sentCount = 0;
    for (const chunk of chunks) {
      const result = await sendEmail(chunk, subject, html);
      if (!result.ok) return err(res, result.error);
      sentCount += chunk.length;
    }

    await logAudit(caller.username, 'invite.send', `${ev.title} → ${sentCount} naročnikov`);
    return ok(res, { sent: sentCount });
  }

  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  const emails = await kv.smembers('subscribers');
  const records = emails?.length
    ? (await pipelineHgetall(emails.map(e => `subscriber:${e}`))).filter(Boolean).map(r => normalizeRecord(r))
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
