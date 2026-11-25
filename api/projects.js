// Public project submission (mixing, mastering, any service): files go straight from the browser
// to private storage with one-time signed URLs; the submission is saved for the dashboard.
import crypto from 'node:crypto';
import { send, readJSONBody } from './_lib/http.js';
import { rpc, dbConfigured } from './_lib/db.js';
import { files, MAX_FILE, OK_EXT } from './_lib/files.js';
import { leadAlert } from './_lib/notify.js';

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, n);
const hits = new Map();
function limited(req, max) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
  const now = Date.now(); const list = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (list.length >= max) return true; list.push(now); hits.set(ip, list); return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'forbidden' }); } catch { return send(res, 403, { error: 'forbidden' }); } }
  if (!dbConfigured()) return send(res, 503, { error: 'not_configured' });
  const action = new URL(req.url, 'http://x').searchParams.get('action');
  let b; try { b = await readJSONBody(req, 30_000); } catch { return send(res, 400, { error: 'bad_request' }); }

  if (action === 'upload-url') {
    if (limited(req, 60)) return send(res, 429, { error: 'Too many uploads. Try again later.' });
    const name = clean(b.name, 140); const size = Number(b.size);
    if (!OK_EXT.test(name)) return send(res, 400, { error: 'File type not accepted. Use audio (WAV, AIFF, MP3, FLAC, M4A), ZIP, MIDI, PDF or a project file.' });
    if (!(size > 0) || size > MAX_FILE) return send(res, 400, { error: 'Each file must be 50 MB or less. For bigger sessions, paste a Google Drive / Dropbox / WeTransfer link instead.' });
    const folder = /^[a-z0-9-]{8,40}$/.test(b.batch || '') ? b.batch : crypto.randomUUID();
    const safe = name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
    try {
      const out = await files('upload', { path: `${folder}/${Date.now().toString(36)}-${safe}` });
      return send(res, 200, { batch: folder, path: out.path, uploadUrl: `${process.env.SUPABASE_URL}/storage/v1/object/upload/sign/projects/${out.path}?token=${out.token}` });
    } catch (e) { console.error(e.message); return send(res, 502, { error: 'Upload is unavailable right now. Paste a link to your files instead.' }); }
  }

  if (action === 'submit') {
    if (limited(req, 10)) return send(res, 429, { error: 'Too many submissions. Try again later.' });
    if (b.website) return send(res, 200, { ok: true });
    const p = {
      name: clean(b.name, 120), email: clean(b.email, 200), phone: clean(b.phone, 40), service: clean(b.service, 80),
      title: clean(b.title, 200), notes: clean(b.notes, 4000), reference: clean(b.reference, 500), deadline: clean(b.deadline, 60),
      link: clean(b.link, 500), consent_contact: b.consent_contact === true, consent_marketing: b.consent_marketing === true,
      visitor_id: clean(b.visitor_id, 64), source: clean(b.source, 120),
      files: (Array.isArray(b.files) ? b.files : []).slice(0, 30).map((f) => ({ path: clean(f.path, 300), name: clean(f.name, 140), size: Number(f.size) || 0 })).filter((f) => /^[a-z0-9-]+\/[A-Za-z0-9._-]+$/.test(f.path)),
    };
    const fields = {};
    if (p.name.length < 2) fields.name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email)) fields.email = 'Please enter a valid email.';
    if (!p.service) fields.service = 'Choose what you need.';
    if (!p.files.length && !/^https?:\/\//.test(p.link)) fields.files = 'Upload at least one file or paste a link to your files.';
    if (!p.consent_contact) fields.consent_contact = 'Please agree so we can contact you about this project.';
    if (Object.keys(fields).length) return send(res, 400, { error: 'validation', fields });
    try {
      const id = await rpc('mrs_project_create', { p });
      await rpc('mrs_lead', { p: { name: p.name, email: p.email, phone: p.phone, service: p.service, project: `${p.title ? p.title + ': ' : ''}${p.notes}`.slice(0, 2000), preferred_date: p.deadline, stage: 'project_enquiry', priority: 'medium', consent_contact: true, consent_marketing: p.consent_marketing, source: 'project_upload', notes: `Project ${id}` } });
      await leadAlert({ type: 'Project upload', dedupKey: `project:${id}`, name: p.name, email: p.email, phone: p.phone, service: p.service, details: p.notes, tab: 'projects', extra: [['Title', p.title], ['Deadline', p.deadline], ['Files', p.files.map((f) => f.name).join(', ') || '-'], ['Shared link', p.link ? 'Yes (see dashboard)' : '-']] }).catch((e) => console.error('alert', e.message));
      return send(res, 200, { ok: true, id });
    } catch (e) { console.error(e.message); return send(res, 502, { error: 'Could not save your project. Please try again or email us.' }); }
  }
  send(res, 400, { error: 'unknown action' });
}
