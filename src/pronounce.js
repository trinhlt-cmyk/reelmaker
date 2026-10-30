// Cách đọc cho giọng tiếng Việt: kịch bản viết bình thường ("iPhone 17 giá 70.000đ/kg"), giọng đọc nhận bản đã đổi
// ("ai phôn mười bảy giá bảy mươi nghìn đồng một ký"), phụ đề vẫn hiện chữ gốc.
// Từ điển: data/pronounce.vi.json (có sẵn) < ~/.reelmaker/pronounce.json (của người dùng) < "pronounce" trong video.json.
// Giá trị null = bỏ một từ có sẵn. Số, ngày, giờ, tiền, đơn vị tự đổi, không cần từ điển.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const BUILTIN_FILE = path.join(HOME, 'data', 'pronounce.vi.json');
export const USER_FILE = path.join(os.homedir(), '.reelmaker', 'pronounce.json');

const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));

export function builtinDict() {
  return strip(readJson(BUILTIN_FILE));
}

export function readUserDict() {
  return readJson(USER_FILE);
}

export function writeUserDict(dict) {
  fs.mkdirSync(path.dirname(USER_FILE), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(dict).sort(([a], [b]) => a.localeCompare(b, 'vi')));
  fs.writeFileSync(USER_FILE, JSON.stringify(sorted, null, 2) + '\n');
}

// từ điển gộp: video > người dùng > có sẵn; null xoá
export function mergedDict(project = null) {
  const all = { ...builtinDict(), ...readUserDict(), ...(project?.cfg.pronounce ?? {}) };
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v !== null && v !== undefined));
}

// chỉ giọng tiếng Việt (edge vi-VN-*, VieNeu, giọng Multilingual đọc lời tiếng Việt); giọng tiếng Anh đọc số theo cách của nó
const VI_MARKS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
export const isVietnamese = (voice, text = '') =>
  voice.startsWith('vieneu:') || voice.startsWith('clone:') || voice.startsWith('vi-') || (voice.includes('Multilingual') && VI_MARKS.test(text));

// ---- số ----

const DIGIT = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const SCALE = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

// 0..999; full = không phải nhóm đầu ("một nghìn không trăm linh năm")
function triple(n, full) {
  const [h, t, u] = [Math.floor(n / 100), Math.floor(n / 10) % 10, n % 10];
  const out = [];
  if (h || full) out.push(DIGIT[h], 'trăm');
  if (t === 0) {
    if (u) out.push(...(h || full ? ['linh'] : []), DIGIT[u]);
  } else if (t === 1) {
    out.push('mười', ...(u === 5 ? ['lăm'] : u ? [DIGIT[u]] : []));
  } else {
    out.push(DIGIT[t], 'mươi', ...(u === 1 ? ['mốt'] : u === 5 ? ['lăm'] : u ? [DIGIT[u]] : []));
  }
  return out.join(' ');
}

// "70000" → "bảy mươi nghìn"; số bắt đầu bằng 0 (số điện thoại, "007") đọc từng chữ số
export function readInt(s) {
  s = s.replace(/\D/g, '');
  if (s.length > 1 && s.startsWith('0')) return [...s].map((d) => DIGIT[d]).join(' ');
  if (/^0+$/.test(s) || !s) return 'không';
  if (s.length > 18) return [...s].map((d) => DIGIT[d]).join(' ');
  const groups = [];
  for (let i = s.length; i > 0; i -= 3) groups.unshift(Number(s.slice(Math.max(0, i - 3), i)));
  const out = [];
  let started = false;
  groups.forEach((g, i) => {
    const scale = SCALE[groups.length - 1 - i];
    if (g) out.push(triple(g, started), scale);
    if (g) started = true;
  });
  return out.filter(Boolean).join(' ');
}

// "1,5" → "một phẩy năm"; "70.000" → "bảy mươi nghìn"; "1.5" (kiểu Anh) → "một phẩy năm"
export function readNumber(s) {
  let [int, frac] = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.split(',') : s.replace('.', ',').split(',');
  int = int.replace(/\./g, '');
  if (!frac) return readInt(int);
  return `${readInt(int)} phẩy ${frac.startsWith('0') ? [...frac].map((d) => DIGIT[d]).join(' ') : readInt(frac)}`;
}

