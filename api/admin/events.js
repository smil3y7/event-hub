// api/admin/events.js
import { kv } from '../_kv.js';
import { cors, verifyJWT, ok, err } from '../_lib.js';
import { randomUUID } from 'crypto';

// Normalize hash fields — Upstash auto-deserializes JSON-like values.
// speakers is stored as JSON array string; if Upstash returns it as an object, re-stringify.
function normalizeRecord(record) {
  if (!record) return record;
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === 'speakers') {
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

function parseSpeakers(event) {
  const v = event?.speakers;
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return Object.values(v);
  try { return JSON.parse(v); } catch { return []; }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try { verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }

  if (req.method === 'GET') {
    const ids = await kv.smembers('events');
    if (!ids || ids.length === 0) return ok(res, { events: [] });
    const events = (await Promise.all(ids.map(id => kv.hgetall(`event:${id}`)))).filter(Boolean).map(normalizeRecord);
    events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return ok(res, { events });
  }

  if (req.method === 'POST') {
    const { id, title, description, date, time, location, locationUrl, imageUrl,
            isOnline, published, colorTag, eventType, speakers } = req.body || {};
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
      bio: (s.bio || '').trim().substring(0, 300),
      imageUrl: (s.imageUrl || '').trim(),
      link: (s.link || '').trim()
    })).filter(s => s.name) : [];

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
      updatedAt: new Date().toISOString()
    };
    if (!isUpdate) fields.createdAt = new Date().toISOString();

    await kv.hset(`event:${eventId}`, fields);
    if (!isUpdate) await kv.sadd('events', eventId);
    return ok(res, { id: eventId }, isUpdate ? 200 : 201);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return err(res, 'Missing id');
    await kv.del(`event:${id}`);
    await kv.srem('events', id);
    return ok(res, { deleted: id });
  }

  return err(res, 'Method not allowed', 405);
}
