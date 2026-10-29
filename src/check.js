// reelmaker check: tìm lỗi trong các cảnh (bố cục chữ, font, hiệu ứng) và trong video cuối (hình, tiếng).
// Mỗi phát hiện: { level: 'error' | 'warn', scene, t, kind, message, still }.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './exec.js';
import { launchBrowser, openScene, sceneTiming } from './render.js';

const LUFS_TARGET = -14; // YouTube, TikTok, Reels chuẩn hoá về khoảng này

// Vùng các ứng dụng video dọc phủ nút/chữ lên (px ở khung 1080×1920).
const SAFE_9_16 = { top: 150, bottom: 480, left: 60, right: 140 };

// ---------------------------------------------------------------- trong trang

// Chạy trong trang: liệt kê mọi đoạn chữ đang hiện (độ mờ thật ≥ 0.5) với khung của từng dòng.
function collectText() {
  const opacityOf = (el) => {
    let o = 1;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden') return 0;
      o *= parseFloat(s.opacity);
    }
    return o;
  };
  const describe = (el, text) => {
    const tag = el.tagName.toLowerCase();
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : '';
    return `${tag}${el.id ? `#${el.id}` : cls} "${text.length > 32 ? `${text.slice(0, 30)}…` : text}"`;
  };
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue.replace(/\s+/g, ' ').trim();
    const el = node.parentElement;
    if (!text || !el || el.closest('script, style')) continue;
    const caption = el.id === 'reel-caption';
    if (opacityOf(el) < 0.5) continue;
    let rects;
    if (el instanceof SVGElement) rects = [el.getBoundingClientRect()];
    else {
      const range = document.createRange();
      range.selectNodeContents(node);
      rects = [...range.getClientRects()];
    }
    rects = rects.filter((r) => r.width > 1 && r.height > 1).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }));
    if (!rects.length) continue;
    const s = getComputedStyle(el);
    const color = el instanceof SVGElement && s.fill && s.fill !== 'none' ? s.fill : s.color;
    // chữ có viền đậm (kiểu phụ đề TikTok) luôn đọc được trên mọi nền: không đo tương phản
    const stroked = parseFloat(s.webkitTextStrokeWidth || '0') >= 4;
    texts.push({ desc: describe(el, text), text, rects, color, caption, stroked, fontSize: parseFloat(s.fontSize) });
  }
  return texts;
}

