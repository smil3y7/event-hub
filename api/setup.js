// api/setup.js — run ONCE to seed initial users, then delete or protect
// Call: POST /api/setup with body { masterSecret: "value from env SETUP_SECRET" }
import { kv } from './_kv.js';
import bcrypt from 'bcryptjs';
import { cors, ok, err } from './_lib.js';

const INITIAL_USERS = [
  { username: 'master', password: 'ChangeMe2024!', role: 'master' },
  { username: 'admin1', password: 'ChangeMe2024!', role: 'admin' },
  { username: 'admin2', password: 'ChangeMe2024!', role: 'admin' },
  { username: 'admin3', password: 'ChangeMe2024!', role: 'admin' },
];

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  const { masterSecret } = req.body || {};
  if (masterSecret !== process.env.SETUP_SECRET) return err(res, 'Forbidden', 403);

  // Check if already set up
  const existing = await kv.exists('user:master');
  if (existing) return err(res, 'Already set up', 409);

  for (const u of INITIAL_USERS) {
    const hash = await bcrypt.hash(u.password, 12);
    await kv.hset(`user:${u.username}`, {
      passwordHash: hash,
      role: u.role,
      mustChangePassword: 'true',
      displayName: ''
    });
    await kv.sadd('users', u.username);
  }

  // Seed default settings (colorTheme is now per-event, not global)
  await kv.hset('settings', {
    displayMode: 'single',
    siteTitle: 'LD Events',
    siteSubtitle: 'Prebudi se v svoje sanje',
    collectName: 'true',
    footerText: ''
  });

  return ok(res, { message: 'Setup complete', users: INITIAL_USERS.map(u => u.username) }, 201);
}
