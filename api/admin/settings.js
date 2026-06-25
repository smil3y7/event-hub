// api/admin/settings.js
import { kv } from '../_kv.js';
import { cors, verifyJWT, ok, err } from '../_lib.js';
import { randomUUID } from 'crypto';

const ALLOWED_MODES = ['single', 'catalog', 'series'];

// Safely parse teamMembers from raw KV — Upstash may return already-deserialized array.
function safeParseMembers(raw) {
  const v = raw?.teamMembers;
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object' && v !== null) return Object.values(v);
  try { return JSON.parse(v); } catch { return []; }
}

// Normalize all other hash fields back to strings for consistent frontend use.
function normalizeSettings(raw) {
  if (!raw) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'teamMembers') {
      // re-stringify in case Upstash returned an array
      out[k] = Array.isArray(v) || (typeof v === 'object' && v !== null)
        ? JSON.stringify(v)
        : (v == null ? '[]' : String(v));
    } else {
      out[k] = v == null ? '' : String(v);
    }
  }
  return out;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try { verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }

  // ── GET ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const raw = await kv.hgetall('settings');
    const settings = normalizeSettings(raw);
    return ok(res, { settings, teamMembers: safeParseMembers(raw) });
  }

  // ── PUT — site settings ──────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const { displayMode, siteTitle, siteSubtitle, collectName, footerText, heroText } = req.body || {};
    const updates = {};
    if (displayMode && ALLOWED_MODES.includes(displayMode)) updates.displayMode = displayMode;
    if (siteTitle !== undefined) updates.siteTitle = siteTitle.trim().substring(0, 80);
    if (siteSubtitle !== undefined) updates.siteSubtitle = siteSubtitle.trim().substring(0, 120);
    if (collectName !== undefined) updates.collectName = collectName ? 'true' : 'false';
    if (footerText !== undefined) updates.footerText = footerText.trim().substring(0, 200);
    if (heroText !== undefined) updates.heroText = heroText.trim().substring(0, 3000); // increased limit
    if (Object.keys(updates).length > 0) await kv.hset('settings', updates);
    const raw = await kv.hgetall('settings');
    return ok(res, { settings: normalizeSettings(raw), teamMembers: safeParseMembers(raw) });
  }

  // ── POST — add or update team member ────────────────────────────────────
  if (req.method === 'POST') {
    const action = req.query?.action;
    if (action !== 'add-member' && action !== 'update-member') return err(res, 'Unknown action');

    const { id, name, bio, imageUrl, link, contact, role: memberRole } = req.body || {};
    if (!name?.trim()) return err(res, 'Name is required');

    // Read raw to safely get the current members array
    const raw = await kv.hgetall('settings');
    const members = safeParseMembers(raw);

    const memberData = {
      name: name.trim().substring(0, 60),
      role: (memberRole || '').trim().substring(0, 60),
      bio: (bio || '').trim().substring(0, 400),
      imageUrl: (imageUrl || '').trim(),
      link: (link || '').trim(),
      contact: (contact || '').trim().substring(0, 100)
    };

    if (action === 'add-member') {
      members.push({ id: randomUUID(), ...memberData });
    } else {
      const idx = members.findIndex(m => m.id === id);
      if (idx === -1) return err(res, 'Member not found', 404);
      members[idx] = { ...members[idx], ...memberData };
    }

    await kv.hset('settings', { teamMembers: JSON.stringify(members) });
    return ok(res, { teamMembers: members }, 201);
  }

  // ── DELETE — remove team member ──────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return err(res, 'Missing member id');
    const raw = await kv.hgetall('settings');
    const members = safeParseMembers(raw).filter(m => m.id !== id);
    await kv.hset('settings', { teamMembers: JSON.stringify(members) });
    return ok(res, { teamMembers: members });
  }

  return err(res, 'Method not allowed', 405);
}