const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?`;

// đơn vị viết liền hoặc cách sau số; dài trước ngắn để "km/h" thắng "km"
const UNITS = {
  'km/h': 'ki lô mét trên giờ', 'km²': 'ki lô mét vuông', km2: 'ki lô mét vuông', 'm²': 'mét vuông', m2: 'mét vuông',
  'm³': 'mét khối', m3: 'mét khối', 'cm²': 'xen ti mét vuông', kWh: 'ki lô oát giờ', mAh: 'mi li am pe giờ',
  GHz: 'ghi ga héc', MHz: 'mê ga héc', Hz: 'héc', kW: 'ki lô oát', W: 'oát', '°C': 'độ xê', '°F': 'độ ép', '°': 'độ',
  km: 'ki lô mét', cm: 'xen ti mét', mm: 'mi li mét', m: 'mét', kg: 'ki lô gam', g: 'gam', mg: 'mi li gam', ha: 'héc ta',
  ml: 'mi li lít', l: 'lít', GB: 'ghi ga bai', MB: 'mê ga bai', TB: 'tê ra bai', inch: 'inch',
  VNĐ: 'đồng', VND: 'đồng', vnđ: 'đồng', 'đ': 'đồng', USD: 'đô la', '$': 'đô la', '€': 'ơ rô', EUR: 'ơ rô',
  k: 'nghìn', K: 'nghìn', tr: 'triệu', '%': 'phần trăm', h: 'giờ', p: 'phút', x: 'lần',
};
// "/kg" → "một ký"
const PER = { kg: 'ký', h: 'giờ', m2: 'mét vuông', 'm²': 'mét vuông' };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const UNIT_RE = Object.keys(UNITS).sort((a, b) => b.length - a.length).map(esc).join('|');
const MONTH = (m) => (Number(m) === 4 ? 'tư' : readInt(m));

// một chữ (đã bỏ dấu câu hai đầu) → cách đọc; prev = chữ đứng trước (thường), để biết "ngày 28/10", "thứ 4"
function speakCore(core, prev) {
  let m;
  if ((m = core.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return `${readInt(m[1])} tháng ${MONTH(m[2])} năm ${readInt(m[3])}`;
  if ((m = core.match(/^(\d{1,2})\/(\d{4})$/)) && Number(m[1]) <= 12) return `tháng ${MONTH(m[1])} năm ${readInt(m[2])}`;
  if ((m = core.match(/^(\d{1,2})\/(\d{1,2})$/)) && /^(ngày|hôm|mùng|sáng|chiều|tối|đêm|từ|đến|tới)$/.test(prev) && Number(m[2]) <= 12) {
    return `${readInt(m[1])} tháng ${MONTH(m[2])}`;
  }
  if ((m = core.match(/^(\d{1,2})[h:](\d{2})$/))) return `${readInt(m[1])} giờ ${readInt(m[2])}`;
  if (prev === 'thứ' && /^\d$/.test(core)) return core === '4' ? 'tư' : core === '1' ? 'nhất' : readInt(core);
  if (prev === 'tháng' && /^\d{1,2}$/.test(core)) return MONTH(core);
  // đơn vị đứng riêng sau số: "70.000 đ", "15 %" (bỏ qua chữ một ký tự dễ nhầm: m, g, h, k…)
  if (/^\d[\d.,]*$/.test(prev) && UNITS[core] && (core.length > 1 || /[đ%$€°]/.test(core))) return UNITS[core];
  // "đồng/tháng", "lít/người" (không đổi "và/hoặc")
  if ((m = core.match(/^(\p{L}+)\/(tháng|năm|ngày|tuần|giờ|người|suất|chiếc|căn|con|lít|kg|m2|m²|ký|phần|lượt)$/u))) {
    return `${m[1]} một ${PER[m[2]] ?? m[2]}`;
  }
  if (!/\d|[$€%]/.test(core)) return core;

  let s = core;
  s = s.replace(/^x(\d+)$/, (_, n) => `nhân ${readInt(n)}`);
  s = s.replace(new RegExp(`([$€])(${NUM})`, 'g'), (_, u, n) => `${readNumber(n)} ${UNITS[u]}`);
  // khoảng: "10-15", "10–15%"
  s = s.replace(new RegExp(`(${NUM})[-–](?=\\d)`, 'g'), (_, n) => `${readNumber(n)} đến `);
  // phân số còn lại "1/3"
  s = s.replace(/^(\d+)\/(\d+)$/, (_, a, b) => `${readInt(a)} phần ${readInt(b)}`);
  s = s.replace(new RegExp(`(${NUM})(?:\\s?(${UNIT_RE}))?(?![\\p{L}\\d])`, 'gu'), (_, n, u) => readNumber(n) + (u ? ` ${UNITS[u]}` : ''));
  // số dính chữ: "2A", "17Pro" → "hai A"
  s = s.replace(new RegExp(`(${NUM})(?=\\p{L})`, 'gu'), (_, n) => `${readNumber(n)} `);
  s = s.replace(/\/(\p{L}[\p{L}²\d]*)/gu, (_, u) => ` một ${PER[u] ?? UNITS[u] ?? u}`);
  return s.replace(/\s+/g, ' ').trim();
}

const LEAD = /^[("“‘'[«]+/u;
const TRAIL = /[.,!?…:;)"”’'\]»]+$/u;
const coreOf = (tok) => tok.replace(LEAD, '').replace(TRAIL, '');

// Đổi lời đọc: [{ display, spoken }] — mỗi phần là một chữ của kịch bản, hoặc một cụm khớp từ điển nhiều chữ.
export function speakable(text, dict) {
  const toks = text.split(/\s+/).filter(Boolean);
  // khoá có chữ hoa: khớp đúng hoa thường ("AI" ≠ "ai"); khoá chữ thường: không phân biệt
  const rules = Object.entries(dict)
    .map(([k, v]) => ({ parts: k.split(/\s+/).map(coreOf), to: v, exact: k !== k.toLowerCase(), dot: k.endsWith('.') }))
    .sort((a, b) => b.parts.length - a.parts.length);
  const same = (r, tok, k) => (r.exact ? coreOf(tok) === r.parts[k] : coreOf(tok).toLowerCase() === r.parts[k].toLowerCase());
  const units = [];
  for (let i = 0; i < toks.length;) {
    const rule = rules.find((r) => r.parts.every((_, k) => toks[i + k] && same(r, toks[i + k], k)));
    const n = rule ? rule.parts.length : 1;
    const display = toks.slice(i, i + n).join(' ');
    const last = toks[i + n - 1];
    const lead = toks[i].match(LEAD)?.[0] ?? '';
    let trail = last.slice(coreOf(last).length + (last.match(LEAD)?.[0].length ?? 0));
    // "TP." — dấu chấm thuộc chữ viết tắt, không phải hết câu
    if (rule?.dot) trail = trail.replace(/^\./, '');
    const prev = coreOf(toks[i - 1] ?? '').toLowerCase();
    const said = rule ? rule.to : speakCore(coreOf(toks[i]), prev);
    units.push({ display, spoken: said === coreOf(display) ? display : `${lead}${said}${trail}` });
    i += n;
  }
  return units;
}

export function spokenText(units) {
  return units.map((u) => u.spoken).join(' ');
}

// Thời gian từng chữ của bản đọc → chữ của kịch bản: các chữ đọc thuộc cùng một phần gộp thành một chữ hiển thị.
export function remapLines(lines, units, maxWords) {
  if (units.every((u) => u.spoken === u.display)) return lines;
  const spoken = spokenText(units);
  const owner = [];
  units.forEach((u, i) => owner.push(...Array(u.spoken.length + 1).fill(i)));
  const said = lines.flatMap((l) => l.words ?? [{ start: l.start, end: l.end, text: l.text }]);
  const words = [];
  let pos = 0;
  let cur = 0;
  for (const w of said) {
    const core = coreOf(w.text);
    const at = core ? spoken.indexOf(core, pos) : -1;
    if (at >= 0) {
      cur = owner[at];
      pos = at + core.length;
    }
    const prev = words.at(-1);
    if (prev && prev.unit === cur) prev.end = w.end;
    else {
      // phần giọng đọc bỏ qua (ký hiệu không đọc) vẫn hiện, ghép vào chữ trước
      if (prev) for (let k = prev.unit + 1; k < cur; k++) prev.text += ` ${units[k].display}`;
      words.push({ unit: cur, start: w.start, end: w.end, text: units[cur].display });
    }
  }
  const lastWord = words.at(-1);
  if (lastWord) for (let k = lastWord.unit + 1; k < units.length; k++) lastWord.text += ` ${units[k].display}`;
  // chia lại dòng: đủ số chữ hoặc hết câu
  const out = [];
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const ws = buf.map(({ start, end, text }) => ({ start, end, text }));
    out.push({ start: ws[0].start, end: ws.at(-1).end, text: ws.map((w) => w.text).join(' '), words: ws });
    buf = [];
  };
  for (const w of words) {
    buf.push(w);
    if (buf.length >= maxWords || /[.!?…]["”’)]?$/.test(w.text)) flush();
  }
  flush();
  return out;
}

// một âm tiết tiếng Việt: phụ âm đầu + vần (nguyên âm có dấu) + phụ âm cuối
const V = 'aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵ';
const SYLLABLE = new RegExp(`^(ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdđghklmnprstvx])?[${V}]+(ch|ng|nh|[cmnpt])?$`, 'iu');

// Chữ trong kịch bản giọng đọc có thể đọc sai: viết tắt, chữ nước ngoài, chữ lẫn số — chưa có trong từ điển.
export function riskyWords(text, dict) {
  const units = speakable(text, dict);
  const known = new Set(Object.keys(dict).map((k) => k.toLowerCase()));
  const out = new Set();
  for (const u of units) {
    if (u.spoken !== u.display) continue;
    const core = coreOf(u.display);
    if (known.has(core.toLowerCase())) continue;
    const abbr = /^\p{Lu}[\p{Lu}\d.&-]+$/u.test(core); // UBND, GDP, COVID-19
    const mixed = /\p{Ll}\p{Lu}/u.test(core); // iPhone, TikTok
    const foreign = /\p{L}/u.test(core) && !core.split('-').every((p) => SYLLABLE.test(p.normalize('NFC')));
    const symbol = /[@#&+=*~^<>|\\]/.test(core);
    if (abbr || mixed || foreign || symbol) out.add(core);
  }
  return [...out];
}
