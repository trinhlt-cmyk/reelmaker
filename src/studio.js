// Reelmaker Studio: trang web trên máy (127.0.0.1) để xem video và ghim góp ý lên khung hình.
// Góp ý lưu ở <project>/review/comments.json; ảnh khung hình có đánh dấu ở review/pin-<id>.jpg.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { run } from './exec.js';
import { planTransitions } from './transitions.js';

export function commentsFile(project) {
  return path.join(project.root, 'review', 'comments.json');
}

export function readComments(project) {
  try {
    return JSON.parse(fs.readFileSync(commentsFile(project), 'utf8'));
  } catch {
    return [];
  }
}

function writeComments(project, list) {
  fs.mkdirSync(path.dirname(commentsFile(project)), { recursive: true });
  fs.writeFileSync(commentsFile(project), JSON.stringify(list, null, 2) + '\n');
}

export function updateComment(project, id, patch) {
  const list = readComments(project);
  const c = list.find((x) => x.id === id);
  if (!c) throw new Error(`không có góp ý "${id}"`);
  Object.assign(c, patch, { updated: new Date().toISOString() });
  writeComments(project, list);
  return c;
}

// Mốc bắt đầu từng cảnh trong video cuối (có tính phần chồng của chuyển cảnh).
export async function sceneStarts(project) {
  const { fps } = project.cfg;
  const lengths = [];
  for (const scene of project.cfg.scenes) {
    const f = path.join(project.build, 'scenes', `${scene.id}.mp4`);
    if (!fs.existsSync(f)) return [];
    const n = Number.parseInt(await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets',
      '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', f]), 10);
    lengths.push(n / fps);
  }
  const plan = planTransitions(project, lengths);
  let t = 0;
  return project.cfg.scenes.map((s, k) => {
    if (k > 0) t += lengths[k - 1] - (plan[k]?.d ?? 0);
    return { id: s.id, start: Number(t.toFixed(3)), length: Number(lengths[k].toFixed(3)), narration: s.narration ?? '' };
  });
}

