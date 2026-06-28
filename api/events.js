// api/events.js — public endpoint
import { kv } from './_kv.js';
import { cors, ok, err } from './_lib.js';

// JSON array fields that Upstash deserializes — re-stringify them.
const JSON_ARRAY_FIELDS = new Set(['teamMembers', 'speakers', 'tagThemes']);

function normalizeRecord(record) {
  if (!record) return record;
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (JSON_ARRAY_FIELDS.has(k)) {
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

  // Smart cache: referer tells us which page is asking.
  // index.html wants fresh content (30s), archive/team pages can cache longer (120s).
  const referer = req.headers['referer'] || '';
  const isArchive = referer.includes('events.html') || referer.includes('team.html');
  const maxAge = isArchive ? 120 : 30;
  res.setHeader('Cache-Control', `s-maxage=${maxAge}, stale-while-revalidate=60`);

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
    siteTitle: 'Events',
    siteSubtitle: '',
    collectName: 'true',
    heroText: '',
    teamMembers: '[]'
  };
}
