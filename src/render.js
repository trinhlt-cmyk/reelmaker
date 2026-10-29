// Quay từng cảnh HTML bằng Chrome headless, từng khung hình một, rồi ghép với giọng đọc thành MP4.
// Thời gian trong trang do reelmaker điều khiển: mọi CSS animation bị dừng và tua đến đúng t của khung hình,
// nên video luôn mượt và giống nhau mỗi lần render, bất kể máy nhanh hay chậm.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { hash } from './project.js';
import { voiceScene } from './voice.js';
import { sceneCues, libraryStamp } from './sfx.js';
import { beatPlan } from './beats.js';
import { useWebCache } from './webcache.js';

export const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

export async function launchBrowser() {
  const executablePath = CHROME_CANDIDATES.find((p) => p && fs.existsSync(p));
  if (!executablePath) throw new Error('không thấy Chrome (đặt CHROME_PATH)');
  return puppeteer.launch({
    executablePath,
    headless: true,
    // allow-file-access-from-files: chuyển cảnh WebGL đọc khung hình từ video cảnh (file://); Chrome này chỉ mở
    // các trang do reelmaker dựng từ project
    args: ['--force-device-scale-factor=1', '--font-render-hinting=none', '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files'],
  });
}

// Chạy trong trang trước mọi script của cảnh. Tạo window.reel và window.__seek(t).
function pageRuntime(info) {
  const handlers = [];
  window.reel = {
    ...info,
    t: 0,
    // reel.on(t => ...): gọi mỗi khung hình, cho animation viết bằng JS (GSAP: t => tl.seek(t))
    on(fn) {
      handlers.push(fn);
      fn(this.t);
    },
  };
  const caption = () => {
    let el = document.getElementById('reel-caption');
    if (!el && info.captions) {
      el = document.createElement('div');
      el.id = 'reel-caption';
      if (info.height > info.width) el.classList.add('vertical');
      if (info.captionStyle === 'karaoke') el.classList.add('karaoke');
      document.body.appendChild(el);
    }
    return el;
  };
  window.__seek = async (t) => {
    window.reel.t = t;
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = t * 1000;
    }
    for (const fn of handlers) fn(t);
    // video trong cảnh: dừng và tua đến đúng khung (data-start = giây bắt đầu trong clip, data-rate = tốc độ)
    await Promise.all(
      [...document.querySelectorAll('video')].map((v) => {
        v.pause();
        v.muted = true;
        let target = Number(v.dataset.start || 0) + t * Number(v.dataset.rate || 1);
        if (v.duration) target = v.loop ? target % v.duration : Math.min(target, v.duration - 0.04);
        if (Math.abs(v.currentTime - target) < 0.001) return null;
        return new Promise((r) => {
          v.addEventListener('seeked', r, { once: true });
          v.currentTime = target;
        });
      }),
    );
    const el = caption();
    if (el) {
      const line = info.lines.find((l) => t >= l.start && t < l.end + 0.15);
      const text = line ? line.text : '';
      if (info.captionStyle === 'karaoke' && line?.words) {
        // karaoke: mỗi từ một ô, từ đang đọc sáng lên
        if (el.dataset.line !== String(line.start)) {
          el.replaceChildren(...line.words.flatMap((w, i) => {
            const span = document.createElement('span');
            span.className = 'w';
            span.textContent = w.text;
            return i ? [document.createTextNode(' '), span] : [span];
          }));
          el.dataset.line = String(line.start);
        }
        el.querySelectorAll('.w').forEach((span, i) => {
          const w = line.words[i];
          span.classList.toggle('on', t >= w.start && t < w.end + 0.05);
          span.classList.toggle('said', t >= w.end + 0.05);
        });
      } else if (el.textContent !== text) {
        el.textContent = text;
        delete el.dataset.line;
      }
      el.style.opacity = text ? '1' : '0';
    }
    // chữ mới có thể cần tải thêm phần font (vd bộ ký tự tiếng Việt) trước khi chụp
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };
}

