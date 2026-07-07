// api/auth.js — merged auth + user-management endpoint
// (login, change-password, add-user, me, set-name, list-users, delete-user)
// Routed by ?action= query param to keep total serverless function count under Vercel Hobby's 12-function limit.
import { kv } from './_kv.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cors, verifyJWT, ok, err, getClientIp, checkRateLimit, pipelineHgetall, logAudit } from './_lib.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query?.action;

  switch (action) {
    case 'login': return handleLogin(req, res);
    case 'change-password': return handleChangePassword(req, res);
    case 'add-user': return handleAddUser(req, res);
    case 'me': return handleMe(req, res);
    case 'set-name': return handleSetName(req, res);
    case 'list-users': return handleListUsers(req, res);
    case 'delete-user': return handleDeleteUser(req, res);
    default: return err(res, 'Unknown or missing action', 400);
  }
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  // Rate limit by IP to make password brute-forcing impractical. Kept
  // generous (10/hour) so a legitimate admin fumbling their password a few
  // times in a row never gets locked out, while still stopping automated guessing.
  const ip = getClientIp(req);
  const allowed = await checkRateLimit(`ratelimit:login:${ip}`, 10, 3600);
  if (!allowed) return err(res, 'Preveč poskusov prijave. Poskusi znova čez nekaj časa.', 429);

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
    mustChangePassword: user.mustChangePassword === 'true' || user.mustChangePassword === true
  });
}

async function handleChangePassword(req, res) {
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

async function handleAddUser(req, res) {
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
    mustChangePassword: 'true',
    displayName: ''
  });

  await kv.sadd('users', username.toLowerCase());
  await logAudit(caller.username, 'user.add', `${username.toLowerCase()} (${role})`);

  return ok(res, { username: username.toLowerCase(), role }, 201);
}

async function handleMe(req, res) {
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  let caller;
  try { caller = verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }

  const user = await kv.hgetall(`user:${caller.username}`);
  if (!user) return err(res, 'User not found', 404);

  return ok(res, {
    username: caller.username,
    role: caller.role,
    displayName: user.displayName ? String(user.displayName) : ''
  });
}

async function handleSetName(req, res) {
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  let caller;
  try { caller = verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }

  const { displayName } = req.body || {};
  if (typeof displayName !== 'string') return err(res, 'Missing displayName');

  const cleaned = displayName.trim().substring(0, 60);
  await kv.hset(`user:${caller.username}`, { displayName: cleaned });

  return ok(res, { displayName: cleaned });
}

// ── USER MANAGEMENT (master only) — previously api/admin/users.js ──────────
async function handleListUsers(req, res) {
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  let caller;
  try { caller = verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }
  if (caller.role !== 'master') return err(res, 'Forbidden', 403);

  const usernames = await kv.smembers('users');
  const records = await pipelineHgetall((usernames || []).map(u => `user:${u}`));
  const users = records.map((data, i) => {
    if (!data) return null;
    return { username: usernames[i], role: String(data.role || ''), mustChangePassword: String(data.mustChangePassword) === 'true' ? 'true' : 'false' };
  }).filter(Boolean);
  return ok(res, { users });
}

async function handleDeleteUser(req, res) {
  if (req.method !== 'DELETE') return err(res, 'Method not allowed', 405);

  let caller;
  try { caller = verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }
  if (caller.role !== 'master') return err(res, 'Forbidden', 403);

  const { username } = req.query;
  if (!username) return err(res, 'Missing username');
  if (username === caller.username) return err(res, 'Cannot delete yourself');
  await kv.del(`user:${username}`);
  await kv.srem('users', username);
  await logAudit(caller.username, 'user.delete', username);
  return ok(res, { deleted: username });
}
