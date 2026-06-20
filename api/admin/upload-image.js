// api/admin/upload-image.js — upload event images to Vercel Blob (replaces hotlink-dependent external URLs)
import { put } from '@vercel/blob';
import { cors, verifyJWT, ok, err } from '../_lib.js';

// NOTE: `export const config = { api: { bodyParser: false } }` only works in Next.js API routes.
// This project is plain Vercel Functions (no Next.js), so that directive is silently ignored.
// We manually buffer the raw request stream instead.

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BYTES) {
        reject(new Error('File too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

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
    const buffer = await readRawBody(req);

    const ext = contentType.split('/')[1];
    const filename = `events/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    // No explicit token — @vercel/blob SDK auto-detects OIDC credentials
    // (VERCEL_OIDC_TOKEN + BLOB_STORE_ID) when the store is connected via OIDC,
    // which is the default for stores connected directly within a project.
    const blob = await put(filename, buffer, {
      access: 'public',
      contentType
    });

    return ok(res, { url: blob.url }, 201);
  } catch (e) {
    console.error('upload-image error:', e); // visible in Vercel Logs even if e.message is empty
    return err(res, 'Nalaganje ni uspelo: ' + (e.message || 'neznana napaka'), 500);
  }
}
