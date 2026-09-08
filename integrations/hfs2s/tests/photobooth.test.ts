import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const mock = vi.hoisted(() => ({ query: vi.fn(), identify: vi.fn() }));
vi.mock('../lib/db.js', () => ({ query: mock.query }));
vi.mock('../services/email.js', () => ({ identify: mock.identify }));
vi.mock('../services/mailer.js', () => ({ fromAddress: () => 'HFS2S <hello@example.com>' }));
vi.mock('../services/photobooth.js', async (importOriginal) => ({ ...await importOriginal<typeof import('../services/photobooth.js')>(), WORKSPACE_ID: 'b462dd9a', OWNER_EMAIL: 'operator@example.com' }));
import router from '../routes/photobooth.js';
import { resend, sendSchema, validPng, send, acknowledge, PhotoError } from '../services/photobooth.js';
const uuid = '7f956677-bcab-4f13-a45f-33fcf1fe16d2';
function png() { const b = Buffer.alloc(45); Buffer.from('89504e470d0a1a0a','hex').copy(b); b.write('IHDR',12); b.writeUInt32BE(600,16); b.writeUInt32BE(1800,20); Buffer.from('0000000049454e44ae426082','hex').copy(b,33); return b.toString('base64'); }
const input = () => ({ id: uuid, channel: 'email' as const, recipient: 'guest@example.com', png: png(), consent: true as const });
beforeEach(() => { vi.stubEnv('PHOTOBOOTH_WORKSPACE_ID','b462dd9a'); vi.stubEnv('PHOTOBOOTH_OWNER_EMAIL','operator@example.com'); mock.query.mockReset(); mock.identify.mockReset(); vi.stubEnv('MAIL_API_KEY','test-private-key'); vi.stubEnv('MAIL_API_URL','https://api.resend.com/emails'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Community Photobooth delivery boundary', () => {
  it('requires consent and a correctly addressed, bounded PNG', () => {
    expect(sendSchema.safeParse(input()).success).toBe(true);
    expect(validPng(Buffer.from('not an image').toString('base64'))).toBe(false);
    expect(sendSchema.safeParse({...input(), consent: false}).success).toBe(false);
    expect(sendSchema.safeParse({...input(), recipient:'hello\r\nBcc: other@example.com'}).success).toBe(false);
    expect(sendSchema.safeParse({...input(), channel:'whatsapp', recipient:'+34612345678'}).success).toBe(true);
    expect(sendSchema.safeParse({...input(), channel:'whatsapp', recipient:'612345678'}).success).toBe(false);
    expect(sendSchema.safeParse({...input(), png:'a'.repeat(7000001)}).success).toBe(false);
  });
  it('allows only the selected app credential, not a session or another workspace', async () => {
    const app=express(); app.use(express.json()); app.use(router);
    expect((await request(app).post('/api/photobooth/send').send(input())).status).toBe(403);
    mock.identify.mockReturnValue({scope:'app', workspaceId:'other',owner:'operator@example.com'});
    expect((await request(app).post('/api/photobooth/send').set('Authorization','Bearer wrong-app').send(input())).status).toBe(403);
    mock.identify.mockReturnValue({scope:'app', workspaceId:'b462dd9a',owner:'operator@example.com'});
    const invalid=await request(app).post('/api/photobooth/send').set('Authorization','Bearer app-key').send({...input(),png:'bad'});
    expect(invalid.status).toBe(422); expect(mock.query).not.toHaveBeenCalled();
  });
  it('keeps provider failures and database secrets out of responses', async () => {
    mock.identify.mockReturnValue({scope:'app',workspaceId:'b462dd9a',owner:'operator@example.com'});
    mock.query.mockRejectedValue(new Error('postgres://private-secret'));
    const app=express();app.use(router);
    const result=await request(app).get('/api/photobooth/status/'+uuid).set('Authorization','Bearer app-key');
    expect(result.status).toBe(503);expect(result.text).not.toContain('private-secret');
  });
  it('attaches the PNG with fixed copy and a stable Resend idempotency key', async () => {
    const transport=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:'provider-id'})});vi.stubGlobal('fetch',transport);
    await resend(uuid,'guest@example.com',png());await resend(uuid,'guest@example.com',png());
    expect(transport.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    const options=transport.mock.calls[0][1],body=JSON.parse(options.body);
    expect(options.headers['Idempotency-Key']).toBe('community-photo/'+uuid);
    expect(options.headers['Idempotency-Key']).toBe(transport.mock.calls[1][1].headers['Idempotency-Key']);
    expect(body.from).toBe('Community Photobooth <hello@example.com>');expect(body.to).toEqual(['guest@example.com']);
    expect(body.attachments).toEqual([{filename:'community-photobooth.png',content:png(),content_type:'image/png'}]);
  });
  it('does not call an unexpected provider or accept an unconfirmed response', async () => {
    const transport=vi.fn().mockResolvedValue({ok:true,json:async()=>({error:'secret'})});vi.stubGlobal('fetch',transport);
    await expect(resend(uuid,'guest@example.com',png())).rejects.toBeInstanceOf(PhotoError);
    transport.mockClear();vi.stubEnv('MAIL_API_URL','https://unexpected.example/emails');
    await expect(resend(uuid,'guest@example.com',png())).rejects.toBeInstanceOf(PhotoError);expect(transport).not.toHaveBeenCalled();
  });
  it('rejects reused ids with changed contents and stale delivery acknowledgements', async () => {
    mock.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{fingerprint:'different'}]);
    await expect(send(input())).rejects.toMatchObject({code:'changed_delivery'});
    mock.query.mockResolvedValueOnce([]);
    await expect(acknowledge({id:uuid,leaseToken:'a'.repeat(64),sent:true})).rejects.toMatchObject({code:'stale_receipt'});
  });
});
