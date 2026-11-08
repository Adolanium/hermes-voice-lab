#!/usr/bin/env node
/**
 * Render a performance video of the portrait singing (development tool).
 *
 *   node scripts/render-video.mjs [--out docs/media/boop-bop-song.mp4] [--fps 30] [--url http://127.0.0.1:5199]
 *
 * Audio and pictures come from one offline engine run (see src/dev/video.tsx),
 * so lip-sync is exact. Needs ffmpeg on PATH and a Playwright Chromium
 * (or --chrome /path/to/chrome).
 */
import {spawn} from 'node:child_process';
import {existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {chromium} from 'playwright-core';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const out = resolve(args.out ?? 'docs/media/boop-bop-song.mp4');
const fps = Number(args.fps ?? 30);
let url = args.url;
let server = null;

if (!url) {
  const {createServer} = await import('vite');
  server = await createServer({server: {host: '127.0.0.1', port: 5288, strictPort: false}, logLevel: 'warn'});
  await server.listen();
  url = server.resolvedUrls.local[0].replace(/\/$/, '');
}

/** Use --chrome, else Playwright's own download, else any cached headless shell. */
function chromePath() {
  if (args.chrome) return args.chrome;
  const cache = join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  const shells = existsSync(cache) ? readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
  for (const d of shells) {
    for (const sub of readdirSync(join(cache, d))) {
      const exe = join(cache, d, sub, process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell');
      if (existsSync(exe)) return exe;
    }
  }
  return undefined;
}
const browser = await chromium.launch().catch(() => chromium.launch({executablePath: chromePath()}));
const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1});
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(`${url}/video.html`);
await page.waitForFunction(() => !!window.__video);
await page.evaluate(() => document.fonts.ready);
const t0 = Date.now();
const info = await page.evaluate(fps => window.__video.prepare({fps}), fps);
console.log(`engine: ${info.frames} frames, ${info.seconds.toFixed(2)} s, ${info.cues} sung syllables (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

const dir = mkdtempSync(join(tmpdir(), 'hvl-video-'));
const wavPath = join(dir, 'audio.wav');
writeFileSync(wavPath, Buffer.from(info.wav, 'base64'));

const ffmpeg = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
  '-i', wavPath,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-preset', 'medium', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '192k', '-shortest', out,
], {stdio: ['pipe', 'inherit', 'inherit']});
const done = new Promise((ok, fail) => ffmpeg.on('close', code => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`)))));

for (let i = 0; i < info.frames; i++) {
  await page.evaluate(i => window.__video.show(i), i);
  const png = await page.screenshot({type: 'png'});
  if (!ffmpeg.stdin.write(png)) await new Promise(r => ffmpeg.stdin.once('drain', r));
  if (i % 60 === 0) process.stdout.write(`\rframes ${i}/${info.frames}`);
}
ffmpeg.stdin.end();
await done;
process.stdout.write(`\rframes ${info.frames}/${info.frames}\n`);
if (args.wav) writeFileSync(resolve(args.wav), Buffer.from(info.wav, 'base64'));
await browser.close();
await server?.close();
rmSync(dir, {recursive: true, force: true});
console.log(`wrote ${out}`);
