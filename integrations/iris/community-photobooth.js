import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { OUTBOX_DIR } from './config.js';
import { slug } from './jid.js';
const API = 'https://hfs2s.app/api/photobooth';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function photoAction(message, directory = OUTBOX_DIR) {
  if (!message || !uuid.test(message.id) || !/^[a-f0-9]{64}$/.test(message.lease_token)
    || !/^\+[1-9]\d{7,14}$/.test(message.recipient) || typeof message.png !== 'string' || message.png.length > 7000000
    || !Number.isFinite(Date.parse(message.expires_at)) || Date.parse(message.expires_at) < Date.now()) throw new Error('Invalid photo delivery');
  const bytes = Buffer.from(message.png, 'base64');
  if (bytes.length < 45 || bytes.length > 5*1024*1024 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid photo');
  const chat = `${message.recipient.slice(1)}@s.whatsapp.net`;
  return { id: `photobooth-${message.id}-${crypto.randomUUID().slice(0,8)}`, externalId: message.id,
    source: 'community-photobooth', chat, slug: slug(chat), kind: 'image', path: path.join(directory, `photobooth-${message.id}.png`),
    caption: 'Good people. Great memories. Your Community Photobooth keepsake ✳', queuedAt: Date.now(), expiresAt: Date.parse(message.expires_at) };
}
async function request(route, body = {}) {
  const key = fs.readFileSync(path.join(os.homedir(), '.config/iris/community-photobooth.key'), 'utf8').trim();
  const response = await fetch(API + route, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Photo bridge request failed');
  return response.json();
}
export async function deliver(message, directory = OUTBOX_DIR, acknowledge = body => request('/delivery', body), wait = sleep) {
  const action = photoAction(message, directory), receipt = path.join(directory, `photobooth-${message.id}.sent`);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  let sent = fs.existsSync(receipt);
  if (!sent) {
    const existing = fs.readdirSync(directory).find(name => name.startsWith(`photobooth-${message.id}-`) && name.endsWith('.json'));
    const file = path.join(directory, existing || `${action.id}.json`);
    if (!existing) {
      fs.writeFileSync(action.path, Buffer.from(message.png, 'base64'), { mode: 0o600 });
      // Retries must not extend the original photo's two-hour retention window.
      const created = new Date(Date.parse(message.expires_at) - 7200000);
      fs.utimesSync(action.path, created, created);
      fs.writeFileSync(file + '.tmp', JSON.stringify(action), { mode: 0o600 }); fs.renameSync(file + '.tmp', file);
    }
    const deadline = Date.now() + 75000;
    while (Date.now() < deadline) {
      sent = fs.existsSync(receipt);
      if (sent || fs.existsSync(file.replace(/\.json$/, '.failed'))) break;
      await wait(250);
    }
  }
  await acknowledge({ id: message.id, leaseToken: message.lease_token, sent });
  if (sent) fs.rmSync(action.path, { force: true });
  return sent;
}
export function cleanup(directory = OUTBOX_DIR) {
  if (!fs.existsSync(directory)) return;
  for (const name of fs.readdirSync(directory)) {
    // Only this worker's explicitly named transport files, never another Iris job.
    if (!/^photobooth-[a-f0-9-]+\.(png|json|failed|tmp|sent)$/.test(name)) continue;
    const file = path.join(directory, name), age = Date.now() - fs.statSync(file).mtimeMs;
    if (age > (name.endsWith('.sent') ? 86400000 : 7200000)) fs.rmSync(file, { force: true });
  }
}
async function main() {
  console.log('Community Photobooth bridge started.');
  for (;;) {
    try { cleanup(); const batch = await request('/outbox');
      if (!Array.isArray(batch.messages) || batch.messages.length > 3) throw new Error('Invalid batch');
      await Promise.all(batch.messages.map(message => deliver(message)));
    } catch { console.error('Community Photobooth bridge is retrying its connection.'); }
    await sleep(5000);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
