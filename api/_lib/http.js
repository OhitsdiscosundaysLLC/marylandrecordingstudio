// Tiny helpers so the API functions run unchanged on Vercel and on the local dev server.
export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export async function readJSONBody(req, limit = 20_000) {
  if (req.body && typeof req.body === 'object') return req.body; // already parsed by Vercel
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export const CACHE = (seconds, swr = seconds * 6) => ({ 'Cache-Control': `public, s-maxage=${seconds}, stale-while-revalidate=${swr}, max-age=60` });
