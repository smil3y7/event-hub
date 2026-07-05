// api/_lib.js — shared utilities (not exposed as endpoint)
import jwt from 'jsonwebtoken';
import { kv } from './_kv.js';

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

export function verifyJWT(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) throw new Error('No token');
  return jwt.verify(token, process.env.JWT_SECRET);
}

export function ok(res, data, status = 200) {
  res.status(status).json({ ok: true, ...data });
}

export function err(res, message, status = 400) {
  res.status(status).json({ ok: false, error: message });
}

// Extract client IP from Vercel's forwarded headers (Vercel proxies all traffic).
export function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// Simple fixed-window rate limiter backed by the same Upstash Redis instance.
// Returns true if the request is allowed, false if the limit was exceeded.
// key should already include the action name and identifier (e.g. ip), windowSeconds is the bucket size.
export async function checkRateLimit(key, maxRequests, windowSeconds) {
  const count = await kv.incr(key);
  if (count === 1) {
    await kv.expire(key, windowSeconds);
  }
  return count <= maxRequests;
}

// ── SHARED RECORD NORMALIZATION ──────────────────────────────────────────
// Upstash auto-deserializes JSON-looking string values back into arrays/objects
// on read. Since all our hash fields are meant to be flat strings (with a few
// designated JSON-array fields), we normalize every record the same way
// everywhere it's read, so behavior can never drift between endpoints again.
//
// jsonFields: field names that should always come back out as a JSON string
// (e.g. 'speakers', 'tagThemes', 'teamMembers') rather than a plain String().
export function normalizeRecord(record, jsonFields = []) {
  if (!record) return record;
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (jsonFields.includes(k)) {
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

// Safely coerce a value that might already be an array/object (Upstash
// auto-deserialization), a JSON string, or empty/nullish, into a plain array.
export function safeParseJsonArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return Object.values(v);
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