const PAGE = String.raw`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Reelmaker Studio</title>
<style>
  :root { --bg:#111317; --panel:#1b1e24; --line:#2c313a; --fg:#e9ecf1; --muted:#9aa3b2; --hot:#ff4d5e; --ok:#3ecf8e; --acc:#ffd23f; }
  * { box-sizing:border-box } body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.45 -apple-system,"Segoe UI",sans-serif; }
  header { display:flex; align-items:center; gap:14px; padding:12px 20px; border-bottom:1px solid var(--line); }
  header h1 { font-size:17px; margin:0 } header .muted { color:var(--muted); font-size:13px }
  main { display:grid; grid-template-columns:minmax(0,1fr) 360px; gap:18px; padding:18px 20px; height:calc(100vh - 54px); }
  .left { display:flex; flex-direction:column; gap:12px; min-height:0 }
  .stage { position:relative; flex:1; min-height:0; display:flex; align-items:center; justify-content:center; background:#000; border-radius:10px; overflow:hidden }
  video { max-width:100%; max-height:100%; display:block; cursor:crosshair }
  .layer { position:absolute; pointer-events:none }
  .pin { position:absolute; width:26px; height:26px; margin:-13px 0 0 -13px; border-radius:50%; border:3px solid var(--hot);
    background:rgba(255,77,94,.25); box-shadow:0 0 0 3px rgba(0,0,0,.4); }
  .pin span { position:absolute; left:28px; top:-4px; background:var(--hot); color:#fff; font-weight:700; font-size:12px; padding:1px 6px; border-radius:6px; white-space:nowrap }
  .pin.done { border-color:var(--ok); background:rgba(62,207,142,.25) } .pin.done span { background:var(--ok) }
  .bar { position:relative; height:44px; background:var(--panel); border-radius:8px; cursor:pointer; overflow:hidden }
  .seg { position:absolute; top:0; bottom:0; border-right:2px solid var(--bg); padding:4px 6px; font-size:12px; color:var(--muted); overflow:hidden; white-space:nowrap }
  .seg:hover { background:#232733 } .head { position:absolute; top:0; bottom:0; width:2px; background:var(--acc) }
  .tick { position:absolute; bottom:3px; width:8px; height:8px; margin-left:-4px; border-radius:50%; background:var(--hot) } .tick.done { background:var(--ok) }
  .controls { display:flex; gap:10px; align-items:center; color:var(--muted); font-size:13px }
  button { background:#2a2f3a; color:var(--fg); border:1px solid var(--line); border-radius:8px; padding:6px 12px; font:inherit; cursor:pointer }
  button:hover { background:#333948 } button.primary { background:var(--acc); color:#111; border-color:var(--acc); font-weight:700 }
  aside { background:var(--panel); border-radius:10px; display:flex; flex-direction:column; min-height:0 }
  aside h2 { font-size:15px; margin:0; padding:14px 16px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between }
  .list { overflow:auto; padding:8px; display:flex; flex-direction:column; gap:8px; flex:1 }
  .c { background:#20242c; border:1px solid var(--line); border-radius:8px; padding:10px 12px; cursor:pointer }
  .c:hover { border-color:#3a4150 } .c.done { opacity:.6 } .c .meta { color:var(--muted); font-size:12px; display:flex; justify-content:space-between }
  .c .text { margin:4px 0 6px } .c .acts { display:flex; gap:6px } .c .acts button { padding:2px 8px; font-size:12px }
  .badge { font-size:11px; padding:1px 7px; border-radius:6px; background:var(--hot); color:#fff } .badge.done { background:var(--ok) }
  .empty { color:var(--muted); padding:20px; text-align:center }
  .compose { position:absolute; z-index:5; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:10px; width:300px; box-shadow:0 10px 30px rgba(0,0,0,.5) }
  .compose textarea { width:100%; height:70px; background:#111317; color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:8px; font:inherit; resize:vertical }
  .compose .row { display:flex; justify-content:flex-end; gap:6px; margin-top:6px }
  .toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--ok); color:#06210f; padding:8px 16px; border-radius:8px; font-weight:700; opacity:0; transition:opacity .3s }
  .toast.on { opacity:1 }
</style></head><body>
<header><h1>🎬 Reelmaker Studio</h1><span class="muted" id="title"></span><span style="flex:1"></span>
  <span class="muted">Bấm lên khung hình để ghim góp ý · Space: phát/dừng · ←/→: lùi/tiến 1 khung</span></header>
<main>
  <div class="left">
    <div class="stage" id="stage"><video id="v" controls preload="auto"></video><div class="layer" id="layer"></div></div>
    <div class="bar" id="bar"><div class="head" id="head"></div></div>
    <div class="controls"><span id="time">0.0s</span><span id="scene"></span></div>
  </div>
  <aside><h2><span>Góp ý</span><span class="muted" id="count"></span></h2><div class="list" id="list"></div>
    <div style="padding:12px;border-top:1px solid var(--line)"><button class="primary" style="width:100%" id="send">Xong — gửi cho Claude</button>
    <div class="muted" style="font-size:12px;margin-top:6px">Rồi nói với Claude: <b>"sửa theo góp ý trong studio"</b></div></div></aside>
</main>
<div class="toast" id="toast"></div>
<script>
const $ = (id) => document.getElementById(id);
const v = $('v'); let scenes = [], comments = [], version = '', fps = 30;
const toast = (m) => { const t = $('toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 1800); };
const fmt = (t) => t.toFixed(1) + 's';
const sceneAt = (t) => { let s = scenes[0]; for (const x of scenes) if (t >= x.start) s = x; return s; };
async function api(path, opts) { const r = await fetch(path, opts); if (!r.ok) throw new Error(await r.text()); return r.json(); }

async function load() {
  const info = await api('/api/info');
  $('title').textContent = info.title + ' · ' + info.size; scenes = info.scenes; fps = info.fps;
  if (info.version !== version) { const t = v.currentTime; version = info.version; v.src = '/video?v=' + version; v.currentTime = t; }
  comments = await api('/api/comments'); render();
}
function render() {
  const d = v.duration || scenes.reduce((m, s) => Math.max(m, s.start + s.length), 0) || 1;
  const bar = $('bar'); bar.querySelectorAll('.seg,.tick').forEach((e) => e.remove());
  scenes.forEach((s) => { const e = document.createElement('div'); e.className = 'seg'; e.style.left = (s.start / d * 100) + '%';
    e.style.width = (s.length / d * 100) + '%'; e.textContent = s.id; e.title = s.narration; e.onclick = (ev) => { ev.stopPropagation(); v.currentTime = s.start + 0.05; }; bar.appendChild(e); });
  comments.forEach((c) => { const e = document.createElement('div'); e.className = 'tick' + (c.status === 'open' ? '' : ' done'); e.style.left = (c.t / d * 100) + '%'; bar.appendChild(e); });
  const open = comments.filter((c) => c.status === 'open').length;
  $('count').textContent = open + ' chưa xử lý / ' + comments.length;
  const list = $('list'); list.innerHTML = '';
  if (!comments.length) list.innerHTML = '<div class="empty">Chưa có góp ý.<br>Dừng video ở chỗ cần sửa rồi bấm lên khung hình.</div>';
  [...comments].sort((a, b) => a.t - b.t).forEach((c, i) => {
    const e = document.createElement('div'); e.className = 'c' + (c.status === 'open' ? '' : ' done');
    const label = { open: 'chưa xử lý', applied: 'đã sửa', answered: 'đã trả lời', dismissed: 'bỏ qua' }[c.status] || c.status;
    e.innerHTML = '<div class="meta"><span>#' + c.n + ' · ' + fmt(c.t) + ' · ' + c.scene + '</span><span class="badge ' + (c.status === 'open' ? '' : 'done') + '">' + label + '</span></div>'
      + '<div class="text"></div>' + (c.reply ? '<div class="meta" style="color:#9fe0bf">↳ Claude: ' + c.reply.replace(/</g, '&lt;') + '</div>' : '')
      + '<div class="acts"><button data-a="go">Xem</button>' + (c.status === 'open' ? '<button data-a="done">Đã ổn</button>' : '<button data-a="reopen">Mở lại</button>') + '<button data-a="del">Xoá</button></div>';
    e.querySelector('.text').textContent = c.text;
    e.onclick = async (ev) => { const a = ev.target.dataset.a;
      if (a === 'done') await api('/api/comments/' + c.id, { method: 'PATCH', body: JSON.stringify({ status: 'applied' }) });
      else if (a === 'reopen') await api('/api/comments/' + c.id, { method: 'PATCH', body: JSON.stringify({ status: 'open' }) });
      else if (a === 'del') { if (!confirm('Xoá góp ý #' + c.n + '?')) return; await api('/api/comments/' + c.id, { method: 'DELETE' }); }
      else { v.pause(); v.currentTime = c.t; }
      if (a) load(); };
    list.appendChild(e); });
  pins();
}
function box() { // vùng hình thật của video trong khung (trừ viền đen)
  const r = v.getBoundingClientRect(), sr = $('stage').getBoundingClientRect(); return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height - 0 }; }
function pins() {
  const L = $('layer'), b = box(); Object.assign(L.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
  L.innerHTML = ''; comments.filter((c) => Math.abs(c.t - v.currentTime) < 0.6).forEach((c) => {
    const p = document.createElement('div'); p.className = 'pin' + (c.status === 'open' ? '' : ' done');
    p.style.left = (c.x * 100) + '%'; p.style.top = (c.y * 100) + '%'; p.innerHTML = '<span>#' + c.n + '</span>'; L.appendChild(p); });
}
v.addEventListener('timeupdate', () => { $('time').textContent = fmt(v.currentTime); const s = sceneAt(v.currentTime); $('scene').textContent = s ? '· cảnh ' + s.id : '';
  $('head').style.left = (v.currentTime / (v.duration || 1) * 100) + '%'; pins(); });
v.addEventListener('loadedmetadata', render); window.addEventListener('resize', pins);
$('bar').onclick = (e) => { const r = $('bar').getBoundingClientRect(); v.currentTime = (e.clientX - r.left) / r.width * (v.duration || 0); };

// bấm lên hình: dừng, mở ô nhập góp ý
v.addEventListener('click', (e) => {
  const r = v.getBoundingClientRect(); if (e.clientY > r.bottom - 48) return; // thanh điều khiển của video
  e.preventDefault(); v.pause();
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  document.querySelectorAll('.compose').forEach((n) => n.remove());
  const c = document.createElement('div'); c.className = 'compose'; const sr = $('stage').getBoundingClientRect();
  c.style.left = Math.min(e.clientX - sr.left + 12, sr.width - 310) + 'px'; c.style.top = Math.min(e.clientY - sr.top + 12, sr.height - 150) + 'px';
  c.innerHTML = '<div class="muted" style="font-size:12px;margin-bottom:4px">Góp ý tại ' + fmt(v.currentTime) + '</div><textarea placeholder="vd: chữ này to hơn, đổi ảnh khác, nói chậm lại…"></textarea>'
    + '<div class="row"><button data-a="x">Huỷ</button><button class="primary" data-a="ok">Ghim</button></div>';
  $('stage').appendChild(c); const ta = c.querySelector('textarea'); ta.focus();
  const save = async () => { const text = ta.value.trim(); if (!text) return c.remove();
    const shot = snapshot(x, y); c.remove();
    await api('/api/comments', { method: 'POST', body: JSON.stringify({ t: v.currentTime, x, y, text, image: shot }) }); toast('Đã ghim góp ý'); load(); };
  c.onclick = (ev) => { if (ev.target.dataset.a === 'ok') save(); if (ev.target.dataset.a === 'x') c.remove(); };
  ta.onkeydown = (ev) => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) save(); if (ev.key === 'Escape') c.remove(); };
});
function snapshot(x, y) { // khung hình + vòng đỏ ở chỗ ghim, gửi kèm để Claude xem
  const cv = document.createElement('canvas'); const w = v.videoWidth, h = v.videoHeight; const k = Math.min(1, 1280 / Math.max(w, h));
  cv.width = w * k; cv.height = h * k; const g = cv.getContext('2d'); g.drawImage(v, 0, 0, cv.width, cv.height);
  g.lineWidth = 6; g.strokeStyle = '#ff2d3d'; g.beginPath(); g.arc(x * cv.width, y * cv.height, 34, 0, Math.PI * 2); g.stroke();
  return cv.toDataURL('image/jpeg', 0.85); }
document.addEventListener('keydown', (e) => { if (e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') { e.preventDefault(); v.paused ? v.play() : v.pause(); }
  if (e.code === 'ArrowRight') { v.pause(); v.currentTime += 1 / fps; } if (e.code === 'ArrowLeft') { v.pause(); v.currentTime -= 1 / fps; } });
$('send').onclick = async () => { await api('/api/send', { method: 'POST' }); toast('Đã lưu. Quay lại Claude và nói: sửa theo góp ý trong studio'); };
load(); setInterval(async () => { const i = await api('/api/info'); if (i.version !== version || i.commentsVersion !== window._cv) { window._cv = i.commentsVersion; load(); } }, 2500);
</script></body></html>`;

