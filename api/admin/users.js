// api/admin/users.js
import { kv } from '../_kv.js';
import { cors, verifyJWT, ok, err } from '../_lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let caller;
  try { caller = verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }
  if (caller.role !== 'master') return err(res, 'Forbidden', 403);

  if (req.method === 'GET') {
    const usernames = await kv.smembers('users');
    const users = (await Promise.all(
      (usernames || []).map(async u => {
        const data = await kv.hgetall(`user:${u}`);
        if (!data) return null;
        return { username: u, role: String(data.role || ''), mustChangePassword: String(data.mustChangePassword) === 'true' ? 'true' : 'false' };
      })
    )).filter(Boolean);
    return ok(res, { users });
  }

  if (req.method === 'DELETE') {
    const { username } = req.query;
    if (!username) return err(res, 'Missing username');
    if (username === caller.username) return err(res, 'Cannot delete yourself');
    await kv.del(`user:${username}`);
    await kv.srem('users', username);
    return ok(res, { deleted: username });
  }

  return err(res, 'Method not allowed', 405);
}
