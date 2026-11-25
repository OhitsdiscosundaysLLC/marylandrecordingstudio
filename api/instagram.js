// GET /api/instagram: recent posts from @discosundays via the official Instagram API.
// Requires INSTAGRAM_ACCESS_TOKEN: a long-lived token for a Business or Creator account
// (Instagram API with Instagram Login, permission instagram_business_basic).
// Without a token it returns { configured: false } and the site shows a link to the profile.
import { send, CACHE } from './_lib/http.js';

export default async function handler(req, res) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return send(res, 200, { configured: false, posts: [] }, CACHE(3600));
  try {
    const fields = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp';
    const r = await fetch(`https://graph.instagram.com/me/media?fields=${fields}&limit=12&access_token=${encodeURIComponent(token)}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || `status ${r.status}`);
    const posts = (data.data || []).filter((p) => p.permalink && (p.media_url || p.thumbnail_url));
    return send(res, 200, { configured: true, posts }, CACHE(900));
  } catch (err) {
    console.error('[api/instagram]', err.message);
    return send(res, 200, { configured: true, error: 'instagram_unavailable', posts: [] }, CACHE(120));
  }
}