export async function startStudio(project, { port = 4173, log = console.log } = {}) {
  const video = () => path.resolve(project.root, project.cfg.output);
  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
  const body = (req) => new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (d) => { s += d; if (s.length > 20e6) reject(new Error('quá lớn')); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
  });
  let scenesCache = { key: '', scenes: [] };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(PAGE);
      }
      if (url.pathname === '/video') {
        const file = video();
        if (!fs.existsSync(file)) { res.writeHead(404); return res.end('chưa render'); }
        const size = fs.statSync(file).size;
        const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
        if (m) {
          const start = m[1] ? Number(m[1]) : 0;
          const end = m[2] ? Number(m[2]) : size - 1;
          res.writeHead(206, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
          return fs.createReadStream(file, { start, end }).pipe(res);
        }
        res.writeHead(200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': size });
        return fs.createReadStream(file).pipe(res);
      }
      if (url.pathname === '/api/info') {
        const file = video();
        const version = fs.existsSync(file) ? String(fs.statSync(file).mtimeMs) : '';
        if (scenesCache.key !== version) scenesCache = { key: version, scenes: await sceneStarts(project) };
        const cf = commentsFile(project);
        return json(res, 200, {
          title: project.cfg.title ?? path.basename(project.root), size: `${project.cfg.width}×${project.cfg.height}`, fps: project.cfg.fps,
          version, scenes: scenesCache.scenes, commentsVersion: fs.existsSync(cf) ? String(fs.statSync(cf).mtimeMs) : '',
        });
      }
      if (url.pathname === '/api/comments' && req.method === 'GET') return json(res, 200, readComments(project));
      if (url.pathname === '/api/comments' && req.method === 'POST') {
        const b = await body(req);
        const list = readComments(project);
        const id = crypto.randomBytes(4).toString('hex');
        const scenes = scenesCache.scenes;
        let scene = scenes[0];
        for (const s of scenes) if (b.t >= s.start) scene = s;
        if (b.image?.startsWith('data:image/jpeg;base64,')) {
          fs.mkdirSync(path.join(project.root, 'review'), { recursive: true });
          fs.writeFileSync(path.join(project.root, 'review', `pin-${id}.jpg`), Buffer.from(b.image.split(',')[1], 'base64'));
        }
        const c = {
          id, n: (list.reduce((m, x) => Math.max(m, x.n), 0) || 0) + 1, t: Number(b.t.toFixed(3)),
          scene: scene?.id ?? '', sceneT: scene ? Number((b.t - scene.start).toFixed(2)) : null,
          x: Number(b.x.toFixed(4)), y: Number(b.y.toFixed(4)), text: String(b.text).slice(0, 2000),
          image: b.image ? `review/pin-${id}.jpg` : null, status: 'open', created: new Date().toISOString(),
        };
        list.push(c);
        writeComments(project, list);
        return json(res, 200, c);
      }
      const m = /^\/api\/comments\/([0-9a-f]+)$/.exec(url.pathname);
      if (m && req.method === 'PATCH') {
        const b = await body(req);
        return json(res, 200, updateComment(project, m[1], { status: b.status }));
      }
      if (m && req.method === 'DELETE') {
        writeComments(project, readComments(project).filter((c) => c.id !== m[1]));
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/send' && req.method === 'POST') {
        fs.writeFileSync(path.join(project.root, 'review', 'sent.txt'), new Date().toISOString() + '\n');
        return json(res, 200, { ok: true });
      }
      res.writeHead(404);
      res.end();
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve); // chỉ máy này truy cập được
  });
  const url = `http://127.0.0.1:${port}/`;
  log(`🎬 Studio: ${url}  (Ctrl+C để tắt)`);
  return { server, url };
}
