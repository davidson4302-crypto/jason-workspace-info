// Frame-exact renderer for index.html (window.renderAt(t) paints frame t).
//
//   node tools/render.mjs --stills 0,62,105,330,357,384     -> out/stills/fNNN.png
//   node tools/render.mjs --check                           -> prop/label overlap + feet report (all 480 frames)
//   node tools/render.mjs --frames [--workers 3]            -> out/frames/00000.png ... 00479.png (+ 00480 for the loop check)
//   node tools/render.mjs --audio                           -> out/score.wav (+ stats)
//   node tools/render.mjs --encode                          -> out/principles-loop.mp4 (frames + score.wav)
//
// The page is served from this folder through a routed origin; three.js and Geist Mono load from their CDNs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'out');
const require = createRequire(import.meta.url);
let chromium;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try { chromium = require(p).chromium; break; } catch { /* next */ }
}
if (!chromium) { console.error('playwright not found'); process.exit(1); }

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const FPS = 60, FRAMES = 480;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };

async function launch(n) {
  const browser = await chromium.launch({
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--font-render-hinting=none', '--disable-lcd-text'],
  });
  const pages = await Promise.all(Array.from({ length: n }, async () => {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error('[page]', e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('[console]', m.text()); });
    await page.route('https://film.local/**', (route) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
      if (!p.startsWith(ROOT) || !fs.existsSync(p)) return route.fulfill({ status: 404, body: '' });
      route.fulfill({ status: 200, contentType: MIME[path.extname(p)] || 'application/octet-stream', body: fs.readFileSync(p) });
    });
    await page.goto('https://film.local/index.html?render=1');
    await page.waitForFunction(() => window.filmReady === true, null, { timeout: 120000 });
    return page;
  }));
  return { browser, pages };
}

async function shoot(page, f, file) {
  await page.evaluate((t) => window.renderAt(t), f / FPS);
  await page.locator('#film').screenshot({ path: file, type: 'png' });
}

function ffmpeg(argv) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + argv.join(' '));
}

fs.mkdirSync(OUT, { recursive: true });

if (opt('stills', null)) {
  const list = opt('stills').split(',').map(Number);
  const dir = path.join(OUT, 'stills'); fs.mkdirSync(dir, { recursive: true });
  const { browser, pages } = await launch(Math.min(3, list.length));
  let next = 0;
  await Promise.all(pages.map(async (page) => {
    while (next < list.length) {
      const f = list[next++];
      const t0 = Date.now();
      await shoot(page, f, path.join(dir, `f${String(f).padStart(3, '0')}.png`));
      fs.writeFileSync(path.join(dir, `f${String(f).padStart(3, '0')}.json`), JSON.stringify(await page.evaluate((t) => window.frameCheck(t), f / FPS)));
      console.log(`f${f} ${(Date.now() - t0)} ms`);
    }
  }));
  await browser.close();
} else if (flag('check')) {
  const { browser, pages: [page] } = await launch(1);
  const rep = await page.evaluate(() => {
    const out = [];
    for (let f = 0; f < 480; f += 1) out.push(window.frameCheck(f / 60));
    return out;
  });
  await browser.close();
  const L = rep[0].label, pad = 14;
  const hit = (r) => r.x1 > L.x0 - pad && r.x0 < L.x1 + pad && r.y1 > L.y0 - pad && r.y0 < L.y1 + pad;
  const issues = {};
  for (const r of rep) {
    for (const [k, b] of Object.entries(r.props)) if (hit(b)) (issues[k] ||= []).push(r.f);
    const offscreen = Object.entries(r.props).filter(([, b]) => b.x0 < 0 || b.x1 > 1080 || b.y0 < 0 || b.y1 > 1080).map(([k]) => k);
    if (r.f % 60 === 0 || [0, 105, 165, 225, 285, 330, 357, 384].includes(r.f)) {
      console.log(`f${r.f}`, Object.entries(r.props).map(([k, b]) => `${k}[${b.x0 | 0},${b.y0 | 0}..${b.x1 | 0},${b.y1 | 0}]`).join(' '),
        `slab[${r.slab.x0 | 0},${r.slab.y0 | 0}..${r.slab.x1 | 0},${r.slab.y1 | 0}]`, offscreen.length ? `partly-off:${offscreen}` : '');
    }
  }
  console.log('label block', L);
  console.log('prop/label overlaps:', Object.keys(issues).length ? Object.entries(issues).map(([k, v]) => `${k}: ${v.length} frames (${v[0]}..${v[v.length - 1]})`).join('; ') : 'none');
  const feet = rep[0].feet;
  const bad = feet.filter(([x, z]) => Math.abs(x) > 5.96 || Math.abs(z) > 2.96);
  console.log(`tripod feet: ${feet.length}, off the slab: ${bad.length}`, bad);
  fs.writeFileSync(path.join(OUT, 'check.json'), JSON.stringify(rep));
} else if (flag('frames')) {
  const workers = Number(opt('workers', 3));
  const dir = path.join(OUT, 'frames'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const { browser, pages } = await launch(workers);
  const jobs = Array.from({ length: FRAMES + 1 }, (_, i) => i);
  let next = 0, done = 0; const t0 = Date.now();
  await Promise.all(pages.map(async (page) => {
    while (next < jobs.length) {
      const f = jobs[next++];
      await shoot(page, f, path.join(dir, `${String(f).padStart(5, '0')}.png`));
      if (++done % 20 === 0) process.stdout.write(`\r  ${done}/${jobs.length}  ${(done / ((Date.now() - t0) / 1000)).toFixed(2)} fps`);
    }
  }));
  process.stdout.write('\n');
  await browser.close();
} else if (flag('audio')) {
  const { browser, pages: [page] } = await launch(1);
  const res = await page.evaluate(async () => window.renderAudio());
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'score.wav'), Buffer.from(res.wav, 'base64'));
  console.log(JSON.stringify(res.stats, null, 1));
} else if (flag('stems')) {
  const { browser, pages: [page] } = await launch(1);
  for (const g of ['pad', 'kick', 'bass', 'shaker', 'clicks', 'crouch', 'takeoff', 'landing', 'tings', 'pings', 'ticks', 'whoosh', 'blink']) {
    const res = await page.evaluate(async (g) => window.renderAudio({ solo: [g] }), g);
    console.log(g.padEnd(8), JSON.stringify(res.stats));
  }
  for (const g of (opt('dump', '') || '').split(',').filter(Boolean)) {
    const r = await page.evaluate(async (g) => window.renderAudio({ solo: [g], raw: true }), g);
    fs.writeFileSync(path.join(OUT, `stem_${g}.wav`), Buffer.from(r.wav, 'base64'));
  }
  const res = await page.evaluate(async () => window.renderAudio({ raw: true }));
  fs.writeFileSync(path.join(OUT, 'score_raw.wav'), Buffer.from(res.wav, 'base64'));
  console.log('all     ', JSON.stringify(res.stats));
  await browser.close();
} else if (flag('encode')) {
  const frames = path.join(OUT, 'frames', '%05d.png');
  const mp4 = path.join(OUT, 'principles-loop.mp4');
  ffmpeg(['-framerate', String(FPS), '-i', frames, '-i', path.join(OUT, 'score.wav'),
    '-frames:v', String(FRAMES), '-map', '0:v', '-map', '1:a',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-t', '8', '-movflags', '+faststart', mp4]);
  console.log('->', path.relative(ROOT, mp4));
}
