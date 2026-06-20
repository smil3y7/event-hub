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
