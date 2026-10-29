// Ảnh và video có sẵn cho cảnh: tìm trên Wikimedia Commons (ảnh, không cần khoá) và Pixabay (ảnh + video,
// cần khoá miễn phí), tải bản xem trước về assets/candidates/<từ khoá>/, làm bảng ảnh để chọn,
// rồi lấy ảnh đã chọn vào assets/ và ghi nguồn vào credits.json.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { run } from './exec.js';
import { getKey } from './keys.js';
import { launchBrowser } from './render.js';
import { readCredits } from './credits.js';

// Wikimedia yêu cầu User-Agent có tên công cụ.
const UA = 'reelmaker/0.1 (local video tool; https://commons.wikimedia.org/wiki/Commons:API)';
// Chỉ nhận giấy phép cho phép dùng lại, kể cả thương mại.
export const FREE_LICENSE = /^(cc0|public domain|pd\b|pdm|cc[ -]by(-sa)?[ -]\d)/i;

export const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tim';
// bỏ cả phần bị ẩn (display:none) mà Commons chèn kèm, vd "Unknown author<span style=display:none>Unknown author</span>"
export const stripHtml = (s = '') => s.replace(/<(span|div)[^>]*display:\s*none[^>]*>[\s\S]*?<\/\1>/g, '')
  .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const hasVietnamese = (s) => /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pixabay trả 429 khi vượt giới hạn gọi (100 lần/phút): chờ theo Retry-After (hoặc tăng dần) rồi thử lại.
// Riêng khi Cloudflare của Pixabay bật kiểm tra chống bot (cf-mitigated: challenge) thì thử lại ngay không có
// ích: báo người dùng đợi vài phút.
async function fetchRetry(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.headers.get('cf-mitigated') === 'challenge') {
      throw new Error(`${new URL(url).host} đang tạm chặn máy này (kiểm tra chống bot của Cloudflare, thường do gọi dồn dập): đợi vài phút rồi thử lại`);
    }
    if ((res.status !== 429 && res.status !== 503) || attempt === 4) return res;
    const wait = Number(res.headers.get('retry-after')) * 1000 || 1500 * attempt;
    await sleep(Math.min(wait, 15_000));
  }
}

export async function getJson(url) {
  const res = await fetchRetry(url);
  if (!res.ok) throw new Error(`${new URL(url).host} trả lỗi ${res.status}`);
  return res.json();
}

export async function download(url, file) {
  const res = await fetchRetry(url);
  if (!res.ok) throw new Error(`tải ${new URL(url).host}${new URL(url).pathname.slice(0, 30)}… lỗi ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const fits = (w, h, orientation) =>
  orientation === 'vertical' ? h > w : orientation === 'horizontal' ? w >= h : true;

async function searchWikimedia(query, { count, orientation }) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6',
    gsrsearch: `${query} filetype:bitmap`, gsrlimit: String(Math.min(50, count * 4)),
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1920',
  });
  const data = await getJson(`https://commons.wikimedia.org/w/api.php?${params}`);
  const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  const out = [];
  for (const p of pages) {
    const i = p.imageinfo?.[0];
    const m = i?.extmetadata ?? {};
    const license = stripHtml(m.LicenseShortName?.value);
    if (!i || !/jpeg|png|webp/.test(i.mime) || i.width < 1200 || !FREE_LICENSE.test(license)) continue;
    if (!fits(i.width, i.height, orientation)) continue;
    out.push({
      source: 'wikimedia', kind: 'photo',
      title: p.title.replace(/^File:/, '').replace(/\.\w+$/, ''),
      author: stripHtml(m.Artist?.value) || 'không rõ',
      license, licenseUrl: m.LicenseUrl?.value ?? null, page: i.descriptionurl,
      width: i.width, height: i.height, preview: i.thumburl, full: i.thumburl, ext: path.extname(new URL(i.thumburl).pathname) || '.jpg',
      attributionRequired: !/^(cc0|public domain|pd\b|pdm)/i.test(license),
    });
    if (out.length >= count) break;
  }
  return out;
}

function pixabayKey() {
  const key = getKey('pixabay');
  if (!key) throw new Error('chưa có khoá Pixabay: chạy "reelmaker keys set pixabay" trong terminal');
  return key;
}

async function searchPixabay(query, { count, orientation, video }) {
  const params = new URLSearchParams({
    key: pixabayKey(), q: query, per_page: String(Math.max(3, Math.min(200, count))), safesearch: 'true',
    lang: hasVietnamese(query) ? 'vi' : 'en',
  });
  if (!video) {
    params.set('image_type', 'photo');
    if (orientation) params.set('orientation', orientation);
  }
  const data = await getJson(`https://pixabay.com/api/${video ? 'videos/' : ''}?${params}`);
  const license = 'Pixabay Content License';
  const common = { source: 'pixabay', license, licenseUrl: 'https://pixabay.com/service/license-summary/', attributionRequired: false };
  return (data.hits ?? [])
    .map((h) => {
      if (video) {
        const v = h.videos.large?.url ? h.videos.large : h.videos.medium;
        if (!fits(v.width, v.height, orientation)) return null;
        return {
          ...common, kind: 'video', title: h.tags, author: h.user, page: h.pageURL,
          width: v.width, height: v.height, duration: h.duration,
          preview: h.videos.medium.thumbnail || h.videos.small.thumbnail, full: v.url, ext: '.mp4',
        };
      }
      return {
        ...common, kind: 'photo', title: h.tags, author: h.user, page: h.pageURL,
        width: h.imageWidth, height: h.imageHeight, preview: h.largeImageURL, full: h.largeImageURL,
        ext: path.extname(new URL(h.largeImageURL).pathname) || '.jpg',
      };
    })
    .filter(Boolean)
    .slice(0, count);
}

// Bảng ảnh: mỗi ô có mã, nguồn, giấy phép, kích thước — để người dùng (hoặc Claude) chọn.
async function contactSheet(items, dir, file) {
  const cells = items
    .map((c) => `<figure><img src="${pathToFileURL(path.join(dir, c.previewFile)).href}">
      <b>${c.id}</b><figcaption>${c.source} · ${c.kind === 'video' ? `video ${c.duration}s · ` : ''}${c.width}×${c.height}<br>${c.license}</figcaption></figure>`)
    .join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:16px;background:#111;color:#eee;font:16px -apple-system,Arial;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;width:1260px}
    figure{margin:0;position:relative;background:#222;border-radius:8px;overflow:hidden}
    img{display:block;width:100%;height:240px;object-fit:cover}
    b{position:absolute;top:8px;left:8px;background:#ffb547;color:#111;padding:2px 10px;border-radius:6px;font-size:20px}
    figcaption{padding:8px 10px;color:#bbb;line-height:1.35}</style>${cells}`;
  const htmlFile = path.join(dir, 'sheet.html');
  fs.writeFileSync(htmlFile, html);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1292, height: 400 });
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: file, fullPage: true });
  } finally {
    await browser.close();
  }
}

