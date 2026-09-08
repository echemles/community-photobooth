import { createHash } from 'node:crypto';
import { z } from 'zod';
import * as db from '../lib/db.js';
import { PhotoError } from './photobooth.js';

const styles = {
  illustrated: 'A charming hand-painted illustrated travel postcard, warm ivory, terracotta and olive palette, expressive brushwork and a playful community gathering backdrop.',
  clay: 'A delightful handcrafted clay animation portrait, tactile clay textures, miniature studio setting, soft warm lighting and playful rounded forms.',
  retro: 'A stylish 1970s screen-printed portrait poster, warm terracotta and cream, rich ink textures and bold graphic shapes.',
};
function validSource(value: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const b = Buffer.from(value, 'base64');
  return b.length >= 45 && b.length <= 5 * 1024 * 1024 && b.toString('base64') === value
    && b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && b.toString('ascii', 12, 16) === 'IHDR'
    && [[1280,960], [1024,768], [768,576], [640,480]].some(([w,h]) => b.readUInt32BE(16) === w && b.readUInt32BE(20) === h)
    && b.subarray(-12).toString('hex') === '0000000049454e44ae426082';
}
const commonInput = { id: z.string().uuid(), style: z.enum(['illustrated', 'clay', 'retro']), consent: z.literal(true), remix: z.string().trim().max(500).default('') };
const sourceImage = z.string().max(7000000).refine(validSource);
// Keep old in-flight clients compatible; new sessions always send exactly three references.
export const startSchema = z.union([
  z.object({ ...commonInput, photos: z.array(sourceImage).length(3).refine(images => images.reduce((total, image) => total + image.length, 0) <= 7000000) }).strict(),
  z.object({ ...commonInput, png: sourceImage }).strict(),
]);
type StartInput = z.infer<typeof startSchema>;
export function generationPrompt(input: StartInput) {
  const direction = input.remix.trim() || styles[input.style];
  const composition = 'photos' in input
    ? 'Create ONE borderless image containing exactly THREE equal image panels stacked top to bottom. Each panel fills exactly one third of the total image height and the full image width, with boundaries precisely at 1/3 and 2/3. Image content must extend to every edge: no gutters, gaps, margins, paper frame, footer, date, text or decorations outside the photo scenes. The app will crop each panel to 4:3 and add its own frame, date and text, so keep faces and essential details inside the central 85% of each panel. Reference image 1 belongs only in the top panel, image 2 in the middle panel, and image 3 in the bottom panel. Preserve each reference photo’s distinct pose, expression, framing and people in its own panel. Do not merge the photos, collapse poses, omit a panel, or invent extra people.'
    : 'Transform the reference photo into a portrait, preserving its people, pose and expression.';
  return `${composition} Apply the following guest-requested visual style and scene consistently across every panel: ${JSON.stringify(direction)}. This is the sole creative direction; do not add an unrelated palette or preset style. Preserve recognizable facial features and skin tones while applying the requested transformation. If the references show illustrated characters, preserve those characters. Keep everyone comfortably in frame. No lettering, captions, logos or watermarks.`;
}

