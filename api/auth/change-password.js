// api/auth/change-password.js
import { kv } from '../_kv.js';
import bcrypt from 'bcryptjs';
import { cors, verifyJWT, ok, err } from '../_lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  let caller;
  try { caller = verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }

  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return err(res, 'Missing fields');
  if (newPassword.length < 8) return err(res, 'Password too short (min 8 chars)');

  const user = await kv.hgetall(`user:${caller.username}`);
  if (!user) return err(res, 'User not found', 404);

  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) return err(res, 'Old password incorrect', 401);

  const hash = await bcrypt.hash(newPassword, 12);
  await kv.hset(`user:${caller.username}`, {
    passwordHash: hash,
    mustChangePassword: 'false'
  });

  return ok(res, { message: 'Password changed' });
}
