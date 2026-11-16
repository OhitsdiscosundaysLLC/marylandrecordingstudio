// Signed URLs for the private Supabase 'projects' bucket, issued by the mrs-files edge function.
export async function files(action, payload) {
  const r = await fetch(`${process.env.SUPABASE_URL}/functions/v1/mrs-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.SUPABASE_ANON_KEY },
    body: JSON.stringify({ secret: process.env.DB_API_SECRET, action, ...payload }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`files ${action} ${r.status}: ${j.error || ''}`);
  return j;
}
export const MAX_FILE = 50 * 1024 * 1024;
export const OK_EXT = /\.(wav|aif|aiff|mp3|m4a|flac|ogg|zip|rar|7z|pdf|txt|mid|midi|als|logicx|ptx|flp)$/i;
