// Chuyển cảnh giữa hai cảnh liền nhau.
//   "fade", "slideleft", "circleopen"… : bộ lọc xfade có sẵn của ffmpeg (58 kiểu)
//   "gl:cube", "gl:ripple", "gl:burn"… : GL Transitions (github.com/gl-transitions, MIT), chạy bằng WebGL trong
//                                         Chrome trên chính hai video cảnh, từng khung hình
//   "cut"                                : cắt thẳng
// Đặt cho cả video: "transition", "transitionDuration"; riêng một cảnh (chuyển VÀO cảnh đó): cùng tên trong cảnh.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { run } from './exec.js';
import { hash } from './project.js';

const require = createRequire(import.meta.url);

export const XFADE = [
  'fade', 'fadeblack', 'fadewhite', 'fadegrays', 'fadefast', 'fadeslow', 'dissolve', 'pixelize', 'distance', 'hblur',
  'wipeleft', 'wiperight', 'wipeup', 'wipedown', 'wipetl', 'wipetr', 'wipebl', 'wipebr',
  'slideleft', 'slideright', 'slideup', 'slidedown', 'smoothleft', 'smoothright', 'smoothup', 'smoothdown',
  'coverleft', 'coverright', 'coverup', 'coverdown', 'revealleft', 'revealright', 'revealup', 'revealdown',
  'circleopen', 'circleclose', 'circlecrop', 'rectcrop', 'radial', 'zoomin', 'squeezeh', 'squeezev',
  'vertopen', 'vertclose', 'horzopen', 'horzclose', 'diagtl', 'diagtr', 'diagbl', 'diagbr',
  'hlslice', 'hrslice', 'vuslice', 'vdslice', 'hlwind', 'hrwind', 'vuwind', 'vdwind',
];

// Hiệu ứng GL cần ảnh phụ (sampler2D) thì bỏ: reelmaker chỉ có hai video vào/ra.
export function glLibrary() {
  return require('gl-transitions').filter((t) => !Object.values(t.paramsTypes ?? {}).includes('sampler2D'));
}

export function resolveTransition(name) {
  if (!name || name === 'cut' || name === 'none') return { kind: 'cut' };
  if (name.startsWith('gl:')) {
    const t = glLibrary().find((x) => x.name.toLowerCase() === name.slice(3).toLowerCase());
    if (!t) throw new Error(`không có chuyển cảnh "${name}" (xem: reelmaker transitions --gl)`);
    return { kind: 'gl', name: t.name, def: t };
  }
  if (!XFADE.includes(name)) throw new Error(`không có chuyển cảnh "${name}" (xem: reelmaker transitions)`);
  return { kind: 'xfade', name };
}

// Kế hoạch chuyển cảnh: boundaries[k] = chuyển từ cảnh k-1 sang cảnh k (k ≥ 1), với độ dài đã giới hạn để
// không cắt mất giọng đọc (≤ phần đuôi im lặng của cảnh trước) và không dài quá nửa cảnh.
export function planTransitions(project, lengths) {
  const { cfg } = project;
  return cfg.scenes.map((scene, k) => {
    if (k === 0) return null;
    const t = resolveTransition(scene.transition ?? cfg.transition);
    if (t.kind === 'cut') return t;
    const prev = cfg.scenes[k - 1];
    let d = Number(scene.transitionDuration ?? cfg.transitionDuration);
    if (prev.narration) d = Math.min(d, prev.tail);
    d = Math.min(d, lengths[k - 1] / 2, lengths[k] / 2);
    d = Math.round(d * cfg.fps) / cfg.fps; // đúng số khung hình
    return d >= 2 / cfg.fps ? { ...t, d } : { kind: 'cut' };
  });
}

// ---------------------------------------------------------------- GL Transitions trong Chrome

const VERTEX = `attribute vec2 _p; varying vec2 _uv; void main(){ gl_Position = vec4(_p, 0.0, 1.0); _uv = (_p + 1.0) / 2.0; }`;
const fragment = (glsl) => `precision highp float;
varying vec2 _uv;
uniform sampler2D from, to;
uniform float progress, ratio;
vec4 getFromColor(vec2 uv) { return texture2D(from, uv); }
vec4 getToColor(vec2 uv) { return texture2D(to, uv); }
${glsl}
void main() { gl_FragColor = transition(_uv); }`;