export async function searchMedia(project, query, { source = 'all', video = false, count = 9, orientation, log = console.log } = {}) {
  orientation ??= project.cfg.height > project.cfg.width ? 'vertical' : 'horizontal';
  const slug = slugify(query);
  const dir = path.join(project.root, 'assets', 'candidates', slug);
  fs.mkdirSync(dir, { recursive: true });

  const found = [];
  const notes = [];
  let want = video ? ['pixabay'] : source === 'all' ? ['wikimedia', 'pixabay'] : [source];
  if (source === 'all' && !video && !getKey('pixabay')) {
    want = ['wikimedia'];
    notes.push('chưa có khoá Pixabay: chỉ tìm trên Wikimedia (thêm khoá: reelmaker keys set pixabay)');
  }
  if (video && source === 'wikimedia') notes.push('Wikimedia không có video ngắn dùng được: tìm trên Pixabay');
  for (const s of want) {
    try {
      const n = want.length > 1 ? Math.ceil(count / want.length) : count;
      found.push(...(s === 'wikimedia' ? await searchWikimedia(query, { count: n, orientation }) : await searchPixabay(query, { count: n, orientation, video })));
    } catch (e) {
      notes.push(`${s}: ${e.message}`);
    }
  }

  const items = [];
  for (const [i, c] of found.entries()) {
    const id = `${slug}-${i + 1}`;
    const previewFile = `${id}${c.kind === 'video' ? '.jpg' : c.ext}`;
    try {
      if (c.source === 'pixabay' && i > 0) await sleep(400); // giãn nhịp để không bị chặn
      await download(c.preview, path.join(dir, previewFile));
      items.push({ ...c, id, previewFile });
    } catch (e) {
      notes.push(`${id}: ${e.message}`);
    }
  }
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ query, items }, null, 2));
  let sheet = null;
  if (items.length) {
    sheet = path.join(dir, 'sheet.png');
    await contactSheet(items, dir, sheet);
  }
  return { items, sheet, notes };
}

function findCandidate(project, id) {
  const root = path.join(project.root, 'assets', 'candidates');
  for (const slug of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const index = path.join(root, slug, 'index.json');
    if (!fs.existsSync(index)) continue;
    const item = JSON.parse(fs.readFileSync(index, 'utf8')).items.find((c) => c.id === id);
    if (item) return { item, dir: path.join(root, slug) };
  }
  throw new Error(`không thấy "${id}" trong các lần tìm (assets/candidates/*/index.json)`);
}

// Lấy một ảnh/video đã tìm vào assets/<tên>, ghi nguồn vào credits.json.
export async function useMedia(project, id, name) {
  const { item, dir } = findCandidate(project, id);
  name = slugify(name || id);
  const out = path.join(project.root, 'assets', `${name}${item.kind === 'video' ? '.mp4' : item.ext.toLowerCase()}`);
  if (item.kind === 'video') {
    const raw = path.join(dir, `${id}.source.mp4`);
    if (!fs.existsSync(raw)) await download(item.full, raw);
    // bỏ tiếng, khung ≤ 1080p, keyframe dày để tua từng khung khi render được nhanh
    const { width, height } = project.cfg;
    await run('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', raw, '-an',
      '-vf', `scale='min(${width},iw)':'min(${height},ih)':force_original_aspect_ratio=decrease,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-g', '15', '-movflags', '+faststart', out,
    ]);
  } else {
    fs.copyFileSync(path.join(dir, item.previewFile), out);
  }
  const rel = path.relative(project.root, out);
  const credits = readCredits(project).filter((c) => c.file.toLowerCase() !== rel.toLowerCase());
  credits.push({
    file: rel, kind: item.kind, title: item.title, author: item.author, source: item.source,
    license: item.license, licenseUrl: item.licenseUrl, page: item.page, attributionRequired: item.attributionRequired,
  });
  fs.writeFileSync(path.join(project.root, 'credits.json'), JSON.stringify(credits, null, 2) + '\n');
  return { file: rel, item };
}
