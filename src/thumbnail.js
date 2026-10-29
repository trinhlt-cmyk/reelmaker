// Ảnh bìa: nền sạch từ các cảnh (ẩn chữ, phụ đề, bàn tay) + tiêu đề chữ to viền đen, từ khoá tô vàng.
// Ra out/thumbnail-1..N.jpg (và out/thumbnail.jpg = phương án 1). Ngang 1280×720 (YouTube), dọc 1080×1920 (TikTok).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { run } from './exec.js';
import { launchBrowser, openScene, sceneTiming } from './render.js';

const HOME = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const CLEAN_CSS = `
* { color: transparent !important; text-shadow: none !important; -webkit-text-stroke: 0 !important; }
svg text, svg tspan { fill: transparent !important; stroke: transparent !important; }
#reel-caption, [data-reel-overlay] { display: none !important; }
.badge, .chip { visibility: hidden !important; }`;

// "Toà thành *600 năm* tuổi" → từ giữa dấu * tô vàng; không có dấu * thì tô các con số
function titleHtml(title) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  if (title.includes('*')) return esc(title).replace(/\*([^*]+)\*/g, '<b>$1</b>');
  return esc(title).replace(/(\d[\d.,]*\s*(?:%|triệu|tỷ|nghìn|năm|giờ)?)/gi, '<b>$1</b>');
}

async function cleanFrames(browser, project, dir, only) {
  const frames = [];
  for (const scene of project.cfg.scenes) {
    if (scene.generated || (only && scene.id !== only)) continue;
    const timing = await sceneTiming(project, scene, { log: () => {} });
    const page = await openScene(browser, project, scene, timing, { quiet: true });
    // gần cuối cảnh: mọi thứ đã hiện đủ (bảng trắng: vẽ xong, đã tô màu, tay đã rút ra)
    await page.evaluate((x) => window.__seek(x), Math.max(0, timing.duration - 0.35));
    await page.addStyleTag({ content: CLEAN_CSS });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const file = path.join(dir, `bg-${scene.id}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
    await page.close();
    frames.push({ scene: scene.id, file });
  }
  return frames;
}

function pageHtml({ bg, title, kicker, width, height, vertical }) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@900&display=block" rel="stylesheet">
<style>
  html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#000}
  .bg{position:absolute;inset:0;background:url("${bg}") center/cover;transform:scale(1.04)}
  .shade{position:absolute;inset:0;background:${vertical
    ? 'linear-gradient(180deg,rgba(0,0,0,.15) 0%,rgba(0,0,0,.55) 45%,rgba(0,0,0,.75) 70%,rgba(0,0,0,.2) 100%)'
    : 'linear-gradient(90deg,rgba(0,0,0,.82) 0%,rgba(0,0,0,.55) 48%,rgba(0,0,0,0) 78%)'}}
  .box{position:absolute;${vertical ? 'left:70px;right:160px;top:620px;height:640px' : 'left:56px;top:56px;width:760px;bottom:56px'};
    display:flex;flex-direction:column;justify-content:center;gap:18px}
  .kicker{align-self:flex-start;background:#ff2d3d;color:#fff;font:900 ${vertical ? 44 : 34}px 'Be Vietnam Pro',sans-serif;
    padding:8px 20px;border-radius:10px;text-transform:uppercase;letter-spacing:.04em}
  h1{margin:0;font:900 140px/1.02 'Be Vietnam Pro',sans-serif;text-transform:uppercase;color:#fff;
    -webkit-text-stroke:.12em #000;paint-order:stroke fill;text-shadow:0 .06em 0 rgba(0,0,0,.4);overflow-wrap:break-word}
  h1 b{color:#ffe14a}
</style></head><body>
<div class="bg"></div><div class="shade"></div>
<div class="box">${kicker ? `<div class="kicker">${kicker}</div>` : ''}<h1>${title}</h1></div>
<script>
  // co chữ cho vừa khung: tối đa 4 dòng, không tràn
  document.fonts.ready.then(() => {
    const h = document.querySelector('h1'), box = document.querySelector('.box'), k = document.querySelector('.kicker');
    let size = ${vertical ? 150 : 132};
    // khối căn giữa nên tràn cả trên lẫn dưới: tự cộng chiều cao các phần thay vì dựa vào scrollHeight
    const used = () => h.getBoundingClientRect().height + (k ? k.getBoundingClientRect().height + 18 : 0);
    const fits = () => h.scrollWidth <= box.clientWidth && used() <= box.clientHeight
      && h.getBoundingClientRect().height / (size * 1.02) <= 4.2;
    h.style.fontSize = size + 'px';
    while (!fits() && size > 40) { size -= 4; h.style.fontSize = size + 'px'; }
    document.body.dataset.ready = '1';
  });
</script></body></html>`;
}

export async function makeThumbnails(project, { title, kicker, scene, count = 3, log = console.log } = {}) {
  const vertical = project.cfg.height > project.cfg.width;
  const [width, height] = vertical ? [1080, 1920] : [1280, 720];
  const dir = path.join(project.build, 'thumbnail');
  fs.mkdirSync(dir, { recursive: true });
  const outDir = path.dirname(path.resolve(project.root, project.cfg.output));
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await launchBrowser();
  try {
    log('  … chụp nền từ các cảnh');
    const frames = await cleanFrames(browser, project, dir, scene);
    if (!frames.length) throw new Error(scene ? `không có cảnh "${scene}"` : 'không có cảnh nào');
    const scores = JSON.parse(await run(path.join(HOME, '.venv', 'bin', 'python'), ['-I', path.join(HOME, 'tools', 'frame_score.py'), ...frames.map((f) => f.file)]));
    const picks = frames.sort((a, b) => scores[b.file] - scores[a.file]).slice(0, Math.max(1, count));

    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const files = [];
    for (const [i, f] of picks.entries()) {
      const html = path.join(dir, `thumb-${i + 1}.html`);
      fs.writeFileSync(html, pageHtml({ bg: pathToFileURL(f.file).href, title: titleHtml(title), kicker, width, height, vertical }));
      await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle0' });
      await page.waitForSelector('body[data-ready="1"]', { timeout: 15_000 });
      const out = path.join(outDir, `thumbnail-${i + 1}.jpg`);
      await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
      files.push({ file: out, scene: f.scene, score: scores[f.file] });
    }
    await page.close();
    fs.copyFileSync(files[0].file, path.join(outDir, 'thumbnail.jpg'));
    return { files, size: `${width}×${height}` };
  } finally {
    await browser.close();
  }
}
