import crypto from 'node:crypto';
const COOKIE = 'mrs_hq';
const sign = (v) => crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET || '').update(v).digest('base64url');
export function adminConfigured() { return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_PATH); }
export function checkPassword(pw) {
  const a = Buffer.from(String(pw || '')); const b = Buffer.from(process.env.ADMIN_PASSWORD || '');
  return a.length === b.length && b.length > 0 && crypto.timingSafeEqual(a, b);
}
export function sessionCookie() {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 14;
  const v = `${exp}.${sign(String(exp))}`;
  return `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 24 * 14}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
export function isAuthed(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)mrs_hq=([^;]+)/);
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