// Chạy trong trang: hiệu ứng (có hữu hạn lần lặp) còn chạy sau thời điểm `limit` giây.
function lateAnimations(limit) {
  return document
    .getAnimations()
    .map((a) => ({ a, end: a.effect?.getComputedTiming().endTime }))
    .filter(({ end }) => Number.isFinite(end) && end > limit * 1000)
    // chuyển động nền chạy đều suốt cảnh (zoom chậm, trôi, đẩy vào) cố ý kéo tới hết cảnh
    .filter(({ a }) => !(a.effect.getComputedTiming().delay < 300 && a.effect.getKeyframes?.()[0]?.easing === 'linear'))
    .map(({ a, end }) => {
      const el = a.effect.target;
      const name = a.animationName ?? a.id ?? 'animation';
      const who = el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : el.classList?.[0] ? `.${el.classList[0]}` : ''}` : '?';
      return { who, name, end: end / 1000 };
    });
}

// Chạy trong trang: đo ảnh nền (đã ẩn chữ) dưới từng khung chữ.
// busy = tỉ lệ điểm ảnh có cạnh sắc (đường kẻ, hình) dưới chữ; lum = độ sáng trung bình của nền.
async function measureBackground(dataUrl, boxes) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const frame = (() => {
    // độ lệch độ sáng của cả khung, để biết khung có trống trơn không
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    let sum = 0;
    let sq = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 16) {
      const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += y;
      sq += y * y;
      n++;
    }
    return { std: Math.sqrt(sq / n - (sum / n) ** 2) };
  })();
  const results = boxes.map(({ x, y, w, h }) => {
    // thu vào vài px để không tính viền của chính hộp chữ
    const x0 = Math.max(0, Math.round(x + 4));
    const y0 = Math.max(0, Math.round(y + 4));
    const x1 = Math.min(img.width, Math.round(x + w - 4));
    const y1 = Math.min(img.height, Math.round(y + h - 4));
    if (x1 - x0 < 3 || y1 - y0 < 3) return null;
    const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const W = x1 - x0;
    let edges = 0;
    let total = 0;
    let lum = 0;
    for (let i = 0; i < d.length; i += 4) {
      lum += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
      const right = i + 4;
      const below = i + W * 4;
      if ((i / 4) % W < W - 1 && below < d.length) {
        const diff =
          Math.abs(d[i] - d[right]) + Math.abs(d[i + 1] - d[right + 1]) + Math.abs(d[i + 2] - d[right + 2]) +
          Math.abs(d[i] - d[below]) + Math.abs(d[i + 1] - d[below + 1]) + Math.abs(d[i + 2] - d[below + 2]);
        if (diff > 60) edges++;
        total++;
      }
    }
    return { busy: total ? edges / total : 0, lum: lum / (d.length / 4) };
  });
  return { frame, results };
}

const HIDE_TEXT_CSS = `
* { color: transparent !important; text-shadow: none !important; -webkit-text-stroke: 0 !important; }
svg text, svg tspan { fill: transparent !important; stroke: transparent !important; }
#reel-caption { display: none !important; }
[data-reel-overlay] { visibility: hidden !important; opacity: 0 !important; }`; /* opacity: lớp mix-blend-mode vẫn hiện dù visibility hidden */

// ---------------------------------------------------------------- hình học, màu

const area = (r) => r.w * r.h;
function intersect(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
function union(rects) {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
}
function luminance(css) {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  if (a < 0.5) return null;
  const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

// ---------------------------------------------------------------- một cảnh

// Font dùng thật cho từng đoạn chữ (CDP): chữ nào phải mượn font dự phòng (thiếu dấu tiếng Việt…).
async function fontProblems(page) {
  const cdp = await page.createCDPSession();
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const textNodes = [];
  const walk = (n, parent) => {
    if (n.nodeType === 3 && n.nodeValue.trim() && !['SCRIPT', 'STYLE', 'TITLE'].includes(parent?.nodeName)) {
      textNodes.push({ node: n, parent });
    }
    for (const c of n.children ?? []) walk(c, n);
    if (n.contentDocument) walk(n.contentDocument, n);
  };
  walk(root, null);
  const problems = [];
  for (const { node, parent } of textNodes) {
    let fonts;
    try {
      ({ fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: parent.nodeId }));
    } catch {
      continue;
    }
    if (fonts.length > 1) {
      const main = fonts.reduce((a, b) => (b.glyphCount > a.glyphCount ? b : a));
      // "Be Vietnam Pro" và "Be Vietnam Pro ExtraBold" là một họ font, chỉ khác độ đậm
      const base = (name) => name.replace(/\s+(Thin|ExtraLight|Light|Regular|Medium|SemiBold|Bold|ExtraBold|Black)$/i, '');
      const sameFamily = (f) => base(f.familyName) === base(main.familyName);
      let others = fonts.filter((f) => !sameFamily(f));
      // số đếm gồm cả chữ trong thẻ con: font mà một thẻ con chọn có chủ đích (vd <small> khác font) không phải mượn
      if (others.length) {
        const chosen = new Set();
        const kids = [];
        const collect = (n) => (n.children ?? []).forEach((c) => (c.nodeType === 1 ? (kids.push(c), collect(c)) : null));
        collect(parent);
        for (const k of kids) {
          const { computedStyle } = await cdp.send('CSS.getComputedStyleForNode', { nodeId: k.nodeId }).catch(() => ({ computedStyle: [] }));
          const family = computedStyle.find((p) => p.name === 'font-family')?.value.split(',')[0].trim().replace(/^["']|["']$/g, '');
          if (family) chosen.add(base(family));
        }
        others = others.filter((f) => !chosen.has(base(f.familyName)));
      }
      others = others.map((f) => `${f.familyName} (${f.glyphCount} ký tự)`);
      if (!others.length) continue;
      const text = node.nodeValue.trim().slice(0, 30);
      problems.push(`"${text}" trộn font: chủ yếu ${main.familyName}, mượn ${others.join(', ')}`);
    }
  }
  await cdp.detach();
  return [...new Set(problems)];
}

async function checkScene(browser, project, scene, { stillDir }) {
  const { width, height } = project.cfg;
  const timing = await sceneTiming(project, scene, { log: () => {} });
  const page = await openScene(browser, project, scene, timing, { quiet: true });
  const findings = [];
  const seen = new Set();
  const add = async (level, t, kind, message, key = message) => {
    if (seen.has(`${kind}|${key}`)) return;
    seen.add(`${kind}|${key}`);
    let still = null;
    if (level === 'error' && stillDir) {
      still = path.join(stillDir, `${scene.id}@${t.toFixed(2)}s.png`);
      if (!fs.existsSync(still)) await page.screenshot({ path: still, type: 'png' });
    }
    findings.push({ level, scene: scene.id, t, kind, message, still });
  };

  for (const e of page.reelErrors) await add('error', 0, 'js', `lỗi JavaScript: ${e}`);

  const late = await page.evaluate(lateAnimations, timing.duration - 0.3);
  for (const a of late) {
    await add('warn', a.end, 'late', `hiệu ứng ${a.name} của ${a.who} kết thúc lúc ${a.end.toFixed(1)}s, sát/sau khi hết cảnh (${timing.duration.toFixed(1)}s)`, a.who + a.name);
  }

  const times = [0.3];
  for (let t = 0.5; t < timing.duration - 0.1; t += 0.5) times.push(Number(t.toFixed(2)));
  times.push(Number((timing.duration - 0.05).toFixed(2)));
  const vertical = height > width;
  const k = height / 1920;
  const safe = vertical && {
    x: SAFE_9_16.left * k, y: SAFE_9_16.top * k,
    w: width - (SAFE_9_16.left + SAFE_9_16.right) * k, h: height - (SAFE_9_16.top + SAFE_9_16.bottom) * k,
  };

  for (const t of times) {
    await page.evaluate((x) => window.__seek(x), t);
    const texts = await page.evaluate(collectText);
    const caption = texts.find((x) => x.caption);
    const body = texts.filter((x) => !x.caption);

    // nền dưới chữ: chụp khung với chữ đã ẩn
    const style = await page.addStyleTag({ content: HIDE_TEXT_CSS });
    const shot = await page.screenshot({ type: 'png', encoding: 'base64' });
    await style.evaluate((el) => el.remove());
    await page.evaluate((x) => window.__seek(x), t);
    const boxes = body.map((x) => union(x.rects));
    const { frame, results } = await page.evaluate(measureBackground, `data:image/png;base64,${shot}`, boxes);

    if (t === 0.3 && body.length === 0 && frame.std < 3) {
      await add('error', t, 'blank', 'cảnh trống trơn ở 0.3s: nên có gì đó hiện ngay từ đầu');
    }

    for (const [i, x] of body.entries()) {
      const box = boxes[i];
      // tràn khung
      const out = Math.max(-box.x, -box.y, box.x + box.w - width, box.y + box.h - height);
      if (out > 2) await add('error', t, 'offscreen', `${x.desc} tràn ra ngoài khung ${Math.round(out)}px`, x.desc);
      // vùng nút của app (video dọc)
      if (safe && out <= 2) {
        const inside = intersect(box, safe) / area(box);
        if (inside < 0.98) await add('error', t, 'safezone', `${x.desc} nằm trong vùng bị nút TikTok/Reels che`, x.desc);
      }
      // phụ đề che chữ
      if (caption) {
        const cap = union(caption.rects);
        const pad = { x: cap.x - 12, y: cap.y - 12, w: cap.w + 24, h: cap.h + 24 };
        if (x.rects.some((r) => intersect(r, pad) > 0)) {
          await add('error', t, 'caption', `phụ đề che ${x.desc}: dời chữ lên hoặc tắt phụ đề cảnh này`, x.desc);
        }
      }
      // chữ đè chữ: khung dòng chữ cao hơn nét chữ thật (chừa chỗ cho dấu tiếng Việt), nên thu mỗi khung
      // 15% chiều cao ở trên và dưới trước khi so
      const glyph = (r) => ({ x: r.x, y: r.y + r.h * 0.15, w: r.w, h: r.h * 0.7 });
      for (const y of body.slice(i + 1)) {
        const hit = x.rects.some((a) => y.rects.some((b) => intersect(glyph(a), glyph(b)) > 0.25 * Math.min(area(glyph(a)), area(glyph(b)))));
        if (hit) await add('error', t, 'overlap', `${x.desc} đè lên ${y.desc}`, x.desc + y.desc);
      }
      const bg = results[i];
      if (!bg) continue;
      // chữ đè lên hình (đường kẻ, hình vẽ dưới chữ)
      if (bg.busy > 0.03) {
        await add('warn', t, 'busy', `${x.desc} nằm đè lên hình/đường kẻ (${Math.round(bg.busy * 100)}% điểm ảnh có cạnh)`, x.desc);
      }
      // độ tương phản
      const fg = x.stroked ? null : luminance(x.color);
      if (fg !== null) {
        const c = contrast(fg, bg.lum);
        const min = x.fontSize >= 40 ? 3 : 4.5;
        if (c < min) await add('warn', t, 'contrast', `${x.desc} khó đọc: tương phản ${c.toFixed(1)}:1 (nên ≥ ${min}:1)`, x.desc);
      }
    }

    if (caption) {
      const lines = Math.round(union(caption.rects).h / (caption.fontSize * 1.35));
      if (lines > 2) await add('warn', t, 'caption-lines', `phụ đề dài ${lines} dòng: "${caption.text.slice(0, 40)}…" (giảm captionMaxWords)`, caption.text);
    }
  }

  await page.evaluate((x) => window.__seek(x), timing.duration - 0.05);
  for (const p of await fontProblems(page)) await add('error', timing.duration, 'font', p);

  await page.close();
  return { findings, duration: timing.duration };
}

// ---------------------------------------------------------------- video cuối

async function checkVideo(file, starts) {
  const findings = [];
  const where = (t) => {
    let i = starts.length - 1;
    while (i > 0 && starts[i].start > t) i--;
    return { scene: starts[i].id, t: t - starts[i].start };
  };
  const add = (level, t, kind, message) => findings.push({ level, ...where(t), at: t, kind, message });

  const log = await run('ffmpeg', [
    '-hide_banner', '-nostats', '-i', file,
    '-vf', 'blackdetect=d=0.2:pix_th=0.03,freezedetect=n=-60dB:d=4',
    // khoảng nghỉ giữa hai cảnh (đuôi + lead + phần lặng của giọng) thường ~2s: chỉ báo im lặng dài hơn thế
    '-af', 'silencedetect=n=-45dB:d=2.5,ebur128=peak=true:framelog=quiet',
    '-f', 'null', '-',
  ], { stderr: true });

  for (const m of log.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)) {
    add('error', +m[1], 'black', `khung hình đen ${(+m[2] - +m[1]).toFixed(1)}s`);
  }
  const freezes = [...log.matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_duration: ([\d.]+)/g)];
  for (const m of freezes) add('warn', +m[1], 'freeze', `hình đứng yên ${(+m[2]).toFixed(1)}s: thêm chuyển động nhẹ (zoom chậm, nhấn từ khoá)`);
  for (const m of log.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_duration: ([\d.]+)/g)) {
    add('warn', +m[1], 'silence', `im lặng ${(+m[2]).toFixed(1)}s`);
  }
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const lufs = parseFloat(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
  const peak = parseFloat(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
  const facts = { lufs, peak };
  if (Number.isFinite(lufs) && Math.abs(lufs - LUFS_TARGET) > 2) {
    findings.push({ level: 'warn', scene: null, kind: 'loudness', message: `âm lượng ${lufs.toFixed(1)} LUFS, nên ${LUFS_TARGET} ±2 cho YouTube/TikTok (nền tảng sẽ tự chỉnh, video ${lufs < LUFS_TARGET ? 'nghe nhỏ hơn' : 'bị giảm'} so với video khác)` });
  }
  if (Number.isFinite(peak) && peak > -1) {
    findings.push({ level: 'error', scene: null, kind: 'peak', message: `đỉnh âm ${peak.toFixed(1)} dBFS: có thể bị rè (nên ≤ -1)` });
  }
  return { findings, facts };
}

// ---------------------------------------------------------------- tổng

export async function check(project, { only = null, video = true, log = console.log } = {}) {
  const stillDir = path.join(project.build, 'check');
  fs.rmSync(stillDir, { recursive: true, force: true });
  fs.mkdirSync(stillDir, { recursive: true });
  const browser = await launchBrowser();
  const findings = [];
  const starts = [];
  let clock = 0;
  try {
    for (const scene of project.cfg.scenes) {
      starts.push({ id: scene.id, start: clock });
      if (only && !only.has(scene.id)) {
        clock += (await sceneTiming(project, scene, { log: () => {} })).duration;
        continue;
      }
      log(`  … cảnh ${scene.id}`);
      const r = await checkScene(browser, project, scene, { stillDir });
      clock += r.duration;
      findings.push(...r.findings);
    }
  } finally {
    await browser.close();
  }

  let facts = null;
  const file = path.resolve(project.root, project.cfg.output);
  if (video && fs.existsSync(file)) {
    log('  … video cuối');
    const r = await checkVideo(file, starts);
    findings.push(...r.findings);
    facts = { file, ...r.facts };
  }
  return { findings, facts, videoChecked: Boolean(facts) };
}

export function printReport(project, { findings, facts, videoChecked }) {
  const icon = { error: '✗', warn: '⚠' };
  const byScene = new Map();
  for (const f of findings) {
    const key = f.scene ?? '';
    if (!byScene.has(key)) byScene.set(key, []);
    byScene.get(key).push(f);
  }
  const lines = [];
  for (const scene of project.cfg.scenes) {
    const list = (byScene.get(scene.id) ?? []).sort((a, b) => a.t - b.t);
    lines.push(`\ncảnh ${scene.id}${list.length ? '' : '  ✓'}`);
    for (const f of list) {
      lines.push(`  ${icon[f.level]} ${f.t.toFixed(1).padStart(4)}s  ${f.message}${f.still ? `\n           ảnh: ${f.still}` : ''}`);
    }
  }
  const whole = byScene.get('') ?? [];
  if (videoChecked) {
    lines.push(`\nvideo cuối (${path.relative(project.root, facts.file)})${whole.length ? '' : '  ✓'}`);
    if (Number.isFinite(facts.lufs)) lines.push(`  · âm lượng ${facts.lufs.toFixed(1)} LUFS, đỉnh ${facts.peak.toFixed(1)} dBFS`);
    for (const f of whole) lines.push(`  ${icon[f.level]} ${f.message}`);
  } else {
    lines.push('\nvideo cuối: chưa render, bỏ qua (reelmaker render rồi check lại)');
  }
  const errors = findings.filter((f) => f.level === 'error').length;
  const warns = findings.length - errors;
  lines.push(`\n${errors ? '✗' : '✓'} ${errors} lỗi, ${warns} cảnh báo`);
  return lines.join('\n');
}
