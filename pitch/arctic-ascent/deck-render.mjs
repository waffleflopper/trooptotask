// Renders deck.html to slide images, a PDF and the slide list the PowerPoint build reads.
//   node deck-render.mjs   → out/slides/slide-NN.png, out/slides/slides.json, out/troop-to-task-arctic-ascent-slides.pdf
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    `${process.env.HOME}/.local/share/mise/installs/npm-playwright/latest/node_modules/playwright`
);

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
const dir = join(out, 'slides');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

// The video slide's still: the opener's end card
execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '138', '-i', join(out, 'troop-to-task-arctic-ascent.mp4'), '-frames:v', '1', join(out, 'poster.png')]);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
const url = pathToFileURL(join(here, 'deck.html')).href;
const settle = (page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });

const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(url);
await settle(page);
const n = await page.evaluate(() => window.slideCount);
const slides = [];
for (let i = 0; i < n; i++) {
  const info = await page.evaluate((i) => {
    window.go(i);
    const s = document.querySelectorAll('.slide')[i];
    if (s.id === 's-video') { const v = s.querySelector('video'); v.pause(); v.removeAttribute('src'); v.load(); }
    return { video: s.id === 's-video' };
  }, i);
  await settle(page);
  const file = `slide-${String(i + 1).padStart(2, '0')}.png`;
  await page.screenshot({ path: join(dir, file) });
  slides.push({ file, ...info });
}
writeFileSync(join(dir, 'slides.json'), JSON.stringify(slides, null, 2));

const pdf = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await pdf.goto(url + '?print');
await settle(pdf);
await pdf.pdf({ path: join(out, 'troop-to-task-arctic-ascent-slides.pdf'), width: '1920px', height: '1080px', printBackground: true, pageRanges: '' });
await browser.close();
console.log(`wrote ${n} slides, slides.json and the PDF`);
