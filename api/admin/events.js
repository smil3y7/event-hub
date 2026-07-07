// api/admin/events.js
import { kv } from '../_kv.js';
import { cors, verifyJWT, ok, err, normalizeRecord, safeParseJsonArray, pipelineHgetall, logAudit } from '../_lib.js';
import { randomUUID } from 'crypto';

// Kept in sync with api/events.js — both files normalize the same hash shape.
const EVENT_JSON_FIELDS = ['speakers', 'tagThemes'];

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let caller;
  try { caller = verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }

  if (req.method === 'GET') {
    const ids = await kv.smembers('events');
    if (!ids || ids.length === 0) return ok(res, { events: [] });
    const events = (await pipelineHgetall(ids.map(id => `event:${id}`)))
      .filter(Boolean).map(r => normalizeRecord(r, EVENT_JSON_FIELDS));
    events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return ok(res, { events });
  }

  if (req.method === 'POST') {
    const { id, title, description, date, time, location, locationUrl, imageUrl,
            isOnline, published, colorTag, eventType, speakers,
            tagType, tagThemes } = req.body || {};
    if (!title) return err(res, 'Title is required');

    const eventId = id || randomUUID();
    const isUpdate = !!id;

    const ALLOWED_COLORS = ['oneiro-dark', 'forest-dream', 'ember-trance', 'void'];
    const safeColor = ALLOWED_COLORS.includes(colorTag) ? colorTag : 'oneiro-dark';
    const safeType = eventType === 'recurring' ? 'recurring' : 'single';

    // Sanitize speakers array
    const safeSpeakers = Array.isArray(speakers) ? speakers.map(s => ({
      id: s.id || randomUUID(),
      name: (s.name || '').trim().substring(0, 60),
      role: (s.role || '').trim().substring(0, 60),
      bio: (s.bio || '').trim().substring(0, 2000),
      imageUrl: (s.imageUrl || '').trim(),
      link: (s.link || '').trim()
    })).filter(s => s.name) : [];

    // Sanitize tags
    const safeTagType = typeof tagType === 'string' ? tagType.trim().substring(0, 40) : '';
    const safeTagThemes = Array.isArray(tagThemes)
      ? tagThemes.filter(t => typeof t === 'string').map(t => t.trim()).filter(Boolean)
      : [];

    const fields = {
      id: eventId,
      title: title.trim(),
      description: (description || '').trim(),
      date: date || '',
      time: time || '',
      location: (location || '').trim(),
      locationUrl: (locationUrl || '').trim(),
      imageUrl: (imageUrl || '').trim(),
      isOnline: isOnline ? 'true' : 'false',
      published: published !== false ? 'true' : 'false',
      colorTag: safeColor,
      eventType: safeType,
      speakers: JSON.stringify(safeSpeakers),
      tagType: safeTagType,
      tagThemes: JSON.stringify(safeTagThemes),
      updatedAt: new Date().toISOString()
    };
    if (!isUpdate) fields.createdAt = new Date().toISOString();

    await kv.hset(`event:${eventId}`, fields);
    if (!isUpdate) await kv.sadd('events', eventId);
    await logAudit(caller.username, isUpdate ? 'event.update' : 'event.create', title.trim());
    return ok(res, { id: eventId }, isUpdate ? 200 : 201);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return err(res, 'Missing id');
    const existing = await kv.hgetall(`event:${id}`);
    await kv.del(`event:${id}`);
    await kv.srem('events', id);
    await logAudit(caller.username, 'event.delete', existing?.title || id);
    return ok(res, { deleted: id });
  }

  return err(res, 'Method not allowed', 405);
}
