// api/auth/add-user.js — master only
import { kv } from '../_kv.js';
import bcrypt from 'bcryptjs';
import { cors, verifyJWT, ok, err } from '../_lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  let caller;
  try { caller = verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }
  if (caller.role !== 'master') return err(res, 'Forbidden', 403);

  const { username, password, role = 'admin' } = req.body || {};
  if (!username || !password) return err(res, 'Missing fields');
  if (!['admin', 'editor'].includes(role)) return err(res, 'Invalid role');

  const existing = await kv.exists(`user:${username.toLowerCase()}`);
  if (existing) return err(res, 'User already exists');

  const hash = await bcrypt.hash(password, 12);
  await kv.hset(`user:${username.toLowerCase()}`, {
    passwordHash: hash,
    role,
    mustChangePassword: 'true'
  });

  // keep list of all users
  await kv.sadd('users', username.toLowerCase());

  return ok(res, { username: username.toLowerCase(), role }, 201);
}
