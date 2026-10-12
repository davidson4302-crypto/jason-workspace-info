#!/usr/bin/env node
// threejs-film tool. One command for every step; <dir> holds the film's index.html, outputs go to <dir>/out/.
//
//   node film.mjs new <dir> --title "Name" [--w 1080 --h 1080 --fps 60 --seconds 8 --no-loop]
//   node film.mjs doctor                         check node, playwright, chromium, ffmpeg, python libs, CDN reach
//   node film.mjs stills <dir> 0,60,120          out/stills/fNNN.png + fNNN.json (frameCheck: props, probes)
//   node film.mjs sheet <dir> name 0,6,12,...    render + tile those frames into out/sheet_<name>.png (--crop hero size)
//   node film.mjs check <dir> [--step 2]         props vs keep-out rects and frame edges over the whole film
//   node film.mjs audio <dir>                    out/score.wav + out/audio.json (stats, events)
//   node film.mjs stems <dir>                    loudness and true peak per audio group (raw, before mastering)
//   node film.mjs frames <dir> [--workers 3]     every frame to out/frames/ (+ frame N for the loop check)
//   node film.mjs encode <dir>                   out/<name>.mp4 (frames + score), preview if > 28 MB, contact.png
//
// The page is served from <dir> through a routed https origin, so the CDN importmap and Google Fonts load
// through the session proxy when one is set (HTTPS_PROXY). WebGL runs on SwiftShader in headless Chromium.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const VALUED = new Set(['title', 'w', 'h', 'fps', 'seconds', 'workers', 'step', 'crop', 'size', 'name']);
const pos = [];
for (let i = 1; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { if (VALUED.has(a.slice(2))) i++; continue; } pos.push(a); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary', '.wav': 'audio/wav' };

function loadChromium() {
  const req = createRequire(import.meta.url);
  const tries = ['playwright', path.join(process.cwd(), 'node_modules/playwright')];
  try { const g = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' }).stdout.trim(); if (g) tries.push(path.join(g, 'playwright')); } catch { /* none */ }
  for (const p of tries) { try { return req(p).chromium; } catch { /* next */ } }
  return null;
}
function sh(bin, args, opts = {}) { return spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts }); }
function ffmpeg(args) { const r = sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]); if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr); }
const pad = (f, n = 5) => String(f).padStart(n, '0');

async function launch(dir, n) {
  const chromium = loadChromium();
  if (!chromium) { console.error('playwright not found: npm i -D playwright (Chromium must be installed or preinstalled)'); process.exit(1); }
  const browser = await chromium.launch({
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--font-render-hinting=none', '--disable-lcd-text'],
  });
  const root = path.resolve(dir);
  const pages = await Promise.all(Array.from({ length: n }, async () => {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error('[page]', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
    await page.route('https://film.local/**', (route) => {
      const p = path.join(root, decodeURIComponent(new URL(route.request().url()).pathname));
      if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: '' });
      route.fulfill({ status: 200, contentType: MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(p) });
    });
    await page.goto('https://film.local/index.html?render=1');
    await page.waitForFunction(() => window.filmReady === true, null, { timeout: 180000 });
    const film = await page.evaluate(() => window.FILM);
    await page.setViewportSize({ width: film.W, height: film.H });
    return page;
  }));
  const film = await pages[0].evaluate(() => window.FILM);
  return { browser, pages, film };
}
async function shoot(page, film, f, file) {
  await page.evaluate((t) => window.renderAt(t), f / film.FPS);
  await page.locator('#film').screenshot({ path: file, type: 'png' });
}
async function runJobs(pages, jobs, fn) {
  let next = 0, done = 0; const t0 = Date.now();
  await Promise.all(pages.map(async (page) => {
    while (next < jobs.length) {
      const job = jobs[next++]; await fn(page, job);
      if (jobs.length > 30 && ++done % 20 === 0) process.stdout.write(`\r  ${done}/${jobs.length}  ${(done / ((Date.now() - t0) / 1000)).toFixed(2)} fps`);
    }
  }));
  if (jobs.length > 30) process.stdout.write('\n');
}
const dirArg = () => { const d = pos[0]; if (!d || !fs.existsSync(path.join(d, 'index.html'))) { console.error(`no index.html in ${d}`); process.exit(1); } return d; };
const outDir = (d, ...p) => { const o = path.join(d, 'out', ...p); fs.mkdirSync(o, { recursive: true }); return o; };
const frameList = (s) => s.split(',').filter(Boolean).map(Number);

