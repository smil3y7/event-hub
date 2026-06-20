// api/admin/settings.js
import { kv } from '../_kv.js';
import { cors, verifyJWT, ok, err } from '../_lib.js';

const ALLOWED_THEMES = ['oneiro-dark', 'forest-dream', 'ember-trance', 'void'];
const ALLOWED_MODES = ['single', 'catalog', 'series'];

// Upstash auto-deserializes JSON-like hash values (e.g. "true" -> boolean true).
// We always store/expect plain strings, so normalize every field back to string.
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

  try { verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }

  if (req.method === 'GET') {
    const settings = await kv.hgetall('settings');
    return ok(res, { settings: normalizeRecord(settings) || {} });
  }

  if (req.method === 'PUT') {
    const { displayMode, colorTheme, siteTitle, siteSubtitle, collectName, footerText } = req.body || {};

    const updates = {};
    if (displayMode && ALLOWED_MODES.includes(displayMode)) updates.displayMode = displayMode;
    if (colorTheme && ALLOWED_THEMES.includes(colorTheme)) updates.colorTheme = colorTheme;
    if (siteTitle !== undefined) updates.siteTitle = siteTitle.trim().substring(0, 80);
    if (siteSubtitle !== undefined) updates.siteSubtitle = siteSubtitle.trim().substring(0, 120);
    if (collectName !== undefined) updates.collectName = collectName ? 'true' : 'false';
    if (footerText !== undefined) updates.footerText = footerText.trim().substring(0, 200);

    if (Object.keys(updates).length > 0) await kv.hset('settings', updates);

    const settings = await kv.hgetall('settings');
    return ok(res, { settings: normalizeRecord(settings) });
  }

  return err(res, 'Method not allowed', 405);
}
