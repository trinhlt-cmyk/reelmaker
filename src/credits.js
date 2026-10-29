// Nguồn ảnh/video của project (credits.json) và cảnh ghi nguồn tự thêm vào cuối video.
import fs from 'node:fs';
import path from 'node:path';

export function readCredits(project) {
  const file = path.join(project.root, 'credits.json');
  if (!fs.existsSync(file)) return [];
  // bỏ các mục mà file đã bị xoá hay thay tên, và ghi mỗi nguồn một lần (mục sau thắng)
  const byOrigin = new Map();
  for (const c of JSON.parse(fs.readFileSync(file, 'utf8'))) {
    if (fs.existsSync(path.join(project.root, c.file))) byOrigin.set((c.page || c.file).toLowerCase(), c);
  }
  return [...byOrigin.values()];
}

// Trang HTML của cảnh ghi nguồn cuối video (build/credits.html), dựng từ credits.json.
export function creditsPage(project, credits) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const host = (u) => (u ? new URL(u).host.replace(/^www\./, '') : '');
  const rows = credits
    .map((c, i) => `<li class="fade-up" style="animation-delay:${(0.3 + i * 0.12).toFixed(2)}s">
      <span>${{ video: 'Video', music: 'Nhạc' }[c.kind] ?? 'Ảnh'}:</span> ${esc(c.title)} — <b>${esc(c.author)}</b>
      <em>${esc(c.license)} · ${esc(host(c.page))}</em></li>`)
    .join('');
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Nguồn ảnh</title>
<link rel="stylesheet" href="../shared.css">
<style>
  /* nền riêng cho cảnh này: mẫu tin nóng có nền đen, mẫu bảng trắng có nền giấy */
  body { background: var(--bg, var(--paper, #14161c)); color: var(--fg, var(--ink, #fff)); }
  /* video dọc: tránh vùng nút của TikTok/Reels (trên 150px, dưới 480px, trái 60px, phải 140px) */
  @media (max-aspect-ratio: 1/1) {
    .credits { inset: 170px 160px 500px 70px !important; }
    h2 { font-size: 54px !important; }
  }
  .credits { position: absolute; inset: 9% 8%; display: flex; flex-direction: column; justify-content: center; }
  h2 { font-size: 64px; font-weight: 800; margin-bottom: 36px; }
  ul { list-style: none; display: flex; flex-direction: column; gap: 18px; }
  li { font-size: ${credits.length > 6 ? 26 : 32}px; line-height: 1.35; color: var(--fg); }
  li span { color: var(--fg); font-weight: 800; }
  li em { display: block; font-style: normal; font-size: .8em; color: var(--muted); }
</style></head>
<body><div class="credits"><h2 class="fade-up">Nguồn ${credits.some((c) => c.kind === 'music') ? 'hình ảnh và âm nhạc' : 'ảnh và video'}</h2><ul>${rows}</ul></div></body></html>
`;
}
