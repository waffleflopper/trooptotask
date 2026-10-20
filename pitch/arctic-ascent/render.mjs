// Renders video.html to MP4, or to still frames for review.
//   node render.mjs                     → out/troop-to-task-arctic-ascent.mp4 (1080p30)
//   node render.mjs --stills 2.5 18 50  → out/still-<t>.png
//   node render.mjs --fps 60 --workers 8
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    `${process.env.HOME}/.local/share/mise/installs/npm-playwright/latest/node_modules/playwright`
);

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : fallback);
const fps = flag('--fps', 30);
const workers = flag('--workers', Math.max(1, Math.min(8, availableParallelism() - 2)));
const stillsAt = args.indexOf('--stills');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(join(here, 'video.html')).href + '?render=1');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))));
  });
  return page;
}

if (stillsAt >= 0) {
  const page = await openPage();
  for (const t of args.slice(stillsAt + 1).map(Number)) {
    await page.evaluate((t) => window.render(t), t);
    await page.screenshot({ path: join(out, `still-${t.toFixed(2)}.png`) });
  }
  await browser.close();
  process.exit(0);
}

const probe = await openPage();
const duration = await probe.evaluate(() => window.DURATION);
await probe.close();
const frames = Math.round(duration * fps);
const per = Math.ceil(frames / workers);
const segDir = join(out, 'segments');
rmSync(segDir, { recursive: true, force: true });
mkdirSync(segDir, { recursive: true });

let done = 0;
async function renderSegment(i) {
  const page = await openPage();
  const file = join(segDir, `seg-${String(i).padStart(2, '0')}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(fps), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const closed = new Promise((r) => ff.on('close', r));
  for (let f = i * per; f < Math.min(frames, (i + 1) * per); f++) {
    await page.evaluate((t) => window.render(t), f / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (++done % (fps * 5) === 0) console.error(`${done}/${frames} frames`);
  }
  ff.stdin.end();
  await closed;
  await page.close();
  return file;
}

const segments = await Promise.all(Array.from({ length: workers }, (_, i) => renderSegment(i)));
await browser.close();
const list = join(segDir, 'list.txt');
writeFileSync(list, segments.map((s) => `file '${s}'`).join('\n'));
const file = join(out, 'troop-to-task-arctic-ascent.mp4');
await new Promise((r, j) =>
  spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', file], { stdio: 'inherit' })
    .on('close', (code) => (code ? j(new Error(`concat failed: ${code}`)) : r()))
);
rmSync(segDir, { recursive: true, force: true });
console.log(`wrote ${file}`);
