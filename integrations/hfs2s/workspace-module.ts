import type { Module } from '../_registry';
import { z } from 'zod';
const id = z.string().uuid();
async function relay(path: string, body?: unknown) {
  const key = process.env.HFS2S_MAIL_KEY;
  if (!key) return Response.json({ error: 'Sending is not configured yet.', code: 'not_configured' }, { status: 503 });
  try {
    const response = await fetch('https://hfs2s.app/api/photobooth/' + path, {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return Response.json(await response.json(), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Sending could not be confirmed. Retry with the same photo.', code: 'connection_failed' }, { status: 502 }); }
}
const schema = z.object({ id, channel: z.enum(['email','whatsapp']), recipient: z.string().max(254), png: z.string().max(7000000), consent: z.literal(true) }).strict();
function allowed(request: Request) { return ['https://community-photobooth.hfs2s.app', 'https://hfs2s.app'].includes(request.headers.get('origin') || ''); }
const aiSchema = z.object({ id, style: z.enum(['illustrated','clay','retro']), png: z.string().max(7000000), consent: z.literal(true), remix: z.string().trim().max(500).default('') }).strict();
export const photobooth: Module = { id: 'photobooth', nav: { label: 'Photobooth', href: '/' }, routes: {
  'POST /send': async ({ body, request }) => {
    const origin = request.headers.get('origin');
    if (!origin || !['https://community-photobooth.hfs2s.app', 'https://hfs2s.app'].includes(origin))
      return Response.json({ error: 'Open Community Photobooth to send your photo.', code: 'invalid_origin' }, { status: 403 });
    return relay('send', schema.parse(body));
  },
  'GET /ai-config': async () => relay('ai/config'),
  'POST /ai-start': async ({ body, request }) => {
    if (!allowed(request)) return Response.json({ error: 'Open Community Photobooth to create a portrait.', code: 'invalid_origin' }, { status: 403 });
    return relay('ai/start', aiSchema.parse(body));
  },
  'GET /ai-status': async ({ query }) => relay('ai/status/' + id.parse(query.get('id'))),
  'GET /status': async ({ query }) => relay('status/' + id.parse(query.get('id'))),
} };
