// api/events.js — public endpoint
import { kv } from './_kv.js';
import { cors, ok, err } from './_lib.js';

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
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  const ids = await kv.smembers('events');
  if (!ids || ids.length === 0) return ok(res, { events: [], settings: await getSettings(kv) });

  const events = (await Promise.all(
    ids.map(id => kv.hgetall(`event:${id}`))
  )).filter(Boolean).map(normalizeRecord).sort((a, b) => {
    // sort by date ascending (upcoming first), then by createdAt
    const da = a.date || a.createdAt || '';
    const db = b.date || b.createdAt || '';
    return da.localeCompare(db);
  });

  const settings = await getSettings(kv);

  return ok(res, { events, settings });
}

async function getSettings(kv) {
  const s = await kv.hgetall('settings');
  return s ? normalizeRecord(s) : {
    displayMode: 'single',
    siteTitle: 'Sentria Events',
    siteSubtitle: '',
    collectName: 'true'
  };
}
