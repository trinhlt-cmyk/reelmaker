// Bộ nhớ đệm cho font và thư viện lấy từ CDN (Google Fonts, jsdelivr, unpkg, cdnjs): lần đầu tải và lưu vào
// ~/.reelmaker/cache/web, các lần sau Chrome nhận thẳng từ đĩa — render không cần mạng và nhanh hơn.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const WEB_CACHE = path.join(os.homedir(), '.reelmaker', 'cache', 'web');
const HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com'];

const cacheable = (url) => {
  try {
    return HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

// Google Fonts trả CSS khác nhau theo trình duyệt: khoá gồm cả user-agent
const keyOf = (url, ua) => crypto.createHash('sha1').update(`${url}\n${url.includes('fonts.googleapis.com') ? ua : ''}`).digest('hex');

async function load(url, ua) {
  const key = keyOf(url, ua);
  const body = path.join(WEB_CACHE, `${key}.bin`);
  const meta = path.join(WEB_CACHE, `${key}.json`);
  if (fs.existsSync(body) && fs.existsSync(meta)) {
    return { ...JSON.parse(fs.readFileSync(meta, 'utf8')), body: fs.readFileSync(body) };
  }
  const res = await fetch(url, { headers: { 'user-agent': ua } });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = { contentType: res.headers.get('content-type') ?? 'application/octet-stream', body: Buffer.from(await res.arrayBuffer()) };
  fs.mkdirSync(WEB_CACHE, { recursive: true });
  fs.writeFileSync(body, data.body);
  fs.writeFileSync(meta, JSON.stringify({ url, contentType: data.contentType }));
  return data;
}

export async function useWebCache(page) {
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    if (req.method() !== 'GET' || !cacheable(req.url())) return req.continue();
    try {
      const { contentType, body } = await load(req.url(), req.headers()['user-agent'] ?? '');
      // trang cảnh mở từ file://: font khác nguồn cần cho phép CORS
      await req.respond({ status: 200, contentType, body, headers: { 'access-control-allow-origin': '*' } });
    } catch {
      // không tải được và chưa có trong bộ nhớ đệm: để Chrome tự thử
      req.continue();
    }
  });
}
