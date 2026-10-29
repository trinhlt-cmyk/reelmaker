// reelmaker lottie: lấy một hoạt hình Lottie (.json / .lottie / đường dẫn https) vào project.
// Ghi assets/lottie/<tên>.js (dữ liệu nạp bằng <script>, có ngay khi trang mở), chép lib/lottie.min.js +
// lib/reel-lottie.js vào project và ghi nguồn vào credits.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './exec.js';
import { readCredits } from './credits.js';

const HOME = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function readSource(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`không tải được ${src} (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reel-lottie-')), path.basename(new URL(src).pathname) || 'a.json');
    fs.writeFileSync(tmp, buf);
    return readSource(tmp);
  }
  if (!fs.existsSync(src)) throw new Error(`không thấy ${src}`);
  if (src.endsWith('.lottie')) {
    // .lottie (dotLottie) là file zip: manifest.json + animations/<id>.json
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-lottie-'));
    await run('unzip', ['-q', '-o', src, '-d', dir]);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const id = manifest.animations?.[0]?.id;
    return JSON.parse(fs.readFileSync(path.join(dir, 'animations', `${id}.json`), 'utf8'));
  }
  return JSON.parse(fs.readFileSync(src, 'utf8'));
}

export async function addLottie(project, src, { name, author, license, page } = {}) {
  const data = await readSource(src);
  for (const k of ['fr', 'ip', 'op', 'w', 'h', 'layers']) if (data[k] === undefined) throw new Error(`không phải file Lottie (thiếu "${k}")`);
  // ảnh nhúng ngoài file (assets có "u"/"p" trỏ ra ngoài) không dùng được khi tách khỏi thư mục gốc
  const external = (data.assets ?? []).filter((a) => a.p && !String(a.p).startsWith('data:') && !a.layers);
  if (external.length) throw new Error(`hoạt hình dùng ${external.length} ảnh để ngoài file: tải bản .lottie hoặc .json "embedded" từ LottieFiles`);
  name ??= path.basename(src).replace(/\.(json|lottie)$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hoat-hinh';

  const dir = path.join(project.root, 'assets', 'lottie');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${name}.js`);
  fs.writeFileSync(out, `(window.LOTTIE = window.LOTTIE || {})[${JSON.stringify(name)}] = ${JSON.stringify(data)};\n`);
  fs.mkdirSync(path.join(project.root, 'lib'), { recursive: true });
  for (const f of ['lottie.min.js', 'reel-lottie.js']) fs.copyFileSync(path.join(HOME, 'lib', f), path.join(project.root, 'lib', f));

  const rel = path.relative(project.root, out);
  const credits = readCredits(project).filter((c) => c.file !== rel);
  credits.push({
    file: rel, kind: 'animation', title: data.nm || name, author: author ?? 'LottieFiles', source: 'lottie',
    license: license ?? 'Lottie Simple License', licenseUrl: license ? null : 'https://lottiefiles.com/page/license',
    page: page ?? (/^https?:/.test(src) ? src : null), attributionRequired: Boolean(author),
  });
  fs.writeFileSync(path.join(project.root, 'credits.json'), JSON.stringify(credits, null, 2) + '\n');
  return { name, file: rel, w: data.w, h: data.h, fps: data.fr, frames: data.op - data.ip, seconds: (data.op - data.ip) / data.fr };
}
