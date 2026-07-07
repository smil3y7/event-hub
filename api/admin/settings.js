// api/admin/settings.js
import { kv } from '../_kv.js';
import { cors, verifyJWT, ok, err, normalizeRecord, safeParseJsonArray, slugify, logAudit, DEFAULT_EVENT_TYPES, DEFAULT_EVENT_THEMES } from '../_lib.js';
import { randomUUID } from 'crypto';

const ALLOWED_MODES = ['single', 'catalog', 'series'];
const SETTINGS_JSON_FIELDS = ['teamMembers', 'eventTypes', 'eventThemes'];

// Thin wrappers kept so the rest of this file reads the same as before —
// both now delegate to the single shared implementation in _lib.js.
const safeParseMembers = (raw) => safeParseJsonArray(raw?.teamMembers);
const parseTagList = (raw, field, fallback) => {
  const list = safeParseJsonArray(raw?.[field]);
  return list.length ? list : fallback;
};
const normalizeSettings = (raw) => raw ? normalizeRecord(raw, SETTINGS_JSON_FIELDS) : {};

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let caller;
  try { caller = verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }
  // Site-wide settings and the tag taxonomy affect the whole public site, not
  // just one editor's own content — reserved for admin/master. Team member
  // management stays open to everyone (that's ordinary content work).
  const isAdmin = caller.role === 'admin' || caller.role === 'master';

  // ── GET ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const raw = await kv.hgetall('settings');
    const settings = normalizeSettings(raw);
    return ok(res, {
      settings,
      teamMembers: safeParseMembers(raw),
      eventTypes: parseTagList(raw, 'eventTypes', DEFAULT_EVENT_TYPES),
      eventThemes: parseTagList(raw, 'eventThemes', DEFAULT_EVENT_THEMES)
    });
  }

  // ── PUT — site settings (admin/master only) ──────────────────────────────
  if (req.method === 'PUT') {
    if (!isAdmin) return err(res, 'Forbidden', 403);
    const { displayMode, siteTitle, siteSubtitle, collectName, footerText, heroText } = req.body || {};
    const updates = {};
    if (displayMode && ALLOWED_MODES.includes(displayMode)) updates.displayMode = displayMode;
    if (siteTitle !== undefined) updates.siteTitle = siteTitle.trim().substring(0, 80);
    if (siteSubtitle !== undefined) updates.siteSubtitle = siteSubtitle.trim().substring(0, 120);
    if (collectName !== undefined) updates.collectName = collectName ? 'true' : 'false';
    if (footerText !== undefined) updates.footerText = footerText.trim().substring(0, 200);
    if (heroText !== undefined) updates.heroText = heroText.trim().substring(0, 3000);
    if (Object.keys(updates).length > 0) await kv.hset('settings', updates);
    await logAudit(caller.username, 'settings.update', Object.keys(updates).join(', '));
    const raw = await kv.hgetall('settings');
    return ok(res, { settings: normalizeSettings(raw), teamMembers: safeParseMembers(raw) });
  }

  // ── POST — add/update team member, or add a tag ──────────────────────────
  if (req.method === 'POST') {
    const action = req.query?.action;

    if (action === 'add-tag') {
      if (!isAdmin) return err(res, 'Forbidden', 403);
      const { scope, label } = req.body || {};
      if (scope !== 'type' && scope !== 'theme') return err(res, 'Invalid scope');
      const cleanLabel = (label || '').trim().substring(0, 40);
      if (!cleanLabel) return err(res, 'Label is required');
      const id = slugify(cleanLabel);
      if (!id) return err(res, 'Ime mora vsebovati vsaj eno črko ali številko.');

      const field = scope === 'type' ? 'eventTypes' : 'eventThemes';
      const fallback = scope === 'type' ? DEFAULT_EVENT_TYPES : DEFAULT_EVENT_THEMES;
      const raw = await kv.hgetall('settings');
      const list = parseTagList(raw, field, fallback);

      if (list.some(t => t.id === id)) return err(res, 'Oznaka s tem imenom (ali zelo podobnim) že obstaja.');
      list.push({ id, label: cleanLabel });
      await kv.hset('settings', { [field]: JSON.stringify(list) });
      await logAudit(caller.username, 'tag.add', `${scope}: ${cleanLabel}`);
      return ok(res, { eventTypes: scope === 'type' ? list : parseTagList(raw, 'eventTypes', DEFAULT_EVENT_TYPES),
                        eventThemes: scope === 'theme' ? list : parseTagList(raw, 'eventThemes', DEFAULT_EVENT_THEMES) }, 201);
    }

    if (action !== 'add-member' && action !== 'update-member') return err(res, 'Unknown action');

    const { id, name, bio, imageUrl, link, contact, role: memberRole } = req.body || {};
    if (!name?.trim()) return err(res, 'Name is required');

    const raw = await kv.hgetall('settings');
    const members = safeParseMembers(raw);

    const memberData = {
      name: name.trim().substring(0, 60),
      role: (memberRole || '').trim().substring(0, 60),
      bio: (bio || '').trim().substring(0, 2000),
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
    await logAudit(caller.username, action === 'add-member' ? 'member.add' : 'member.update', memberData.name);
    return ok(res, { teamMembers: members }, 201);
  }

  // ── DELETE — remove team member, or remove a tag ─────────────────────────
  if (req.method === 'DELETE') {
    const action = req.query?.action;

    if (action === 'delete-tag') {
      if (!isAdmin) return err(res, 'Forbidden', 403);
      const { scope, id } = req.query;
      if (scope !== 'type' && scope !== 'theme') return err(res, 'Invalid scope');
      if (!id) return err(res, 'Missing tag id');
      const field = scope === 'type' ? 'eventTypes' : 'eventThemes';
      const fallback = scope === 'type' ? DEFAULT_EVENT_TYPES : DEFAULT_EVENT_THEMES;
      const raw = await kv.hgetall('settings');
      const list = parseTagList(raw, field, fallback).filter(t => t.id !== id);
      await kv.hset('settings', { [field]: JSON.stringify(list) });
      await logAudit(caller.username, 'tag.delete', `${scope}: ${id}`);
      return ok(res, { eventTypes: scope === 'type' ? list : parseTagList(raw, 'eventTypes', DEFAULT_EVENT_TYPES),
                        eventThemes: scope === 'theme' ? list : parseTagList(raw, 'eventThemes', DEFAULT_EVENT_THEMES) });
    }

    const { id } = req.query;
    if (!id) return err(res, 'Missing member id');
    const raw = await kv.hgetall('settings');
    const members = safeParseMembers(raw);
    const removed = members.find(m => m.id === id);
    const kept = members.filter(m => m.id !== id);
    await kv.hset('settings', { teamMembers: JSON.stringify(kept) });
    await logAudit(caller.username, 'member.delete', removed?.name || id);
    return ok(res, { teamMembers: kept });
  }

  return err(res, 'Method not allowed', 405);
}