// Chạy trong trang: dựng chương trình WebGL cho một hiệu ứng; window.__glFrame(p) vẽ khung ở tiến độ p.
function setupGl({ vertex, fragment, params, types, width, height }) {
  const canvas = document.getElementById('c');
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false });
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, vertex));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, '_p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1f(gl.getUniformLocation(prog, 'ratio'), width / height);
  for (const [name, value] of Object.entries(params)) {
    const u = gl.getUniformLocation(prog, name);
    const type = types[name];
    const v = [].concat(value);
    if (type === 'float') gl.uniform1f(u, v[0]);
    else if (type === 'int' || type === 'bool') gl.uniform1i(u, Number(v[0]));
    else if (/^vec[234]$/.test(type)) gl[`uniform${type[3]}fv`](u, v);
    else if (/^ivec[234]$/.test(type)) gl[`uniform${type[4]}iv`](u, v);
  }
  const textures = ['from', 'to'].map((name, unit) => {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
    return tex;
  });
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const progress = gl.getUniformLocation(prog, 'progress');
  const seek = (v, t) => (Math.abs(v.currentTime - t) < 0.001 ? null
    : new Promise((r) => { v.addEventListener('seeked', r, { once: true }); v.currentTime = t; }));
  // fromT/toT: giây trong hai nguồn (video hoặc ảnh); p: tiến độ 0..1
  window.__glFrame = async (p, fromT, toT) => {
    const [a, b] = [document.getElementById('from'), document.getElementById('to')];
    await Promise.all([a.tagName === 'VIDEO' && seek(a, fromT), b.tagName === 'VIDEO' && seek(b, toT)]);
    [a, b].forEach((src, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    });
    gl.uniform1f(progress, p);
    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
}

