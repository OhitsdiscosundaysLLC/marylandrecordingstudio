// Channel integrations: /api/integrations/whatsapp and /api/integrations/phone (rewritten to ?op=...).
import whatsapp from './_lib/routes/whatsapp.js';
import phone from './_lib/routes/phone.js';
import { send } from './_lib/http.js';
const ROUTES = { whatsapp, phone };
export const config = { api: { bodyParser: false } };
export default function handler(req, res) {
  const u = new URL(req.url, 'http://x');
  const op = u.searchParams.get('op') || u.pathname.split('/').pop();
  return ROUTES[op] ? ROUTES[op](req, res) : send(res, 404, { error: 'not_found' });
}
