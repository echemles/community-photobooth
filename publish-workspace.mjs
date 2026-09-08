// Publish only to an already-created, explicitly selected hfs2s workspace.
// The control plane owns workspace creation, permissions and registry writes.
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const id = process.argv[2];
const sshHost = process.env.HFS2S_SSH_HOST || 'hfs2s';
if (!/^[a-f0-9]{8}$/.test(id || '')) throw new Error('Pass the confirmed workspace ID.');
const stage = await mkdtemp(join(tmpdir(), 'community-photobooth-'));
async function put(path, contents) {
  await mkdir(join(stage, path, '..'), { recursive: true });
  await writeFile(join(stage, path), contents);
}
const scriptVersion = createHash('sha256').update(await readFile(new URL('./app.js', import.meta.url))).digest('hex').slice(0,12);
const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
await put('modules/photobooth/template.html', html.split('<body>')[1].split('</body>')[0]);
for (const name of ['style.css', 'tablet.css', 'brand.css', 'ipad.css']) await put(`modules/photobooth/${name}`, await readFile(new URL(name, import.meta.url)));
await put('modules/photobooth/styles.css', (await Promise.all(['style.css','tablet.css','brand.css','ipad.css'].map(name => readFile(new URL(name, import.meta.url), 'utf8')))).join('\n'));
await put('public/photobooth/app.js', (await readFile(new URL('./vendor/libphonenumber-min.js', import.meta.url), 'utf8')) + '\n;\n' + (await readFile(new URL('./app.js', import.meta.url), 'utf8')));
await put('public/photobooth/phone-library-LICENSE.txt', await readFile(new URL('./vendor/libphonenumber-LICENSE', import.meta.url)));
for (const name of ['illustrated','clay','retro']) await put('public/photobooth/' + name + '.png', await readFile(new URL('./assets/' + name + '.png', import.meta.url)));
await put('app/page.tsx', `import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Script from 'next/script';
const basePath = process.env.HFS2S_BASE_PATH || '';
export default function Photobooth() {
  const template = readFileSync(join(process.cwd(), 'modules/photobooth/template.html'), 'utf8')
    .replaceAll('href="./"', 'href="' + basePath + '/"');
  return <><div dangerouslySetInnerHTML={{ __html: template }} />
    <Script src={basePath + '/photobooth/app.js?v=${scriptVersion}'} id="photobooth-client" strategy="afterInteractive" />
  </>;
}
`);
await put('modules/photobooth/module.ts', await readFile(new URL('./integrations/hfs2s/workspace-module.ts', import.meta.url)));
await put('hfs2s.config.ts', `export const config = {
  name: 'Community Photobooth',
  tagline: 'Strike a pose, make a photo strip, and keep a little moment from your community.',
  modules: ['health', 'photobooth'] as string[],
};
`);
await put('app/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#faf9f5"/><g stroke="#d97757" stroke-width="4" stroke-linecap="square"><path d="M32 10v44M10 32h44M17 17l30 30M17 47l30-30M23 12l18 40M12 23l40 18M12 41l40-18M23 52l18-40"/></g></svg>`);
await put('app/og/route.tsx', `import { ImageResponse } from 'next/og';
export const runtime = 'edge';
export async function GET() {
  return new ImageResponse(<div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',background:'#faf9f5',padding:'70px',color:'#141413'}}>
    <div style={{display:'flex',fontSize:38,color:'#b65336'}}>✳ Community Photobooth</div>
    <div style={{display:'flex',fontSize:88,marginTop:75,letterSpacing:-4}}>Good people.</div>
    <div style={{display:'flex',fontSize:88,color:'#b65336',letterSpacing:-4}}>Great memories.</div>
    <div style={{display:'flex',fontSize:25,marginTop:35,color:'#746b5e'}}>Three photos. One keepsake. All you.</div>
  </div>, {width:1200,height:630});
}
`);
// Apply a small integration patch to the fresh scaffold without replacing its registry or layout.
await put('integrate.mjs', `import { readFile, writeFile } from 'node:fs/promises';
const root = '/home/node/app/';
let layout = await readFile(root + 'app/layout.tsx', 'utf8');
const css = ["import '../modules/photobooth/style.css';", "import '../modules/photobooth/tablet.css';", "import '../modules/photobooth/brand.css';"];
for (const line of css) layout = layout.replaceAll(line + '\\n', '');
if (!layout.includes("import '../modules/photobooth/styles.css';")) layout = "import '../modules/photobooth/styles.css';\\n" + layout;
if (!layout.includes('export const viewport')) layout += "\\nexport const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#faf9f5' };\\n";
await writeFile(root + 'app/layout.tsx', layout);
let registry = await readFile(root + 'modules/_registry.ts', 'utf8');
if (!registry.includes("from './photobooth/module'")) registry = "import { photobooth } from './photobooth/module';\\n" + registry.replace('= [health]', '= [health, photobooth]');
if (!registry.includes('request: Request;')) registry = registry.replace('export type HandlerArgs = {', 'export type HandlerArgs = {\\n  request: Request;');
await writeFile(root + 'modules/_registry.ts', registry);
let api = await readFile(root + 'app/api/[[...path]]/route.ts', 'utf8');
if (!api.includes('request: req,')) api = api.replace('segments: match.segments,', 'request: req,\\n      segments: match.segments,');
if (!api.includes('result instanceof Response')) api = api.replace('return NextResponse.json(result', 'if (result instanceof Response) return result;\\n    return NextResponse.json(result');
await writeFile(root + 'app/api/[[...path]]/route.ts', api);
let config = await readFile(root + 'next.config.mjs', 'utf8');
if (!config.includes('devIndicators: false')) throw new Error('Workspace must disable Next dev indicators');
if (!config.includes('distDir:')) config = config.replace('export default {', "export default {\\n  distDir: process.env.NODE_ENV === 'production' ? '.next-production' : '.next',");
if (!config.includes('Permissions-Policy')) config = config.replace('export default {', "export default {\\n  async headers() { return [{ source: '/:path*', headers: [{ key: 'Permissions-Policy', value: 'camera=(self), microphone=()' }, { key: 'X-Content-Type-Options', value: 'nosniff' }] }]; },");
config = config.replaceAll('microphone=()', 'microphone=(self)');
await writeFile(root + 'next.config.mjs', config);
`);
function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${cmd} failed (${result.status})`);
}
const remoteStage = `/tmp/community-photobooth-${id}`;
run('ssh', [sshHost, `mkdir -p ${remoteStage}`]);
run('scp', ['-q', '-r', `${stage}/.`, `${sshHost}:${remoteStage}/`]);
run('ssh', [sshHost, `docker cp ${remoteStage}/. hfs2s-ws-${id}:/home/node/app/ && docker exec hfs2s-ws-${id} node integrate.mjs && docker exec -u root hfs2s-ws-${id} chown -R node:node /home/node/app/modules/photobooth /home/node/app/public/photobooth /home/node/app/app/page.tsx /home/node/app/app/og/route.tsx /home/node/app/hfs2s.config.ts /home/node/app/integrate.mjs`]);
console.log(`Source published to workspace ${id}. Install its existing dependencies, build, and start it before sharing.`);
