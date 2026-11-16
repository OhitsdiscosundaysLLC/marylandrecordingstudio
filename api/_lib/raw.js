// Reads the raw request body (needed to verify webhook signatures). Reads the stream first so
// the platform's lazy JSON parser (req.body getter) is never triggered.
export async function rawBody(req, limit = 200_000) {
  if (!req.readableEnded) {
    let size = 0; const chunks = [];
    for await (const c of req) { size += c.length; if (size > limit) throw new Error('too large'); chunks.push(c); }
    if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  }
  const b = req.body;
  if (typeof b === 'string') return b;
  if (Buffer.isBuffer(b)) return b.toString('utf8');
  return b && typeof b === 'object' ? JSON.stringify(b) : '';
}
