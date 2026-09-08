import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const mock = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../lib/db.js', () => ({ query: mock.query }));
vi.mock('../services/mailer.js', () => ({ fromAddress: () => 'test@example.com' }));
import { startSchema, start, status, safeImageUrl, generationPrompt } from '../services/photoboothAi.js';
const id = '7f956677-bcab-4f13-a45f-33fcf1fe16d2';
function source() { const b=Buffer.alloc(45); Buffer.from('89504e470d0a1a0a','hex').copy(b);b.write('IHDR',12);b.writeUInt32BE(1280,16);b.writeUInt32BE(960,20);Buffer.from('0000000049454e44ae426082','hex').copy(b,33);return b.toString('base64'); }
const input = () => startSchema.parse({id,style:'clay',png:source(),consent:true,remix:'On the moon'});
beforeEach(() => {mock.query.mockReset();vi.stubEnv('API_MART_API_KEY','private-test-key');vi.stubEnv('APIMART_API_KEY','');});
afterEach(() => {vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('accepts a single camera PNG and bounded remix direction only with explicit consent',()=>{
 expect(input().remix).toBe('On the moon');
 for(const changes of [{png:'bad'},{consent:false},{remix:'x'.repeat(501)},{style:'unknown'}]) expect(startSchema.safeParse({...input(),...changes}).success).toBe(false);
});
it('refuses generation before any external call if its server key is absent',async()=>{
 vi.stubEnv('API_MART_API_KEY','');const transport=vi.fn();vi.stubGlobal('fetch',transport);
 await expect(start(input())).rejects.toMatchObject({code:'ai_not_configured'});expect(transport).not.toHaveBeenCalled();expect(mock.query).not.toHaveBeenCalled();
});
it('submits one reference image, the selected preset, and reviewed remix text',async()=>{
 mock.query.mockResolvedValueOnce([{id}]).mockResolvedValue([]);
 const transport=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({data:[{task_id:'task_123'}]})});vi.stubGlobal('fetch',transport);
 expect(await start(input())).toEqual({id,status:'processing'});
 const [url,options]=transport.mock.calls[0], body=JSON.parse(options.body);
 expect(url).toBe('https://api.apimart.ai/v1/images/generations');expect(body.image_urls).toEqual(['data:image/png;base64,'+source()]);expect(body.n).toBe(1);expect(body.size).toBe('3:4');expect(body.resolution).toBe('1k');expect(body.prompt).toContain('On the moon');expect(body.prompt).not.toContain('clay animation');
});
it('never resubmits a timed-out or duplicate generation',async()=>{
 const fingerprint=createHash('sha256').update(JSON.stringify(['clay','On the moon'])).update(source()).digest('hex');
 mock.query.mockResolvedValueOnce([{id}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{id,fingerprint,status:'uncertain'}]);
 const transport=vi.fn().mockRejectedValue(new Error('network private secret'));vi.stubGlobal('fetch',transport);
 expect(await start(input())).toEqual({id,status:'uncertain'});expect(await start(input())).toEqual({id,status:'uncertain'});expect(transport).toHaveBeenCalledTimes(1);
});
it('rejects changed duplicate ids and a full event budget without submitting',async()=>{
 mock.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{id,fingerprint:'different'}]);const transport=vi.fn();vi.stubGlobal('fetch',transport);
 await expect(start(input())).rejects.toMatchObject({code:'ai_changed'});
 mock.query.mockResolvedValue([]);await expect(start(input())).rejects.toMatchObject({code:'ai_limit'});expect(transport).not.toHaveBeenCalled();
});
it('only downloads from the documented image host',()=>{
 expect(safeImageUrl('https://getapib.org/result.png')).toBe('https://getapib.org/result.png');
 expect(safeImageUrl('https://upload.apimart.ai/f/image/a.png')).toBe('https://upload.apimart.ai/f/image/a.png');
 for(const url of ['http://upload.apimart.ai/a','https://upload.apimart.ai.attacker.com/a','https://user:pass@upload.apimart.ai/a','https://127.0.0.1/a','https://upload.apimart.ai:123/a'])expect(()=>safeImageUrl(url)).toThrow();
});
it('returns a finished portrait from storage without calling the provider',async()=>{
 mock.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{id,status:'completed',image:'data:image/png;base64,example'}]);const transport=vi.fn();vi.stubGlobal('fetch',transport);
 expect(await status(id)).toEqual({id,status:'completed',image:'data:image/png;base64,example'});expect(transport).not.toHaveBeenCalled();
});

