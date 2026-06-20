// api/auth/login.js
import { kv } from '../_kv.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cors, ok, err } from '../_lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  const { username, password } = req.body || {};
  if (!username || !password) return err(res, 'Missing credentials');

  const user = await kv.hgetall(`user:${username.toLowerCase()}`);
  if (!user) return err(res, 'Invalid credentials', 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return err(res, 'Invalid credentials', 401);

  const token = jwt.sign(
    { username: username.toLowerCase(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return ok(res, {
    token,
    username: username.toLowerCase(),
    role: user.role,
    mustChangePassword: user.mustChangePassword === 'true'
  });
}
