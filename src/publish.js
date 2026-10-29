// Bộ để đăng: out/dang/ = video cho từng nền tảng (ngang YouTube, dọc TikTok/Reels/Shorts), ảnh bìa, phụ đề SRT,
// mo-ta.txt (tiêu đề, mô tả, mốc chương, hashtag, ghi nguồn bắt buộc).
import fs from 'node:fs';
import path from 'node:path';
import { run, mediaDuration } from './exec.js';
import { readCredits } from './credits.js';
import { sceneStarts } from './studio.js';

export const PLATFORMS = {
  youtube: { label: 'YouTube', w: 1920, h: 1080, maxMb: null },
  shorts: { label: 'YouTube Shorts', w: 1080, h: 1920, maxMb: null, maxSec: 180 },
  tiktok: { label: 'TikTok', w: 1080, h: 1920, maxMb: 287, maxSec: 600 },
  reels: { label: 'Instagram/Facebook Reels', w: 1080, h: 1920, maxMb: 250, maxSec: 180 },
  facebook: { label: 'Facebook (ngang)', w: 1920, h: 1080, maxMb: 1000 },
  square: { label: 'Vuông (feed)', w: 1080, h: 1080, maxMb: null },
};

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// Đổi khung: cùng tỉ lệ thì giữ; khác tỉ lệ thì đặt video giữa khung, nền là chính video phóng to làm mờ
async function reframe(src, out, w, h, maxMb, seconds) {
  const probe = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src]);
  const [sw, sh] = probe.trim().split(',').map(Number);
  const same = Math.abs(sw / sh - w / h) < 0.01;
  const vf = same
    ? `scale=${w}:${h}:flags=lanczos,format=yuv420p`
    : `split[a][b];[a]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=28,eq=brightness=-0.08[bg];`
      + `[b]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p`;
  // nén vừa giới hạn dung lượng (chừa 8% cho tiếng + đệm); không giới hạn thì giữ chất lượng cao
  const rate = maxMb ? Math.floor(((maxMb * 8 * 1024 * 0.92) / seconds) - 192) : null;
  const vcodec = rate && rate < 12000
    ? ['-c:v', 'libx264', '-preset', 'slow', '-b:v', `${rate}k`, '-maxrate', `${rate}k`, '-bufsize', `${rate * 2}k`]
    : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18'];
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, ...(same ? ['-vf', vf] : ['-filter_complex', vf]),
    ...vcodec, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  return { reframed: !same };
}

function description(project, { title, starts, credits, hashtags, total }) {
  const lines = [title, ''];
  // lời đọc viết số bằng chữ cho giọng đọc → mô tả dùng chữ số như phụ đề (srtReplace)
  const digits = (text) => Object.entries(project.cfg.srtReplace ?? {}).sort((x, y) => y[0].length - x[0].length)
    .reduce((t, [from, to]) => t.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), to), text);
  const narr = project.cfg.scenes.filter((s) => s.narration).map((s) => digits(s.narration));
  if (project.cfg.description) lines.push(project.cfg.description, '');
  else if (narr.length) lines.push(narr.slice(0, 2).join(' '), '');
  // mốc chương YouTube: bắt đầu 0:00, ≥ 3 chương, mỗi chương ≥ 10 giây (không đủ thì bỏ)
  const chapters = project.cfg.scenes
    .map((s, i) => ({ t: starts[i]?.start ?? 0, label: s.chapter }))
    .filter((c) => c.label);
  const ok = chapters.length >= 3 && chapters[0].t < 0.5 && chapters.every((c, i) => (chapters[i + 1]?.t ?? total) - c.t >= 10);
  if (ok) lines.push('Mốc thời gian:', ...chapters.map((c, i) => `${i === 0 ? '0:00' : mmss(c.t)} ${c.label}`), '');
  const needs = credits.filter((c) => c.attributionRequired !== false || c.kind === 'music');
  const map = project.cfg.scenes.some((s) => s.map) || fs.existsSync(path.join(project.root, 'map.js'));
  if (needs.length || map) {
    lines.push('Nguồn:');
    for (const c of needs) {
      const kind = { music: 'Nhạc', video: 'Video', animation: 'Hoạt hình' }[c.kind] ?? 'Ảnh';
      const name = c.title.length > 60 || /, .*, /.test(c.title) ? '' : `"${c.title.replace(/ \(ISRC [^)]+\)/, '')}" - `;
      lines.push(`${kind}: ${name}${c.author}${c.kind === 'music' && /MacLeod/.test(c.author) ? ' (incompetech.com)' : ''}, ${c.license}`);
    }
    if (map) lines.push('Bản đồ: © OpenStreetMap contributors');
    lines.push('');
  }
  if (hashtags.length) lines.push(hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' '));
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export async function publish(project, { platforms, maxMb, log = console.log } = {}) {
  const src = path.resolve(project.root, project.cfg.output);
  if (!fs.existsSync(src)) throw new Error('chưa có video: reelmaker render trước');
  const outDir = path.join(path.dirname(src), 'dang');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const seconds = await mediaDuration(src);
  const vertical = project.cfg.height > project.cfg.width;
  const square = project.cfg.height === project.cfg.width;
  const targets = platforms ?? (square ? ['square', 'reels'] : vertical ? ['tiktok', 'shorts', 'reels'] : ['youtube', 'tiktok']);
  const files = [];
  const notes = [];
  for (const name of targets) {
    const p = PLATFORMS[name];
    if (!p) throw new Error(`không biết nền tảng "${name}" (có: ${Object.keys(PLATFORMS).join(', ')})`);
    if (p.maxSec && seconds > p.maxSec) notes.push(`${p.label}: video ${Math.round(seconds)}s dài hơn giới hạn ${p.maxSec}s`);
    const out = path.join(outDir, `video-${name}.mp4`);
    log(`  … ${p.label} ${p.w}×${p.h}`);
    const { reframed } = await reframe(src, out, p.w, p.h, maxMb ?? p.maxMb, seconds);
    const mb = fs.statSync(out).size / 1048576;
    files.push({ platform: p.label, file: out, mb: Number(mb.toFixed(1)), reframed });
  }

  for (const f of ['thumbnail.jpg', 'video.srt']) {
    const s = path.join(path.dirname(src), f);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(outDir, f === 'thumbnail.jpg' ? 'anh-bia.jpg' : f));
    else notes.push(f === 'thumbnail.jpg' ? 'chưa có ảnh bìa: reelmaker thumbnail <thư mục> --title "…"' : 'chưa có phụ đề: reelmaker srt <thư mục>');
  }
  const starts = await sceneStarts(project);
  const text = description(project, {
    title: project.cfg.title ?? path.basename(project.root), starts, credits: readCredits(project),
    hashtags: project.cfg.hashtags ?? [], total: seconds,
  });
  fs.writeFileSync(path.join(outDir, 'mo-ta.txt'), text);
  return { outDir, files, notes, description: text };
}