it('retrieves a completed image from the actual APIMart delivery host',async()=>{
 const row={id,status:'processing',provider_task_id:'task_123'};
 mock.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([row]).mockResolvedValueOnce([row]).mockResolvedValueOnce([{id,status:'completed',image:'data:image/png;base64,'+source()}]).mockResolvedValue([]);
 const transport=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({data:{status:'completed',result:{images:[{url:['https://getapib.org/result.png']}]}}}),{status:200})).mockResolvedValueOnce(new Response(Buffer.from(source(),'base64'),{status:200}));vi.stubGlobal('fetch',transport);
 expect(await status(id)).toEqual({id,status:'completed',image:'data:image/png;base64,'+source()});expect(transport.mock.calls[1][0]).toBe('https://getapib.org/result.png');expect(transport.mock.calls[1][1].redirect).toBe('error');
});
it('reports a completed-but-unloadable image as a recoverable error without resubmitting',async()=>{
 const row={id,status:'processing',provider_task_id:'task_123'};
 mock.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([row]).mockResolvedValueOnce([row]).mockResolvedValue([]);
 const transport=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({data:{status:'completed',result:{images:[{url:['https://unexpected.example/result.png']}]}}}),{status:200}));vi.stubGlobal('fetch',transport);
 await expect(status(id)).rejects.toMatchObject({status:502,code:'ai_image_unavailable'});expect(transport).toHaveBeenCalledTimes(1);
});

it('accepts the smaller single-photo reference but rejects arbitrary dimensions',()=>{
 const bytes=Buffer.from(source(),'base64');bytes.writeUInt32BE(1024,16);bytes.writeUInt32BE(768,20);
 expect(startSchema.safeParse({...input(),png:bytes.toString('base64')}).success).toBe(true);
 bytes.writeUInt32BE(9999,16);expect(startSchema.safeParse({...input(),png:bytes.toString('base64')}).success).toBe(false);
});

it('sends all three references in capture order and lets the guest description replace the preset',async()=>{
 const first=source();const bytes=Buffer.from(first,'base64');bytes[30]=1;const second=bytes.toString('base64');bytes[30]=2;const third=bytes.toString('base64');
 const input=startSchema.parse({id,style:'clay',photos:[first,second,third],remix:'Black and white manga with bold action lines',consent:true});
 mock.query.mockResolvedValueOnce([{id}]).mockResolvedValue([]);
 const transport=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({data:[{task_id:'task_three'}]})});vi.stubGlobal('fetch',transport);
 await start(input);const body=JSON.parse(transport.mock.calls[0][1].body);
 expect(body.image_urls).toEqual([first,second,third].map(png=>'data:image/png;base64,'+png));expect(body.n).toBe(1);expect(body.size).toBe('1:2');
 expect(body.prompt).toContain('exactly THREE');expect(body.prompt).toContain('boundaries precisely at 1/3 and 2/3');expect(body.prompt).toContain('no gutters, gaps, margins, paper frame, footer, date, text');expect(body.prompt).toContain('image 2 in the middle');expect(body.prompt).toContain('Black and white manga');expect(body.prompt).not.toContain('clay animation');expect(body.prompt).not.toContain('terracotta');
});
it('requires exactly three bounded references and uses the preset only when no description is supplied',()=>{
 const input={id,style:'clay',photos:[source(),source(),source()],remix:'',consent:true};
 expect(generationPrompt(startSchema.parse(input))).toContain('clay animation');
 for(const photos of [[],[source()],[source(),source()],[source(),source(),source(),source()],['bad',source(),source()]])expect(startSchema.safeParse({...input,photos}).success).toBe(false);
 expect(startSchema.safeParse({...input,png:source()}).success).toBe(false);
});
