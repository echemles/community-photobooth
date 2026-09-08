import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import * as db from '../lib/db.js';
import { fromAddress } from './mailer.js';

export const WORKSPACE_ID = process.env.PHOTOBOOTH_WORKSPACE_ID || '';
export const OWNER_EMAIL = process.env.PHOTOBOOTH_OWNER_EMAIL || '';
export class PhotoError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function validPng(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const b = Buffer.from(value, 'base64');
  return b.length >= 45 && b.length <= 5 * 1024 * 1024 && b.toString('base64') === value
    && b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    && b.toString('ascii', 12, 16) === 'IHDR' && [600, 1200].includes(b.readUInt32BE(16))
    && b.readUInt32BE(20) === 1800 && b.toString('hex', b.length - 12) === '0000000049454e44ae426082';
}
export const sendSchema = z.object({
  id: z.string().uuid(), channel: z.enum(['email', 'whatsapp']),
  recipient: z.string().trim().max(254),
  png: z.string().max(7_000_000).refine(validPng, 'Choose a valid photobooth PNG under 5 MB.'),
  consent: z.literal(true),
}).strict().superRefine((v, ctx) => {
  if (v.channel === 'email' ? !z.string().email().safeParse(v.recipient).success : !/^\+[1-9]\d{7,14}$/.test(v.recipient))
    ctx.addIssue({ code: 'custom', path: ['recipient'], message: 'Enter an email or international WhatsApp number.' });
});
type Input = z.infer<typeof sendSchema>;
type Job = { id: string; channel: 'email' | 'whatsapp'; recipient: string | null; png: string | null; fingerprint: string; status: string; lease_token: string | null; expires_at: string };
async function sql<T extends Record<string, any> = Record<string, any>>(text: string, args: unknown[] = []): Promise<T[]> {
  const rows = await db.query<T>(text, args);
  if (!rows) throw new PhotoError(503, 'storage_unavailable', 'Sending is temporarily unavailable. Your photo is still here.');
  return rows;
}
export async function cleanup() {
  await sql("update community_photo_deliveries set png = null, recipient = null, status = case when status in ('queued','sending') then 'expired' else status end where expires_at < now() and (png is not null or recipient is not null)");
  await sql("delete from community_photo_deliveries where created_at < now() - interval '24 hours'");
}
// Ephemeral abuse throttles; deliveries and retries themselves are durable in Postgres.
const rates = new Map<string, { count: number; until: number }>();
function rate(recipient: string) {
  const now = Date.now();
  for (const [key, bucket] of rates) if (bucket.until < now) rates.delete(key);
  const key = createHash('sha256').update(recipient.toLowerCase()).digest('hex');
  for (const [name, max] of [['all', 120], [key, 3]] as const) {
    const bucket = rates.get(name) ?? { count: 0, until: now + 3600000 };
    if (bucket.count >= max) throw new PhotoError(429, 'send_limit', 'Please wait before sending more keepsakes. You can still print your photo.');
    bucket.count++; rates.set(name, bucket);
  }
}
export async function status(id: string) {
  const [row] = await sql<Job>('select id, channel, status from community_photo_deliveries where id = $1', [id]);
  if (!row) throw new PhotoError(404, 'not_found', 'This delivery could not be found.');
  return { id: row.id, channel: row.channel, status: row.status };
}
export async function send(input: Input) {
  await cleanup();
  const fingerprint = createHash('sha256').update(JSON.stringify([input.channel, input.recipient, input.png])).digest('hex');
  const [existing] = await sql<Job>('select id, fingerprint, status from community_photo_deliveries where id = $1', [input.id]);
  if (existing && existing.fingerprint !== fingerprint) throw new PhotoError(409, 'changed_delivery', 'Start a new delivery for the changed photo or recipient.');
  if (existing && ['accepted', 'sent', 'expired', 'failed'].includes(existing.status)) return status(input.id);
  if (!existing) {
    rate(input.recipient);
    await sql(`insert into community_photo_deliveries (id, channel, recipient, png, fingerprint)
      values ($1,$2,$3,$4,$5) on conflict (id) do nothing`, [input.id, input.channel, input.recipient, input.png, fingerprint]);
    const [saved] = await sql<Job>('select fingerprint from community_photo_deliveries where id = $1', [input.id]);
    if (saved?.fingerprint !== fingerprint) throw new PhotoError(409, 'changed_delivery', 'Start a new delivery.');
  }
  if (input.channel === 'whatsapp') return status(input.id);
  const [job] = await sql<Job>(`update community_photo_deliveries set status='sending', lease_until=now()+interval '60 seconds'
    where id=$1 and (status='queued' or (status='sending' and lease_until < now())) and expires_at > now() returning *`, [input.id]);
  if (!job) return status(input.id);
  try {
    await resend(input.id, input.recipient, input.png);
    await sql("update community_photo_deliveries set status='accepted', png=null, recipient=null, lease_until=null where id=$1", [input.id]);
  } catch {
    // Retry the same provider key, including after an uncertain network response.
    await sql("update community_photo_deliveries set status='queued', lease_until=null where id=$1", [input.id]);
    throw new PhotoError(502, 'email_unavailable', 'Email could not be confirmed. Try Send again to safely retry.');
  }
  return status(input.id);
}
export async function resend(id: string, recipient: string, png: string) {
  if (process.env.MAIL_API_URL !== 'https://api.resend.com/emails' || !process.env.MAIL_API_KEY)
    throw new PhotoError(503, 'email_unavailable', 'Email is temporarily unavailable.');
  const address = fromAddress().match(/<([^>]+)>/)?.[1] ?? fromAddress();
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${process.env.MAIL_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `community-photo/${id}` },
    body: JSON.stringify({ from: `Community Photobooth <${address}>`, to: [recipient], subject: 'Your Community Photobooth keepsake',
      text: 'Good people. Great memories.\n\nYour photo is attached, ready to save or print.\n\nSent at your request from Community Photobooth.',
      attachments: [{ filename: 'community-photobooth.png', content: png, content_type: 'image/png' }] }) });
  if (!response.ok || !z.object({ id: z.string().min(1) }).safeParse(await response.json()).success)
    throw new PhotoError(502, 'email_unavailable', 'Email could not be confirmed.');
}
export async function outbox() {
  await cleanup();
  const token = randomBytes(32).toString('hex');
  const messages = await sql<Job>(`with jobs as (
    select id from community_photo_deliveries where channel='whatsapp' and expires_at > now()
    and (status='queued' or (status='sending' and lease_until < now())) and attempts < 5
    order by created_at for update skip locked limit 3)
    update community_photo_deliveries d set status='sending', lease_until=now()+interval '2 minutes', lease_token=$1, attempts=attempts+1
    from jobs where d.id=jobs.id returning d.id,d.recipient,d.png,d.lease_token,d.expires_at`, [token]);
  await sql("update community_photo_deliveries set status='failed',png=null,recipient=null where channel='whatsapp' and attempts >= 5 and lease_until < now() and status='sending'");
  return { messages };
}
export const receiptSchema = z.object({ id: z.string().uuid(), leaseToken: z.string().regex(/^[a-f0-9]{64}$/), sent: z.boolean() }).strict();
export async function acknowledge(input: z.infer<typeof receiptSchema>) {
  const rows = await sql(`update community_photo_deliveries set status=case when $3 then 'sent' when attempts >= 5 then 'failed' else 'queued' end,
    png=case when $3 or attempts >= 5 then null else png end, recipient=case when $3 or attempts >= 5 then null else recipient end,
    lease_until=null,lease_token=null where id=$1 and lease_token=$2 and channel='whatsapp' and status='sending' returning id`, [input.id, input.leaseToken, input.sent]);
  if (!rows.length) throw new PhotoError(409, 'stale_receipt', 'The delivery lease has changed.');
  return { ok: true };
}
