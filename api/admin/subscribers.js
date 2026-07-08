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

// Strips embedded HTML (e.g. intentional <a href> links admin put in the
// description) before truncating — cutting raw HTML by character count risks
// slicing through a tag and leaving broken/dangling markup in the email
// (unlike the website, there's no way to "click through" a broken email to
// see the fixed version). The event page linked at the bottom has the full
// formatted description with any links intact.
function truncateAtWord(text, maxLen) {
  const plain = String(text || '').replace(/<[^>]+>/g, '');
  if (plain.length <= maxLen) return plain;
  const cut = plain.substring(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.6 ? cut.substring(0, lastSpace) : cut) + '…';
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let caller;
  try { caller = verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }
  // Subscriber emails are personal data — reserved for admin/master, not editor.
  if (caller.role !== 'admin' && caller.role !== 'master') return err(res, 'Forbidden', 403);

  if (req.method === 'POST' && req.query?.action === 'send-invite') {
    const { eventId, dryRun } = req.body || {};
    if (!eventId) return err(res, 'Missing eventId');

    const ev = await kv.hgetall(`event:${eventId}`);
    if (!ev) return err(res, 'Event not found', 404);

    const emails = await kv.smembers('subscribers');
    if (!emails?.length) return err(res, 'Ni naročnikov, ki bi jim lahko poslal vabilo.');

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const eventUrl = `${proto}://${req.headers.host}/events?id=${encodeURIComponent(eventId)}`;
    const subject = `Vabilo: ${ev.title || 'Dogodek'}`;
    const description = truncateAtWord(ev.description || '', 900);
    const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f2f0f9">
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;padding:2.2rem 1.8rem;color:#2a2a35;background:#ffffff;border-radius:12px">
    <h1 style="font-size:1.4rem;font-weight:400;margin:0 0 0.6rem;line-height:1.3">${escapeHtml(ev.title)}</h1>
    <p style="color:#7c6dfa;font-size:0.85rem;font-family:Arial,sans-serif;margin:0 0 1.3rem">${escapeHtml(ev.date || '')}${ev.time ? ' · ' + escapeHtml(ev.time) : ''}${ev.location ? ' · ' + escapeHtml(ev.location) : ''}</p>
    <p style="line-height:1.7;font-size:0.95rem;white-space:pre-line;margin:0 0 1.6rem">${escapeHtml(description)}</p>
    <p style="margin:0">
      <a href="${eventUrl}" style="display:inline-block;background:#7c6dfa;color:#ffffff;text-decoration:none;padding:0.7rem 1.5rem;border-radius:8px;font-family:Arial,sans-serif;font-size:0.9rem">Več informacij in prijava →</a>
    </p>
  </div>
</body></html>`;

    // Dry run assembles the exact same subject/html/recipient list as a real
    // send, just without ever calling sendEmail() — lets the whole pipeline
    // (event lookup, HTML generation, subscriber count) be verified with no
    // email provider configured at all.
    if (dryRun) {
      return ok(res, { preview: true, subject, html, recipientCount: emails.length });
    }

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
