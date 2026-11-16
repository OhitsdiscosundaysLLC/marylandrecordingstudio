// GET /api/youtube: latest uploads from the official Disco Sundays channel.
// Uses YouTube's public channel feed (no API key needed). If YOUTUBE_API_KEY is set,
// it uses the YouTube Data API v3 instead, which returns more than 15 videos.
import { send, CACHE } from './_lib/http.js';

const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UCuiLXxntyyMegzINhvDn0aw';

const decode = (s = '') => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function fromFeed() {
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, { headers: { 'User-Agent': 'MarylandRecordingStudioSite/1.0' } });
  if (!r.ok) throw new Error(`feed ${r.status}`);
  const xml = await r.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
    const id = (e.match(/<yt:videoId>([^<]+)/) || [])[1];
    return {
      id,
      title: decode((e.match(/<title>([^<]*)/) || [])[1] || ''),
      published: (e.match(/<published>([^<]+)/) || [])[1],
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }).filter((v) => v.id);
}

async function fromDataApi(key) {
  const ch = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${key}`).then((r) => r.json());
  const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error('no uploads playlist');
  const pl = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=24&playlistId=${uploads}&key=${key}`).then((r) => r.json());
  return (pl.items || []).map((i) => ({
    id: i.snippet.resourceId.videoId,
    title: i.snippet.title,
    published: i.snippet.publishedAt,
    url: `https://www.youtube.com/watch?v=${i.snippet.resourceId.videoId}`,
    thumbnail: i.snippet.thumbnails?.high?.url || `https://i.ytimg.com/vi/${i.snippet.resourceId.videoId}/hqdefault.jpg`,
  })).filter((v) => v.title !== 'Private video' && v.title !== 'Deleted video');
}

export default async function handler(req, res) {
  try {
    const key = process.env.YOUTUBE_API_KEY;
    const videos = key ? await fromDataApi(key).catch(fromFeed) : await fromFeed();
    return send(res, 200, { channel: `https://www.youtube.com/channel/${CHANNEL_ID}`, videos }, CACHE(1800));
  } catch (err) {
    console.error('[api/youtube]', err.message);
    return send(res, 502, { error: 'youtube_unavailable', videos: [] }, CACHE(120));
  }
}
