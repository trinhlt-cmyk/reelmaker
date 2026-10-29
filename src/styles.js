// Phong cách riêng: lưu một project ưng ý thành mẫu (~/.reelmaker/styles/<tên>/) để làm video mới giống vậy.
// Giữ: cài đặt video.json (giọng, tốc độ, nhạc, phụ đề, chuyển cảnh, khung…), shared.css, thư viện JS, cảnh mẫu,
// ảnh/nhạc không thuộc chủ đề (nhạc nền, logo, bàn tay). Bỏ: build/, out/, review/, ảnh ứng viên, ảnh chủ đề.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCredits } from './credits.js';

export const STYLES_DIR = path.join(os.homedir(), '.reelmaker', 'styles');
const SKIP = new Set(['build', 'out', 'review', 'credits.json', 'script-options.md']);

export function listStyles() {
  if (!fs.existsSync(STYLES_DIR)) return [];
  return fs.readdirSync(STYLES_DIR).filter((n) => fs.existsSync(path.join(STYLES_DIR, n, 'video.json'))).map((name) => {
    const dir = path.join(STYLES_DIR, name);
    const v = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
    const md = fs.existsSync(path.join(dir, 'STYLE.md')) ? fs.readFileSync(path.join(dir, 'STYLE.md'), 'utf8') : '';
    const desc = md.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '';
    return { name, dir, base: v.style ?? 'default', size: `${v.width}×${v.height}`, voice: v.voice, description: desc.trim() };
  });
}

export function styleDir(name) {
  const dir = path.join(STYLES_DIR, name);
  return fs.existsSync(path.join(dir, 'video.json')) ? dir : null;
}

export function saveStyle(project, name, { description = '', force = false } = {}) {
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(name)) throw new Error('tên mẫu: chữ thường không dấu, số, gạch ngang (vd kenh-khoa-hoc)');
  if (['default', 'whiteboard', 'news', 'meme', 'map', 'engraving', 'vox', 'math', 'listening', 'metro'].includes(name)) throw new Error(`"${name}" là kiểu có sẵn, chọn tên khác`);
  const dest = path.join(STYLES_DIR, name);
  if (fs.existsSync(dest) && !force) throw new Error(`đã có mẫu "${name}": thêm --force để ghi đè`);
  fs.rmSync(dest, { recursive: true, force: true });

  // ảnh/video lấy theo chủ đề (có trong credits.json) thì bỏ, trừ nhạc nền — nhạc là một phần của phong cách
  const credits = readCredits(project);
  const topical = new Set(credits.filter((c) => c.kind !== 'music').map((c) => path.normalize(c.file)));
  const kept = [];
  const skipped = [];
  // file trong assets/ chỉ giữ khi được dùng (tên xuất hiện trong cảnh, css, js hoặc video.json)
  const used = [];
  const scan = (rel) => {
    for (const e of fs.readdirSync(path.join(project.root, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory() && !SKIP.has(r) && r !== 'assets') scan(r);
      else if (/\.(html|css|js|json)$/.test(e.name) && !SKIP.has(r)) used.push(fs.readFileSync(path.join(project.root, r), 'utf8'));
    }
  };
  scan('');
  const referenced = (r) => !r.startsWith(`assets${path.sep}`) || used.some((txt) => txt.includes(path.basename(r)));
  const copy = (rel) => {
    const src = path.join(project.root, rel);
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.name.startsWith('.') || SKIP.has(r) || r === path.join('assets', 'candidates')) continue;
      if (e.isDirectory()) {
        fs.mkdirSync(path.join(dest, r), { recursive: true });
        copy(r);
      } else if (topical.has(path.normalize(r)) || !referenced(r)) {
        skipped.push(r);
      } else {
        fs.copyFileSync(path.join(src, e.name), path.join(dest, r));
        kept.push(r);
      }
    }
  };
  fs.mkdirSync(dest, { recursive: true });
  copy('');
  const music = credits.filter((c) => c.kind === 'music');
  if (music.length) fs.writeFileSync(path.join(dest, 'credits.json'), JSON.stringify(music, null, 2) + '\n');

  const v = JSON.parse(fs.readFileSync(path.join(dest, 'video.json'), 'utf8'));
  v.styleName = name;
  fs.writeFileSync(path.join(dest, 'video.json'), JSON.stringify(v, null, 2) + '\n');
  const md = path.join(dest, 'STYLE.md');
  if (!fs.existsSync(md)) {
    fs.writeFileSync(md, `# ${name}

${description || 'Mẫu riêng lưu từ video "' + (v.title ?? path.basename(project.root)) + '".'}

Dựa trên kiểu: ${v.style ?? 'default'} · ${v.width}×${v.height} · giọng ${v.voice ?? '(mặc định)'} ${v.rate ?? ''}
Nhạc nền: ${music[0] ? `${music[0].title} — ${music[0].author}` : 'không'} · phụ đề: ${v.captionStyle ?? 'line'} · chuyển cảnh: ${v.transition ?? 'fade'}${v.beatSync ? ' · cắt theo nhịp' : ''}

## Quy tắc của kênh
- (Claude ghi ở đây những gì người dùng đã chọn/góp ý: màu, cỡ chữ, cách mở đầu, độ dài, câu kết…)

## Cảnh mẫu
Các file trong scenes/ là cảnh của video gốc: giữ bố cục, thay nội dung.
`);
  }
  return { dest, kept, skipped };
}
