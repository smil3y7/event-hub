// api/_lib.js — shared utilities (not exposed as endpoint)
import jwt from 'jsonwebtoken';
import { kv } from './_kv.js';

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

export function verifyJWT(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) throw new Error('No token');
  return jwt.verify(token, process.env.JWT_SECRET);
}

export function ok(res, data, status = 200) {
  res.status(status).json({ ok: true, ...data });
}

export function err(res, message, status = 400) {
  res.status(status).json({ ok: false, error: message });
}

// Extract client IP from Vercel's forwarded headers (Vercel proxies all traffic).
export function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// Simple fixed-window rate limiter backed by the same Upstash Redis instance.
// Returns true if the request is allowed, false if the limit was exceeded.
// key should already include the action name and identifier (e.g. ip), windowSeconds is the bucket size.
export async function checkRateLimit(key, maxRequests, windowSeconds) {
  const count = await kv.incr(key);
  if (count === 1) {
    await kv.expire(key, windowSeconds);
  }
  return count <= maxRequests;
}

// ── SHARED RECORD NORMALIZATION ──────────────────────────────────────────
// Upstash auto-deserializes JSON-looking string values back into arrays/objects
// on read. Since all our hash fields are meant to be flat strings (with a few
// designated JSON-array fields), we normalize every record the same way
// everywhere it's read, so behavior can never drift between endpoints again.
//
// jsonFields: field names that should always come back out as a JSON string
// (e.g. 'speakers', 'tagThemes', 'teamMembers') rather than a plain String().
export function normalizeRecord(record, jsonFields = []) {
  if (!record) return record;
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (jsonFields.includes(k)) {
      if (Array.isArray(v) || (typeof v === 'object' && v !== null)) {
        out[k] = JSON.stringify(v);
      } else {
        out[k] = v === null || v === undefined ? '[]' : String(v);
      }
    } else {
      out[k] = v === null || v === undefined ? '' : String(v);
    }
  }
  return out;
}

// Safely coerce a value that might already be an array/object (Upstash
// auto-deserialization), a JSON string, or empty/nullish, into a plain array.
export function safeParseJsonArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return Object.values(v);
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Turns a display label into a URL/id-safe slug, e.g. "Izventelesne izkušnje"
// → "izventelesne-izkusnje". Handles Slovenian diacritics explicitly since
// they wouldn't otherwise be stripped by a plain ASCII-range regex.
const SI_DIACRITICS = { š: 's', č: 'c', ž: 'z', đ: 'dj', ć: 'c', Š: 's', Č: 'c', Ž: 'z', Đ: 'dj', Ć: 'c' };
export function slugify(text) {
  return String(text || '')
    .split('').map(ch => SI_DIACRITICS[ch] || ch).join('')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Fetches multiple hashes in a single round-trip to Upstash instead of one
// HTTP request per key (what Promise.all(keys.map(k => kv.hgetall(k))) does).
// Returns results in the same order as `keys`, with null for missing hashes.
// Worth it once a list (events, subscribers, users) grows past a handful of
// entries — each hgetall is a separate REST call on Upstash's free tier.
export async function pipelineHgetall(keys) {
  if (!keys || keys.length === 0) return [];
  const pipeline = kv.pipeline();
  keys.forEach(k => pipeline.hgetall(k));
  return await pipeline.exec();
}
// ── EMAIL SENDING ─────────────────────────────────────────────────────────
// Deliberately isolated behind this one function — if the email provider
// ever changes (Resend → Postmark → something else), this is the only place
// that needs to change, not every endpoint that sends mail.
//
// Requires RESEND_API_KEY and RESEND_FROM_EMAIL env vars. Until those are
// set, this returns a clear "not configured" error instead of failing
// mysteriously — callers should surface `result.error` directly to the admin.
//
// `to` can be a single email or an array (sent via BCC so recipients can't
// see each other's addresses). Resend's practical recipient-per-call limits
// can change — check their current docs before removing/relying on this
// chunk size if you significantly grow your subscriber list.
export async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return { ok: false, error: 'E-poštni ponudnik ni nastavljen. Dodaj RESEND_API_KEY in RESEND_FROM_EMAIL v Vercel nastavitve okolja, nato poskusi znova.' };
  }
  const recipients = Array.isArray(to) ? to : [to];
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [fromEmail], bcc: recipients, subject, html })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.message || `Napaka pri pošiljanju (${res.status}).` };
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, error: 'Napaka pri povezavi z e-poštnim ponudnikom.' };
  }
}

// Backend counterpart of the frontend escapeHtml in _shared.js — used when
// building HTML email bodies from admin-entered text (event titles etc.).
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── AUDIT LOG ─────────────────────────────────────────────────────────────
// A lightweight change history: every admin write action pushes one entry
// onto a capped Redis list (newest first). Kept intentionally small in scope
// — who did what to which record, not a full diff of old/new values — so it
// stays cheap to store and fast to read even as it grows.
//
// Capped at this many entries (oldest silently dropped past the cap) so
// Upstash storage never grows unbounded — older entries have diminishing
// value anyway. Change here if you want a longer/shorter history.
export const AUDIT_LOG_MAX_ENTRIES = 500;

export async function logAudit(who, action, target) {
  try {
    const entry = JSON.stringify({ who, action, target: target || '', at: new Date().toISOString() });
    await kv.lpush('audit_log', entry);
    await kv.ltrim('audit_log', 0, AUDIT_LOG_MAX_ENTRIES - 1);
  } catch {
    // Audit logging must never break the actual operation it's describing —
    // if Redis hiccups here, the calling endpoint's real work still succeeded.
  }
}
// ── EVENT TAGS (types/themes) ────────────────────────────────────────────
// Admin-editable via the "Oznake" section in settings (stored in the
// `settings` hash as eventTypes/eventThemes). These are only the seed values
// used the very first time a site has no tags configured yet — after that,
// whatever's in `settings` always wins. Shared here so api/events.js (public)
// and api/admin/settings.js (admin) can never drift out of sync on defaults.
export const DEFAULT_EVENT_TYPES = [
  { id: 'delavnica', label: 'Delavnica' },
  { id: 'predavanje', label: 'Predavanje' },
  { id: 'ritual', label: 'Ritual' },
  { id: 'meditacija', label: 'Meditacija' },
  { id: 'pogovor', label: 'Pogovor' },
  { id: 'drugo', label: 'Drugo' }
];
export const DEFAULT_EVENT_THEMES = [
  { id: 'sanje', label: 'Sanje' },
  { id: 'lucidno-sanjanje', label: 'Lucidno sanjanje' },
  { id: 'samanizem', label: 'Šamanizem' },
  { id: 'zavest', label: 'Zavest' },
  { id: 'energija', label: 'Energija' },
  { id: 'telo', label: 'Telo' },
  { id: 'narava', label: 'Narava' },
  { id: 'zdravljenje', label: 'Zdravljenje' },
  { id: 'izventelesne-izkusnje', label: 'Izventelesne izkušnje' },
  { id: 'drugo', label: 'Drugo' }
];