const CAPTION_CSS = `
#reel-caption {
  position: fixed; left: 50%; bottom: 7%; transform: translateX(-50%);
  /* max-content: không bị bó vào nửa khung (left 50%) mà xuống dòng quá sớm */
  width: max-content; max-width: 82%; padding: .35em .8em; border-radius: .4em;
  background: rgba(0,0,0,.62); color: #fff; text-align: center;
  font: 600 44px/1.35 "Be Vietnam Pro", -apple-system, "Helvetica Neue", Arial, sans-serif;
  z-index: 2147483647; pointer-events: none;
}
/* video dọc: tránh vùng nút của TikTok/Reels ở ~480 px dưới cùng */
#reel-caption.vertical { bottom: 27%; max-width: 86%; font-size: 52px; }
/* karaoke (kiểu TikTok): chữ to viền đen, từ đang đọc vàng và nhô lên */
#reel-caption.karaoke {
  background: none; padding: 0; max-width: 88%;
  font: 900 64px/1.18 "Be Vietnam Pro", -apple-system, Arial, sans-serif; text-transform: uppercase;
  color: #fff; -webkit-text-stroke: 10px #000; paint-order: stroke fill;
  filter: drop-shadow(0 6px 0 rgba(0,0,0,.35));
}
#reel-caption.karaoke.vertical { font-size: 76px; }
#reel-caption.karaoke .w { display: inline-block; margin: 0 .08em; transform-origin: 50% 80%; }
#reel-caption.karaoke .w.on { color: #ffe14a; transform: scale(1.1); margin: 0 .14em; }`;

// Thông tin thời gian của một cảnh: tổng thời lượng và phụ đề đã dời theo lead.
export async function sceneTiming(project, scene, opts = {}) {
  const v = await voiceScene(project, scene, opts);
  const lead = v.audio ? scene.lead : 0;
  // cắt theo nhịp: độ dài cảnh đã chỉnh để chuyển cảnh rơi đúng nhịp; beats = nhịp trong cảnh (giây)
  const plan = (await beatPlan(project))?.scenes[scene.id];
  const duration = plan?.duration ?? scene.duration ?? lead + v.duration + scene.tail;
  const shift = (x) => ({ ...x, start: x.start + lead, end: x.end + lead });
  const lines = v.lines.map((l) => ({ ...shift(l), words: l.words?.map(shift) }));
  return { audio: v.audio, voiceKey: v.key + (v.aligned ?? ''), lead, duration, lines, beats: plan?.beats ?? [] };
}

// Mở cảnh ở trang mới, sẵn sàng để __seek; lỗi JS của trang nằm ở page.reelErrors.
export async function openScene(browser, project, scene, timing, { quiet = false } = {}) {
  const { width, height, fps, captions } = project.cfg;
  if (!fs.existsSync(scene.htmlPath)) throw new Error(`cảnh ${scene.id}: không thấy ${scene.html}`);
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const info = { id: scene.id, width, height, fps, duration: timing.duration, lead: timing.lead, lines: timing.lines, captions: scene.captions ?? captions,
    captionStyle: scene.captionStyle ?? project.cfg.captionStyle, beats: timing.beats ?? [] };
  await page.evaluateOnNewDocument(pageRuntime, info);
  await useWebCache(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(scene.htmlPath).href, { waitUntil: 'networkidle0', timeout: 60_000 });
  // đặt đầu <head> để CSS #reel-caption của cảnh ghi đè được kiểu mặc định
  await page.evaluate((css) => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.prepend(style);
    // chờ font và khung đầu của mọi video trong cảnh
    const videos = [...document.querySelectorAll('video')].map((v) => {
      v.autoplay = false;
      v.pause();
      v.preload = 'auto';
      return v.readyState >= 2 ? null : new Promise((r) => {
        v.addEventListener('loadeddata', r, { once: true });
        v.addEventListener('error', r, { once: true });
      });
    });
    return Promise.all([document.fonts.ready, ...videos]).then(() => undefined);
  }, CAPTION_CSS);
  if (errors.length && !quiet) console.warn(`  ⚠ cảnh ${scene.id} có lỗi JS: ${errors.join(' | ')}`);
  page.reelErrors = errors;
  return page;
}

