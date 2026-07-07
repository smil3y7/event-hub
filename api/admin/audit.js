// api/admin/audit.js — read-only view of the audit log written by other
// admin endpoints via logAudit() in _lib.js. Deliberately admin/master only:
// editor's own actions ARE logged (so nothing is lost), they just can't
// browse the log themselves — same reasoning as subscribers being off-limits.
import { kv } from '../_kv.js';
import { cors, verifyJWT, ok, err } from '../_lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  let caller;
  try { caller = verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }
  const isAdmin = caller.role === 'admin' || caller.role === 'master';
  if (!isAdmin) return err(res, 'Forbidden', 403);

  const limit = Math.min(parseInt(req.query?.limit, 10) || 50, 500);
  const raw = await kv.lrange('audit_log', 0, limit - 1);
  const entries = (raw || []).map(r => {
    if (typeof r === 'object') return r; // Upstash may auto-deserialize
    try { return JSON.parse(r); } catch { return null; }
  }).filter(Boolean);

  return ok(res, { entries });
}
