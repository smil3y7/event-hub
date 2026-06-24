// api/admin/settings.js
import { kv } from '../_kv.js';
import { cors, verifyJWT, ok, err } from '../_lib.js';
import { randomUUID } from 'crypto';

const ALLOWED_MODES = ['single', 'catalog', 'series'];

// Upstash auto-deserializes JSON-like hash values (e.g. "true" -> boolean true).
// We always store/expect plain strings, so normalize every field back to string.
// teamMembers is stored as a JSON string and parsed separately.
function normalizeRecord(record) {
  if (!record) return record;
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === 'teamMembers') {
      // keep as-is (string), caller will JSON.parse
      out[k] = v === null || v === undefined ? '[]' : String(v);
    } else {
      out[k] = v === null || v === undefined ? '' : String(v);
    }
  }
  return out;
}

function parseTeamMembers(settings) {
  try { return JSON.parse(settings?.teamMembers || '[]'); } catch { return []; }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try { verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }

  // ── GET — return settings + parsed team members ──────────────────────────
  if (req.method === 'GET') {
    const raw = await kv.hgetall('settings');
    const settings = normalizeRecord(raw) || {};
    return ok(res, {
      settings,
      teamMembers: parseTeamMembers(settings)
    });
  }

  // ── PUT — update site settings ────────────────────────────────────────────
  if (req.method === 'PUT') {
    const { displayMode, siteTitle, siteSubtitle, collectName, footerText, heroText } = req.body || {};

    const updates = {};
    if (displayMode && ALLOWED_MODES.includes(displayMode)) updates.displayMode = displayMode;
    if (siteTitle !== undefined) updates.siteTitle = siteTitle.trim().substring(0, 80);
    if (siteSubtitle !== undefined) updates.siteSubtitle = siteSubtitle.trim().substring(0, 120);
    if (collectName !== undefined) updates.collectName = collectName ? 'true' : 'false';
    if (footerText !== undefined) updates.footerText = footerText.trim().substring(0, 200);
    if (heroText !== undefined) updates.heroText = heroText.trim().substring(0, 600);

    if (Object.keys(updates).length > 0) await kv.hset('settings', updates);

    const raw = await kv.hgetall('settings');
    const settings = normalizeRecord(raw);
    return ok(res, { settings, teamMembers: parseTeamMembers(settings) });
  }

  // ── POST /admin/settings?action=add-member ───────────────────────────────
  if (req.method === 'POST') {
    const action = req.query?.action;
    if (action !== 'add-member' && action !== 'update-member') return err(res, 'Unknown action');

    const { id, name, bio, imageUrl, link, role: memberRole } = req.body || {};
    if (!name?.trim()) return err(res, 'Name is required');

    const raw = await kv.hgetall('settings');
    const settings = normalizeRecord(raw) || {};
    const members = parseTeamMembers(settings);

    if (action === 'add-member') {
      members.push({
        id: randomUUID(),
        name: name.trim().substring(0, 60),
        role: (memberRole || '').trim().substring(0, 60),
        bio: (bio || '').trim().substring(0, 400),
        imageUrl: (imageUrl || '').trim(),
        link: (link || '').trim()
      });
    } else {
      // update-member
      const idx = members.findIndex(m => m.id === id);
      if (idx === -1) return err(res, 'Member not found', 404);
      members[idx] = {
        ...members[idx],
        name: name.trim().substring(0, 60),
        role: (memberRole || '').trim().substring(0, 60),
        bio: (bio || '').trim().substring(0, 400),
        imageUrl: (imageUrl || '').trim(),
        link: (link || '').trim()
      };
    }

    await kv.hset('settings', { teamMembers: JSON.stringify(members) });
    return ok(res, { teamMembers: members }, 201);
  }

  // ── DELETE /admin/settings?action=remove-member&id=xxx ───────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return err(res, 'Missing member id');

    const raw = await kv.hgetall('settings');
    const settings = normalizeRecord(raw) || {};
    const members = parseTeamMembers(settings).filter(m => m.id !== id);
    await kv.hset('settings', { teamMembers: JSON.stringify(members) });
    return ok(res, { teamMembers: members });
  }

  return err(res, 'Method not allowed', 405);
}
