// api/events.js — public endpoint
import { kv } from './_kv.js';
import { cors, ok, err } from './_lib.js';

// Upstash auto-deserializes JSON-like hash values (e.g. "true" -> boolean true).
// We always store/expect plain strings, so normalize every field back to string.
// Special case: teamMembers and speakers are JSON arrays — Upstash deserializes them
// to actual JS arrays, so we re-stringify them instead of using String() which would
// produce "[object Object]".
function normalizeRecord(record) {
  if (!record) return record;
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === 'teamMembers' || k === 'speakers') {
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

function parseTeamMembers(settings) {
  const v = settings?.teamMembers;
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return Object.values(v);
  try { return JSON.parse(v); } catch { return []; }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  const ids = await kv.smembers('events');
  const settings = await getSettings(kv);
  const teamMembers = parseTeamMembers(settings);

  if (!ids || ids.length === 0) return ok(res, { events: [], settings, teamMembers });

  const events = (await Promise.all(
    ids.map(id => kv.hgetall(`event:${id}`))
  )).filter(Boolean).map(normalizeRecord).sort((a, b) => {
    const da = a.date || a.createdAt || '';
    const db = b.date || b.createdAt || '';
    return da.localeCompare(db);
  });

  return ok(res, { events, settings, teamMembers });
}

async function getSettings(kv) {
  const s = await kv.hgetall('settings');
  return s ? normalizeRecord(s) : {
    displayMode: 'single',
    siteTitle: 'Sentria Events',
    siteSubtitle: '',
    collectName: 'true',
    heroText: '',
    teamMembers: '[]'
  };
}