type Job = { id: string; fingerprint: string; status: string; provider_task_id: string | null; image: string | null };
async function sql<T extends Record<string, any> = Job>(query: string, values: unknown[] = []): Promise<T[]> {
  const rows = await db.query<T>(query, values);
  if (!rows) throw new PhotoError(503, 'ai_storage_unavailable', 'AI portraits are temporarily unavailable. Your original is still here.');
  return rows;
}
const key = () => process.env.API_MART_API_KEY || process.env.APIMART_API_KEY;
export const config = () => ({ available: !!key() });
function view(job: Job) { return { id: job.id, status: job.status, ...(job.image ? { image: job.image } : {}) }; }
export async function cleanup() {
  // Keep idempotency tombstones after removing the image, so delayed retries cannot bill again.
  await sql("update community_photo_ai set image=null, status='expired' where expires_at < now() and status <> 'expired'");
}
export async function start(input: z.infer<typeof startSchema>) {
  if (!key()) throw new PhotoError(503, 'ai_not_configured', 'AI portraits are not available yet. Please try the photobooth.');
  const references = 'photos' in input ? input.photos : [input.png];
  const fingerprint = createHash('sha256').update(JSON.stringify([input.style, input.remix])).update('photos' in input ? JSON.stringify(input.photos) : input.png).digest('hex');
  // Serialize reservations across processes to make the shared event spending limit durable.
  const [reserved] = await sql(`with lock as materialized (select pg_advisory_xact_lock(724810)), budget as (
    select count(*) filter (where created_at > now()-interval '1 hour') as hourly,
    count(*) filter (where created_at > now()-interval '1 minute') as minute from community_photo_ai, lock)
    insert into community_photo_ai (id,fingerprint,style) select $1,$2,$3 from budget where hourly < 60 and minute < 4
    on conflict (id) do nothing returning *`, [input.id, fingerprint, input.style]);
  if (!reserved) {
    const [existing] = await sql('select * from community_photo_ai where id=$1', [input.id]);
    if (!existing) throw new PhotoError(429, 'ai_limit', 'The portrait studio is busy. Please try again in a few minutes.');
    if (existing.fingerprint !== fingerprint) throw new PhotoError(409, 'ai_changed', 'Take a new photo to start another portrait.');
    return view(existing);
  }
  try {
    const response = await fetch('https://api.apimart.ai/v1/images/generations', {
      method: 'POST', signal: AbortSignal.timeout(22000), headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-2', n: 1, size: 'photos' in input ? '1:2' : '3:4', resolution: '1k', image_urls: references.map(png => 'data:image/png;base64,' + png),
        prompt: generationPrompt(input) }),
    });
    if (response.status >= 400 && response.status < 500) {
      await sql("update community_photo_ai set status='failed' where id=$1", [input.id]);
      return { id: input.id, status: 'failed' };
    }
    if (!response.ok) throw new Error('Unconfirmed provider response');
    const body = z.object({ data: z.array(z.object({ task_id: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/) })).min(1) }).parse(await response.json());
    await sql("update community_photo_ai set status='processing',provider_task_id=$2 where id=$1", [input.id, body.data[0].task_id]);
    return { id: input.id, status: 'processing' };
  } catch {
    // APIMart does not document idempotent submissions. Never resubmit after a timeout.
    await sql("update community_photo_ai set status='uncertain' where id=$1 and status='submitting'", [input.id]);
    return { id: input.id, status: 'uncertain' };
  }
}
export function safeImageUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !['upload.apimart.ai', 'getapib.org'].includes(url.hostname) || url.username || url.password || url.port)
    throw new Error('Unsupported image host');
  return url.href;
}
async function downloadImage(url: string) {
  const response = await fetch(safeImageUrl(url), { redirect: 'error', signal: AbortSignal.timeout(18000) });
  const limit = 12 * 1024 * 1024;
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit) throw new Error('Image unavailable');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length;
      if (length > limit) throw new Error('Image too large'); chunks.push(value); }
  } finally { await reader.cancel(); }
  const b = Buffer.concat(chunks);
  const mime = b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ? 'image/png' : b.subarray(0, 3).toString('hex') === 'ffd8ff' ? 'image/jpeg' : null;
  if (!mime) throw new Error('Unsupported image');
  return `data:${mime};base64,${b.toString('base64')}`;
}
const providerStatus = z.object({ data: z.object({ status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  result: z.object({ images: z.array(z.object({ url: z.array(z.string()).min(1) })).min(1) }).nullish() }) });
export async function status(id: string) {
  await cleanup();
  // A crash during submission cannot safely be retried without a provider task id.
  await sql("update community_photo_ai set status='uncertain' where id=$1 and status='submitting' and created_at < now()-interval '60 seconds'", [id]);
  const [row] = await sql('select * from community_photo_ai where id=$1', [id]);
  if (!row) throw new PhotoError(404, 'ai_not_found', 'This portrait session could not be found.');
  if (row.status !== 'processing' || !row.provider_task_id) return view(row);
  const [lease] = await sql("update community_photo_ai set poll_after=now()+interval '30 seconds' where id=$1 and poll_after <= now() and status='processing' returning *", [id]);
  if (!lease) return view(row);
  try {
    const response = await fetch('https://api.apimart.ai/v1/tasks/' + encodeURIComponent(row.provider_task_id), {
      headers: { Authorization: `Bearer ${key()}` }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new PhotoError(502, 'ai_status_unavailable', 'We could not check your portrait. Tap Check portrait status to reconnect.');
    const parsed = providerStatus.safeParse(await response.json());
    if (!parsed.success) throw new PhotoError(502, 'ai_status_unavailable', 'The portrait studio returned an unexpected update. Tap Check portrait status to try again.');
    const result = parsed.data.data;
    if (result.status === 'completed') {
      if (!result.result) throw new Error('Result not ready');
      let image: string;
      try { image = await downloadImage(result.result.images[0].url[0]); }
      catch { throw new PhotoError(502, 'ai_image_unavailable', 'Your portrait is ready, but we could not load the image. Tap Check portrait status to retrieve it; this does not create a new portrait.'); }
      const [saved] = await sql("update community_photo_ai set status='completed',image=$2 where id=$1 and expires_at > now() returning *", [id, image]);
      return saved ? view(saved) : { id, status: 'expired' };
    }
    if (['failed', 'cancelled'].includes(result.status)) {
      await sql("update community_photo_ai set status='failed' where id=$1", [id]);
      return { id, status: 'failed' };
    }
    return { ...view(row), phase: result.status };
  } finally { await sql("update community_photo_ai set poll_after=now()+interval '1 second' where id=$1", [id]); }
}
