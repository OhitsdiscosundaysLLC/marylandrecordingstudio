// All OpenAI calls run server-side with the owner's key from the OPENAI_API_KEY environment variable.
export function openaiConfigured() { return Boolean(process.env.OPENAI_API_KEY); }
export class OpenAIError extends Error {}
export async function openai(path, body) {
  if (!openaiConfigured()) throw new OpenAIError('OPENAI_API_KEY is not set in the Vercel project environment variables.');
  const r = await fetch(`https://api.openai.com/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  if (!r.ok) {
    const msg = json?.error?.message || text.slice(0, 200);
    const err = new OpenAIError(r.status === 401 ? `OpenAI rejected the key in OPENAI_API_KEY (401): ${msg}` : `OpenAI ${r.status}: ${msg}`);
    err.status = r.status; throw err;
  }
  return json;
}