// Ảnh tĩnh của cảnh tại các thời điểm, để kiểm tra bố cục mà không cần render cả video.
export async function stills(project, scene, times, { browser } = {}) {
  const own = !browser;
  browser ??= await launchBrowser();
  try {
    const timing = await sceneTiming(project, scene);
    const page = await openScene(browser, project, scene, timing);
    const dir = path.join(project.build, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    const files = [];
    for (const raw of times) {
      const t = raw === 'end' ? timing.duration - 0.01 : Math.min(Number(raw), timing.duration - 0.01);
      await page.evaluate((x) => window.__seek(x), t);
      const file = path.join(dir, `${scene.id}@${t.toFixed(2)}s.png`);
      await page.screenshot({ path: file, type: 'png' });
      files.push(file);
    }
    await page.close();
    return { files, duration: timing.duration };
  } finally {
    if (own) await browser.close();
  }
}

function writeFrame(stream, buf) {
  return stream.write(buf) ? Promise.resolve() : new Promise((r) => stream.once('drain', r));
}

// Render một cảnh thành build/scenes/<id>.mp4 (có tiếng). Bỏ qua nếu không có gì thay đổi.
export async function renderScene(browser, project, scene, { force = false, log = console.log } = {}) {
  const { fps } = project.cfg;
  const timing = await sceneTiming(project, scene, { log });
  const dir = path.join(project.build, 'scenes');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${scene.id}.mp4`);
  const keyFile = `${out}.key`;
  const { sfx = true, sfxVolume = 1 } = project.cfg;
  const key = hash(
    // chuyển cảnh làm ở bước ghép, đổi nó không cần render lại cảnh
    fs.readFileSync(scene.htmlPath, 'utf8'), assetsStamp(project), { ...scene, transition: undefined, transitionDuration: undefined }, timing.voiceKey, timing.duration, timing.beats,
    project.cfg.width, project.cfg.height, fps, project.cfg.captions,
    { sfx, sfxVolume, first: project.cfg.scenes.indexOf(scene) === 0, lib: libraryStamp() },
  );
  if (!force && fs.existsSync(out) && fs.existsSync(keyFile) && fs.readFileSync(keyFile, 'utf8') === key) {
    log(`  ✓ cảnh ${scene.id}: không đổi, dùng lại`);
    return out;
  }

  const page = await openScene(browser, project, scene, timing);
  const cues = await sceneCues(page, project, scene, timing.duration);

  const frames = Math.round(timing.duration * fps);
  const audioIn = timing.audio
    ? ['-i', timing.audio]
    : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
  const delay = Math.round(timing.lead * 1000);
  // giọng đọc + các tiếng hiệu ứng (mỗi tiếng một input, dời đến đúng thời điểm của nó)
  const filters = [`[1:a]aresample=48000,adelay=${delay}:all=1,apad[voice]`];
  cues.forEach((c, i) => {
    filters.push(`[${i + 2}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${c.gain},adelay=${Math.round(c.t * 1000)}:all=1[s${i}]`);
  });
  filters.push(cues.length
    ? `[voice]${cues.map((_, i) => `[s${i}]`).join('')}amix=inputs=${cues.length + 1}:duration=first:normalize=0[a]`
    : '[voice]anull[a]');
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    ...audioIn,
    ...cues.flatMap((c) => ['-i', c.file]),
    '-filter_complex', filters.join(';'),
    '-map', '0:v', '-map', '[a]', '-t', timing.duration.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
    out,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let ffErr = '';
  ff.stderr.on('data', (d) => (ffErr += d));
  const done = new Promise((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg lỗi ở cảnh ${scene.id}:\n${ffErr}`))));
  });

  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((x) => window.__seek(x), i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95, optimizeForSpeed: true });
    await writeFrame(ff.stdin, buf);
    if (i % (fps * 2) === 0 || i === frames - 1) {
      process.stdout.write(`\r  🎬 cảnh ${scene.id}: ${i + 1}/${frames} khung hình`);
    }
  }
  ff.stdin.end();
  await page.close();
  await done;
  const sounds = cues.length ? `, ${cues.length} tiếng hiệu ứng` : '';
  process.stdout.write(`\r  ✓ cảnh ${scene.id}: ${timing.duration.toFixed(1)}s, ${frames} khung hình${sounds} (${((Date.now() - started) / 1000).toFixed(0)}s)\n`);
  fs.writeFileSync(keyFile, key);
  return out;
}

// Dấu thời gian các file dùng chung (css, ảnh…) ngoài build/ và out/, để đổi chúng thì cảnh render lại.
// Bỏ qua ảnh ứng viên (assets/candidates) và credits.json: tìm thêm ảnh không làm các cảnh render lại.
const NOT_ASSETS = new Set(['build', 'out', 'credits.json', path.join('assets', 'candidates')]);
function assetsStamp(project) {
  const stamps = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || NOT_ASSETS.has(path.relative(project.root, path.join(dir, e.name)))) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (!/\.(html|mp3|wav|m4a|aac|ogg)$/i.test(e.name) && e.name !== 'video.json') stamps.push(`${p}:${fs.statSync(p).mtimeMs}`);
    }
  };
  walk(project.root);
  return stamps.sort().join('|');
}