// Trang render: canvas đúng cỡ + hai nguồn (video hoặc ảnh), chờ nạp xong rồi dựng WebGL.
export async function openGlPage(browser, { width, height, from, to, def, dir }) {
  const media = (id, file) => (/\.(mp4|mov|webm|mkv)$/i.test(file)
    ? `<video id="${id}" src="${pathToFileURL(file).href}" muted playsinline preload="auto"></video>`
    : `<img id="${id}" src="${pathToFileURL(file).href}">`);
  const html = path.join(dir, 'gl-page.html');
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}
    canvas{display:block} video,img{position:absolute;left:-99999px;width:${width}px;height:${height}px}</style>
    <canvas id="c" width="${width}" height="${height}"></canvas>${media('from', from)}${media('to', to)}`);
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await page.evaluate(() => Promise.all(['from', 'to'].map((id) => {
    const el = document.getElementById(id);
    if (el.tagName === 'IMG') return el.decode();
    return el.readyState >= 2 ? null : new Promise((r, j) => { el.addEventListener('loadeddata', r, { once: true }); el.addEventListener('error', () => j(new Error('không mở được video'))); });
  })));
  await page.evaluate(setupGl, {
    vertex: VERTEX, fragment: fragment(def.glsl), params: def.defaultParams ?? {}, types: def.paramsTypes ?? {}, width, height,
  });
  return page;
}

// Đoạn chuyển cảnh GL dài d giây: d giây cuối của cảnh trước (từ fromStart) hoà sang d giây đầu của cảnh sau.
export async function renderGlClip(browser, project, { fromFile, toFile, fromStart, d, t, out }) {
  const { width, height, fps } = project.cfg;
  const key = hash(t.name, d, fromStart, fs.statSync(fromFile).mtimeMs, fs.statSync(toFile).mtimeMs, width, height, fps);
  if (fs.existsSync(out) && fs.existsSync(`${out}.key`) && fs.readFileSync(`${out}.key`, 'utf8') === key) return out;
  const page = await openGlPage(browser, { width, height, from: fromFile, to: toFile, def: t.def, dir: path.dirname(out) });
  const frames = Math.round(d * fps);
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), out,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  ff.stderr.on('data', (x) => (err += x));
  const done = new Promise((resolve, reject) => ff.on('close', (c) => (c === 0 ? resolve() : reject(new Error(err)))));
  for (let i = 0; i < frames; i++) {
    const p = (i + 0.5) / frames;
    await page.evaluate((a, b, c) => window.__glFrame(a, b, c), p, fromStart + i / fps, i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95, optimizeForSpeed: true });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await page.close();
  await done;
  fs.writeFileSync(`${out}.key`, key);
  return out;
}

// ---------------------------------------------------------------- bảng xem trước

// Hai ảnh mẫu A (xanh) → B (cam) để thấy rõ hiệu ứng ở giữa chừng (tiến độ 50%).
const SAMPLE = (letter, bg, fg, deco) => `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:480px;height:270px;overflow:hidden;background:${bg};font:900 150px -apple-system,Arial;color:${fg}}
  .l{position:absolute;left:50%;top:50%;transform:translate(-50%,-55%)} ${deco}</style><div class="d"></div><div class="l">${letter}</div>`;
const SAMPLES = {
  a: SAMPLE('A', 'linear-gradient(135deg,#123a7a,#2f7de1)', '#fff',
    '.d{position:absolute;inset:0;background:radial-gradient(circle at 20% 30%,rgba(255,255,255,.25) 0 40px,transparent 41px),radial-gradient(circle at 80% 75%,rgba(255,255,255,.18) 0 60px,transparent 61px)}'),
  b: SAMPLE('B', 'linear-gradient(135deg,#ff9a3c,#ffd166)', '#3a1d00',
    '.d{position:absolute;inset:0;background:repeating-linear-gradient(45deg,rgba(0,0,0,.08) 0 18px,transparent 18px 36px)}'),
};

// Tạo (hoặc dùng lại) ảnh xem trước của mọi hiệu ứng, trả về đường dẫn hai bảng ảnh.
export async function previewSheets(browser, dir) {
  fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 270, deviceScaleFactor: 1 });
  for (const [k, html] of Object.entries(SAMPLES)) {
    const file = path.join(dir, `${k}.png`);
    if (fs.existsSync(file)) continue;
    await page.setContent(html);
    await page.screenshot({ path: file });
  }
  await page.close();
  const a = path.join(dir, 'a.png');
  const b = path.join(dir, 'b.png');

  const cells = { xfade: [], gl: [] };
  for (const name of XFADE) {
    const out = path.join(dir, 'frames', `xfade-${name}.png`);
    if (!fs.existsSync(out)) {
      await run('ffmpeg', [
        '-y', '-loglevel', 'error', '-loop', '1', '-t', '1', '-framerate', '30', '-i', a, '-loop', '1', '-t', '1', '-framerate', '30', '-i', b,
        '-filter_complex', `[0][1]xfade=transition=${name}:duration=1:offset=0,format=rgb24`, '-ss', '0.5', '-frames:v', '1', out,
      ]);
    }
    cells.xfade.push({ name, file: out });
  }
  for (const def of glLibrary()) {
    const out = path.join(dir, 'frames', `gl-${def.name}.png`);
    if (!fs.existsSync(out)) {
      try {
        const p = await openGlPage(browser, { width: 480, height: 270, from: a, to: b, def, dir });
        await p.evaluate(() => window.__glFrame(0.5, 0, 0));
        await p.screenshot({ path: out });
        await p.close();
      } catch {
        continue; // shader không biên dịch được trên máy này: bỏ khỏi danh sách
      }
    }
    cells.gl.push({ name: `gl:${def.name}`, file: out });
  }

  const sheets = {};
  for (const [kind, list] of Object.entries(cells)) {
    const html = path.join(dir, `${kind}.html`);
    fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:14px;background:#111;color:#eee;font:15px -apple-system,Arial;display:grid;grid-template-columns:repeat(6,1fr);gap:10px;width:1600px}
      figure{margin:0;background:#222;border-radius:6px;overflow:hidden} img{display:block;width:100%}
      figcaption{padding:5px 8px;font-weight:600}</style>
      ${list.map((c) => `<figure><img src="${pathToFileURL(c.file).href}"><figcaption>${c.name}</figcaption></figure>`).join('')}`);
    const p = await browser.newPage();
    await p.setViewport({ width: 1628, height: 400, deviceScaleFactor: 1 });
    await p.goto(pathToFileURL(html).href, { waitUntil: 'load' });
    sheets[kind] = path.join(dir, `${kind}.png`);
    await p.screenshot({ path: sheets[kind], fullPage: true });
    await p.close();
  }
  return { sheets, counts: { xfade: cells.xfade.length, gl: cells.gl.length } };
}