if (cmd === 'new') {
  const dir = pos[0]; if (!dir) { console.error('usage: film.mjs new <dir> --title "Name"'); process.exit(1); }
  if (fs.existsSync(path.join(dir, 'index.html'))) { console.error(`${dir}/index.html exists; pick a new folder`); process.exit(1); }
  fs.mkdirSync(dir, { recursive: true });
  const t = fs.readFileSync(path.join(SKILL, 'assets/template.html'), 'utf8')
    .replaceAll('__TITLE__', (opt('title', path.basename(dir))).replace(/'/g, "\\'"))
    .replaceAll('__W__', opt('w', '1080')).replaceAll('__H__', opt('h', '1080')).replaceAll('__FPS__', opt('fps', '60'))
    .replaceAll('__SECONDS__', opt('seconds', '4')).replaceAll('__LOOP__', flag('no-loop') ? 'false' : 'true');
  fs.writeFileSync(path.join(dir, 'index.html'), t);
  fs.writeFileSync(path.join(dir, '.gitignore'), 'out/frames/\nout/stills/\nout/sheet_*/\n');
  console.log(`${dir}/index.html from the template (demo scene). Replace the SCENE sections with the beat sheet.`);
} else if (cmd === 'doctor') {
  const ok = (c, m) => console.log(`${c ? 'ok  ' : 'MISSING'} ${m}`);
  ok(Number(process.versions.node.split('.')[0]) >= 18, `node ${process.versions.node} (>= 18)`);
  ok(!!loadChromium(), 'playwright (npm i -D playwright; chromium preinstalled or npx playwright install chromium)');
  ok(sh('ffmpeg', ['-version']).status === 0, 'ffmpeg');
  ok(sh('ffprobe', ['-version']).status === 0, 'ffprobe');
  ok(sh('python3', ['-c', 'import numpy, PIL']).status === 0, 'python3 with numpy + Pillow');
  const cdn = sh('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js']).stdout;
  ok(cdn === '200', `jsDelivr reachable (${cdn || 'no curl'})`);
  console.log(`cores: ${(await import('node:os')).cpus().length}  (SwiftShader renders ~0.3-0.5 fps per film at 1080p; plan render time)`);
} else if (cmd === 'stills' || cmd === 'sheet') {
  const dir = dirArg(), list = frameList(cmd === 'sheet' ? pos[2] : pos[1]);
  const sdir = outDir(dir, 'stills');
  const { browser, pages, film } = await launch(dir, Math.min(3, list.length));
  await runJobs(pages, list, async (page, f) => {
    const base = path.join(sdir, `f${pad(f, 3)}`);
    await shoot(page, film, f, base + '.png');
    fs.writeFileSync(base + '.json', JSON.stringify(await page.evaluate((t) => window.frameCheck(t), f / film.FPS)));
  });
  await browser.close();
  if (cmd === 'sheet') {
    const name = pos[1], crop = opt('crop', null), size = opt('size', null);
    const r = sh('python3', [path.join(HERE, 'sheet.py'), sdir, path.join(dir, 'out', `sheet_${name}.png`), list.join(','), ...(crop ? ['--crop', crop] : []), ...(size ? ['--size', size] : [])], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(1);
  } else console.log(list.map((f) => path.join(sdir, `f${pad(f, 3)}.png`)).join('\n'));
} else if (cmd === 'check') {
  const dir = dirArg(), step = Number(opt('step', 2));
  const { browser, pages: [page], film } = await launch(dir, 1);
  const rep = await page.evaluate(({ n, fps, step }) => { const o = []; for (let f = 0; f < n; f += step) o.push(window.frameCheck(f / fps)); return o; }, { n: film.frames, fps: film.FPS, step });
  await browser.close();
  fs.writeFileSync(path.join(outDir(dir), 'check.json'), JSON.stringify(rep));
  const hits = {}, off = {}, padPx = 12;
  for (const r of rep) for (const [k, b] of Object.entries(r.props)) {
    if (!b) continue;
    for (const ko of r.keepOut) if (b.x1 > ko.x0 - padPx && b.x0 < ko.x1 + padPx && b.y1 > ko.y0 - padPx && b.y0 < ko.y1 + padPx) (hits[`${k} x ${ko.name}`] ||= []).push(r.f);
    if (b.x0 < 0 || b.y0 < 0 || b.x1 > film.W || b.y1 > film.H) (off[k] ||= []).push(r.f);
  }
  const span = (v) => `${v.length} sampled frames (${v[0]}..${v[v.length - 1]})`;
  console.log('keep-out overlaps:', Object.keys(hits).length ? '\n  ' + Object.entries(hits).map(([k, v]) => `${k}: ${span(v)}`).join('\n  ') : 'none');
  console.log('props partly off-frame:', Object.keys(off).length ? '\n  ' + Object.entries(off).map(([k, v]) => `${k}: ${span(v)}`).join('\n  ') : 'none');
} else if (cmd === 'audio' || cmd === 'stems') {
  const dir = dirArg(), o = outDir(dir);
  const { browser, pages: [page] } = await launch(dir, 1);
  if (cmd === 'stems') {
    const groups = await page.evaluate(() => window.AUDIO_GROUPS || []);
    for (const g of groups) { const r = await page.evaluate(async (g) => window.renderAudio({ solo: [g] }), g); console.log(g.padEnd(10), JSON.stringify(r.stats)); }
    const all = await page.evaluate(async () => window.renderAudio({ raw: true }));
    console.log('all'.padEnd(10), JSON.stringify(all.stats));
  } else {
    const res = await page.evaluate(async () => window.renderAudio());
    fs.writeFileSync(path.join(o, 'score.wav'), Buffer.from(res.wav, 'base64'));
    fs.writeFileSync(path.join(o, 'audio.json'), JSON.stringify({ stats: res.stats, events: res.events }, null, 1));
    console.log(JSON.stringify(res.stats));
    const s = sh('python3', [path.join(HERE, 'sync.py'), path.join(o, 'score.wav'), path.join(o, 'audio.json')]); process.stdout.write(s.stdout + s.stderr);
  }
  await browser.close();
} else if (cmd === 'frames') {
  const dir = dirArg(), workers = Number(opt('workers', 3));
  const fdir = path.join(dir, 'out', 'frames'); fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir, { recursive: true });
  const { browser, pages, film } = await launch(dir, workers);
  const jobs = Array.from({ length: film.frames + (film.LOOP ? 1 : 0) }, (_, i) => i);
  console.log(`rendering ${jobs.length} frames ${film.W}x${film.H} @ ${film.FPS} fps, ${workers} workers`);
  await runJobs(pages, jobs, (page, f) => shoot(page, film, f, path.join(fdir, `${pad(f)}.png`)));
  await browser.close();
} else if (cmd === 'encode') {
  const dir = dirArg(), o = path.join(dir, 'out');
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const fps = Number(/FPS:\s*(\d+)/.exec(html)[1]), secs = Number(/SECONDS:\s*([\d.]+)/.exec(html)[1]), n = Math.round(fps * secs);
  const name = opt('name', path.basename(path.resolve(dir)));
  const hasAudio = fs.existsSync(path.join(o, 'score.wav'));
  const enc = (crf, file, abr) => ffmpeg(['-framerate', String(fps), '-i', path.join(o, 'frames', '%05d.png'), ...(hasAudio ? ['-i', path.join(o, 'score.wav')] : []),
    '-frames:v', String(n), '-map', '0:v', ...(hasAudio ? ['-map', '1:a'] : []),
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', abr, '-ar', '48000'] : []), '-t', String(secs), '-movflags', '+faststart', file]);
  const master = path.join(o, `${name}.mp4`); enc(14, master, '320k');
  console.log(`-> ${master} (${(fs.statSync(master).size / 1048576).toFixed(1)} MB)`);
  if (fs.statSync(master).size > 28 * 1048576) { const pv = path.join(o, `${name}-preview.mp4`); enc(17, pv, '256k'); console.log(`-> ${pv} (${(fs.statSync(pv).size / 1048576).toFixed(1)} MB, for chat delivery)`); }
  const every = Math.max(1, Math.round(n / 20));
  ffmpeg(['-i', master, '-vf', `select='not(mod(n\\,${every}))',scale=270:-2,tile=5x4`, '-frames:v', '1', path.join(o, 'contact.png')]);
  console.log(`-> ${path.join(o, 'contact.png')} (every ${every} frames)`);
  const v = sh('python3', [path.join(HERE, 'verify.py'), dir, master]); process.stdout.write(v.stdout + v.stderr);
} else {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).join('\n'));
}
