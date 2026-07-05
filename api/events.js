// api/events.js — public endpoint
import { kv } from './_kv.js';
import { cors, ok, err, normalizeRecord, safeParseJsonArray } from './_lib.js';

// JSON array fields that Upstash deserializes — re-stringify them.
// Kept in one place (this array) and reused for both events and settings so
// this list can never drift out of sync with api/admin/events.js again.
const EVENT_JSON_FIELDS = ['speakers', 'tagThemes'];
const SETTINGS_JSON_FIELDS = ['teamMembers'];

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
  const teamMembers = safeParseJsonArray(settings?.teamMembers);

  if (!ids || ids.length === 0) return ok(res, { events: [], settings, teamMembers });

  const events = (await Promise.all(
    ids.map(id => kv.hgetall(`event:${id}`))
  )).filter(Boolean).map(r => normalizeRecord(r, EVENT_JSON_FIELDS)).sort((a, b) => {
    const da = a.date || a.createdAt || '';
    const db = b.date || b.createdAt || '';
    return da.localeCompare(db);
  });

  return ok(res, { events, settings, teamMembers });
}

async function getSettings(kv) {
  const s = await kv.hgetall('settings');
  return s ? normalizeRecord(s, SETTINGS_JSON_FIELDS) : {
    displayMode: 'single',
    siteTitle: 'Events',
    siteSubtitle: '',
    collectName: 'true',
    heroText: '',
    teamMembers: '[]'
  };
}