// ---------------------------------------------------------------- nối các cảnh

async function frameCount(file) {
  const out = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file]);
  return Number.parseInt(out, 10);
}

// Nối các cảnh với chuyển cảnh thành một file (video H.264 + tiếng PCM), trả về đường dẫn; null nếu toàn cắt thẳng.
// Tiếng: cắt bớt d giây cuối của cảnh trước (phần đuôi im lặng) rồi nối liền, để câu đầu cảnh sau không bị nhỏ đi.
export async function joinWithTransitions(project, sceneFiles, { browser, log = console.log } = {}) {
  const { fps } = project.cfg;
  const lengths = [];
  for (const f of sceneFiles) lengths.push((await frameCount(f)) / fps);
  const plan = planTransitions(project, lengths);
  if (plan.every((t) => !t || t.kind === 'cut')) return null;
  const dir = path.join(project.build, 'transitions');
  fs.mkdirSync(dir, { recursive: true });

  const inputs = sceneFiles.flatMap((f) => ['-i', f]);
  const filters = sceneFiles.map((_, i) => `[${i}:v]settb=AVTB,setpts=PTS-STARTPTS,fps=${fps},format=yuv420p,setsar=1[v${i}]`);
  // concat / xfade đổi đơn vị thời gian: chuẩn hoá lại sau mỗi bước để bước sau (xfade) khớp đầu vào
  const NORM = `settb=AVTB,fps=${fps},setsar=1`;
  let x = 'v0';
  let len = lengths[0];
  for (let k = 1; k < sceneFiles.length; k++) {
    const t = plan[k];
    const next = `x${k}`;
    if (t.kind === 'cut') {
      filters.push(`[${x}][v${k}]concat=n=2:v=1:a=0,${NORM}[${next}]`);
      len += lengths[k];
    } else if (t.kind === 'xfade') {
      filters.push(`[${x}][v${k}]xfade=transition=${t.name}:duration=${t.d}:offset=${(len - t.d).toFixed(4)},${NORM}[${next}]`);
      len += lengths[k] - t.d;
    } else {
      log(`  ✨ chuyển cảnh gl:${t.name} → ${project.cfg.scenes[k].id}`);
      const clip = await renderGlClip(browser, project, {
        fromFile: sceneFiles[k - 1], toFile: sceneFiles[k], fromStart: lengths[k - 1] - t.d, d: t.d, t,
        out: path.join(dir, `${String(k).padStart(2, '0')}-${t.name}.mp4`),
      });
      const idx = inputs.length / 2;
      inputs.push('-i', clip);
      filters.push(
        `[${idx}:v]settb=AVTB,setpts=PTS-STARTPTS,fps=${fps},format=yuv420p,setsar=1[g${k}]`,
        `[${x}]trim=end=${(len - t.d).toFixed(4)},setpts=PTS-STARTPTS[xa${k}]`,
        `[v${k}]trim=start=${t.d},setpts=PTS-STARTPTS[vb${k}]`,
        `[xa${k}][g${k}][vb${k}]concat=n=3:v=1:a=0,${NORM}[${next}]`,
      );
      len += lengths[k] - t.d;
    }
    x = next;
  }
  sceneFiles.forEach((_, i) => {
    const cutTail = plan[i + 1]?.d ?? 0;
    filters.push(`[${i}:a]atrim=end=${(lengths[i] - cutTail).toFixed(4)},asetpts=PTS-STARTPTS[a${i}]`);
  });
  filters.push(`${sceneFiles.map((_, i) => `[a${i}]`).join('')}concat=n=${sceneFiles.length}:v=0:a=1[aout]`);

  const out = path.join(project.build, 'joined.mkv');
  await run('ffmpeg', [
    '-y', '-loglevel', process.env.REELMAKER_DEBUG ? 'info' : 'error', ...inputs, '-filter_complex', filters.join(';'),
    '-map', `[${x}]`, '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), '-c:a', 'pcm_s16le', out,
  ]);
  return out;
}
