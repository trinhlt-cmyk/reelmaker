// Nhạc nền: tìm trên Wikimedia Commons (nhạc giấy phép CC / public domain, nhiều bài của Kevin MacLeod, Jason Shaw),
// tải về assets/candidates/music-<từ khoá>/, cắt đoạn nghe thử 20 giây, ghép thành một file để nghe lần lượt,
// rồi lấy bài đã chọn vào assets/ và gắn vào video.json + credits.json.
import fs from 'node:fs';
import path from 'node:path';
import { run, mediaDuration } from './exec.js';
import { FREE_LICENSE, slugify, stripHtml, getJson, download } from './media.js';
import { readCredits } from './credits.js';

const MIN_SECONDS = 40; // ngắn hơn thường là tiếng mẫu, không phải bài nhạc
const MAX_SECONDS = 600;
const MAX_BYTES = 60e6;
const PREVIEW_SECONDS = 20;

async function searchCommonsAudio(query, count) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6',
    gsrsearch: `${query} filetype:audio`, gsrlimit: '50',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata',
  });
  const data = await getJson(`https://commons.wikimedia.org/w/api.php?${params}`);
  const out = [];
  for (const p of Object.values(data.query?.pages ?? {}).sort((a, b) => a.index - b.index)) {
    const i = p.imageinfo?.[0];
    const m = i?.extmetadata ?? {};
    const license = stripHtml(m.LicenseShortName?.value);
    const seconds = i?.duration ?? 0;
    if (!i || seconds < MIN_SECONDS || seconds > MAX_SECONDS || i.size > MAX_BYTES || !FREE_LICENSE.test(license)) continue;
    // bỏ ghi âm giọng nói (phát âm, bài đọc, podcast)
    if (/^LL-Q|spoken|wikipedia|audiobook|podcast|episode|speech|interview/i.test(p.title)) continue;
    out.push({
      source: 'wikimedia', kind: 'music',
      title: p.title.replace(/^File:/, '').replace(/\.\w+$/, ''),
      author: stripHtml(m.Artist?.value) || 'không rõ',
      license, licenseUrl: m.LicenseUrl?.value ?? null, page: i.descriptionurl,
      seconds: Math.round(seconds), url: i.url, ext: path.extname(new URL(i.url).pathname).toLowerCase() || '.ogg',
      attributionRequired: !/^(cc0|public domain|pd\b|pdm)/i.test(license),
    });
    if (out.length >= count) break;
  }
  return out;
}

export async function searchMusic(project, query, { count = 6 } = {}) {
  const slug = `music-${slugify(query)}`;
  const dir = path.join(project.root, 'assets', 'candidates', slug);
  fs.mkdirSync(dir, { recursive: true });
  const notes = [];
  let found = [];
  try {
    found = await searchCommonsAudio(query, count);
  } catch (e) {
    notes.push(`wikimedia: ${e.message}`);
  }

  const items = [];
  for (const [n, c] of found.entries()) {
    const id = `${slugify(query)}-${n + 1}`;
    const source = path.join(dir, `${id}${c.ext}`);
    const preview = path.join(dir, `${id}.preview.mp3`);
    try {
      if (!fs.existsSync(source)) await download(c.url, source);
      // đoạn nghe thử: từ 20% bài (thường đã qua phần dạo đầu), mờ vào/ra
      const from = Math.max(0, Math.min(c.seconds * 0.2, c.seconds - PREVIEW_SECONDS));
      await run('ffmpeg', [
        '-y', '-loglevel', 'error', '-ss', from.toFixed(1), '-t', String(PREVIEW_SECONDS), '-i', source,
        '-af', `loudnorm=I=-18,afade=t=in:d=0.5,afade=t=out:st=${PREVIEW_SECONDS - 1}:d=1`, '-ar', '48000', '-ac', '2', '-b:a', '160k', preview,
      ]);
      items.push({ ...c, id, sourceFile: path.basename(source), preview: path.basename(preview) });
    } catch (e) {
      notes.push(`${id}: ${e.message.split('\n')[0]}`);
    }
  }
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ query, items }, null, 2));

  // một file nghe lần lượt các đoạn, cách nhau 1 giây im lặng
  let playlist = null;
  if (items.length) {
    playlist = path.join(dir, 'nghe-thu.mp3');
    const inputs = items.flatMap((c) => ['-i', path.join(dir, c.preview)]);
    const gaps = items.map((_, i) => `[${i}:a]apad=pad_dur=1[p${i}]`).join(';');
    await run('ffmpeg', [
      '-y', '-loglevel', 'error', ...inputs,
      '-filter_complex', `${gaps};${items.map((_, i) => `[p${i}]`).join('')}concat=n=${items.length}:v=0:a=1[a]`,
      '-map', '[a]', '-b:a', '160k', playlist,
    ]);
    items.forEach((c, i) => (c.playlistAt = i * (PREVIEW_SECONDS + 1)));
  }
  return { items, playlist, notes };
}

function findMusic(project, id) {
  const root = path.join(project.root, 'assets', 'candidates');
  for (const slug of fs.existsSync(root) ? fs.readdirSync(root).filter((s) => s.startsWith('music-')) : []) {
    const index = path.join(root, slug, 'index.json');
    if (!fs.existsSync(index)) continue;
    const item = JSON.parse(fs.readFileSync(index, 'utf8')).items.find((c) => c.id === id);
    if (item) return { item, dir: path.join(root, slug) };
  }
  throw new Error(`không thấy bài "${id}" trong các lần tìm (assets/candidates/music-*/index.json)`);
}

// Lấy bài nhạc vào assets/<tên>.mp3, đặt làm nhạc nền trong video.json, ghi nguồn.
export async function useMusic(project, id, { name, start } = {}) {
  const { item, dir } = findMusic(project, id);
  const file = path.join('assets', `${slugify(name || 'nhac-nen')}.mp3`);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, item.sourceFile), '-vn', '-ar', '48000', '-ac', '2', '-b:a', '192k', path.join(project.root, file)]);

  const jsonFile = path.join(project.root, 'video.json');
  const video = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  video.music = file;
  if (start !== undefined) video.musicStart = Number(start);
  fs.writeFileSync(jsonFile, JSON.stringify(video, null, 2) + '\n');

  // mỗi video một bản nhạc nền: thay mục nhạc cũ (nếu có)
  const credits = readCredits(project).filter((c) => c.kind !== 'music');
  credits.push({
    file, kind: 'music', title: item.title, author: item.author, source: item.source,
    license: item.license, licenseUrl: item.licenseUrl, page: item.page, attributionRequired: item.attributionRequired,
  });
  fs.writeFileSync(path.join(project.root, 'credits.json'), JSON.stringify(credits, null, 2) + '\n');
  return { file, item, seconds: await mediaDuration(path.join(project.root, file)) };
}
