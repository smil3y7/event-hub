// api/admin/upload-image.js — upload event images to Vercel Blob (replaces hotlink-dependent external URLs)
import { put } from '@vercel/blob';
import { cors, verifyJWT, ok, err } from '../_lib.js';

export const config = {
  api: { bodyParser: false } // we need raw stream access for the upload
};

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  try { verifyJWT(req); } catch { return err(res, 'Unauthorized', 401); }

  const contentType = req.headers['content-type'] || '';
  if (!ALLOWED_TYPES.includes(contentType)) {
    return err(res, 'Nepodprta vrsta datoteke. Uporabi JPEG, PNG, WebP ali GIF.');
  }

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_BYTES) {
    return err(res, 'Datoteka je prevelika (max 5MB).');
  }

  try {
    const ext = contentType.split('/')[1];
    const filename = `events/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const blob = await put(filename, req, {
      access: 'public',
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    return ok(res, { url: blob.url }, 201);
  } catch (e) {
    return err(res, 'Nalaganje ni uspelo: ' + e.message, 500);
  }
}
