// Phụ đề SRT cho video cuối (YouTube: tắt/bật, tự dịch, tìm kiếm). Thời gian theo từng từ của giọng đọc,
// đã dời theo mốc bắt đầu mỗi cảnh trong video (tính cả phần chồng của chuyển cảnh).
import fs from 'node:fs';
import path from 'node:path';
import { sceneTiming } from './render.js';
import { sceneStarts } from './studio.js';

const MAX_CHARS = 42; // ký tự mỗi dòng phụ đề (chuẩn dễ đọc)
const MAX_LINES = 2;
const MIN_SHOW = 1.0; // giây tối thiểu một phụ đề hiện trên màn hình

const stamp = (t) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

// gom từ thành các khối ≤ 2 dòng × 42 ký tự, ngắt ở cuối câu
function cues(words) {
  const out = [];
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    out.push({ start: buf[0].start, end: buf.at(-1).end, words: buf.map((w) => w.text) });
    buf = [];
  };
  for (const w of words) {
    const text = [...buf.map((b) => b.text), w.text].join(' ');
    if (buf.length && text.length > MAX_CHARS * MAX_LINES) flush();
    buf.push(w);
    // hết câu thì ngắt, trừ câu rất ngắn ("Số một.") — gộp với câu sau cho đủ thời gian đọc
    const said = buf.map((b) => b.text).join(' ');
    if (/[.!?…]$/.test(w.text) && (said.length >= 20 || w.end - buf[0].start >= MIN_SHOW * 1.5)) flush();
  }
  flush();
  // khối quá ngắn cuối câu ("trước.") nhập vào khối trước nếu cùng câu
  for (let i = out.length - 1; i > 0; i--) {
    const prev = out[i - 1];
    if (out[i].words.join(' ').length < 14 && !/[.!?…]$/.test(prev.words.at(-1))) {
      prev.words.push(...out[i].words);
      prev.end = out[i].end;
      out.splice(i, 1);
    }
  }
  return out;
}

// "srtReplace" trong video.json: { "một nghìn chín trăm năm mươi sáu": "1956", "AI": "AI" } — lời đọc viết số bằng
// chữ cho giọng đọc, phụ đề nên hiện chữ số
// thay trên danh sách từ (trước khi chia dòng): cụm được thay thành một "từ" nên không bị ngắt đôi
function replaceWords(words, map) {
  // so khớp bỏ dấu câu ở cuối từ ("sáu," khớp "sáu"); dấu câu của từ cuối được giữ lại sau phần thay
  const bare = (s) => s.toLowerCase().replace(/[.,!?…:;]+$/, '');
  const rules = Object.entries(map ?? {})
    .map(([from, to]) => ({ from: from.split(/\s+/).map(bare), to }))
    .sort((a, b) => b.from.length - a.from.length);
  const out = [];
  for (let i = 0; i < words.length;) {
    const rule = rules.find((r) => r.from.every((f, k) => words[i + k] && bare(words[i + k].text) === f));
    if (rule) {
      const n = rule.from.length;
      const last = words[i + n - 1].text;
      const punct = last.slice(bare(last).length);
      out.push({ start: words[i].start, end: words[i + n - 1].end, text: rule.to.replace(/[.,!?…:;]+$/, '') + punct });
      i += n;
    } else {
      out.push(words[i]);
      i++;
    }
  }
  return out;
}

// chia một khối thành tối đa 2 dòng cân nhau
function wrap(words) {
  const text = words.join(' ');
  if (text.length <= MAX_CHARS) return text;
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length;
    const b = words.slice(i).join(' ').length;
    const diff = Math.abs(a - b) + (Math.max(a, b) > MAX_CHARS ? 100 : 0);
    if (diff < bestDiff) [best, bestDiff] = [i, diff];
  }
  return `${words.slice(0, best).join(' ')}\n${words.slice(best).join(' ')}`;
}

export async function writeSrt(project, out = null) {
  const starts = await sceneStarts(project);
  if (!starts.length) throw new Error('chưa render các cảnh: reelmaker render trước');
  const all = [];
  for (const [k, scene] of project.cfg.scenes.entries()) {
    if (!scene.narration) continue;
    const timing = await sceneTiming(project, scene, { log: () => {} });
    const offset = starts[k].start;
    // từng từ (nếu có), không thì cả dòng như một "từ"
    const words = timing.lines.flatMap((l) => l.words ?? [{ start: l.start, end: l.end, text: l.text }]);
    for (const c of cues(replaceWords(words, project.cfg.srtReplace))) {
      all.push({ start: c.start + offset, end: c.end + offset, text: wrap(c.words) });
    }
  }
  // không chồng nhau; đủ lâu để đọc (kéo dài tới tối đa trước phụ đề kế)
  all.forEach((c, i) => {
    const next = all[i + 1]?.start ?? Infinity;
    c.end = Math.min(Math.max(c.end + 0.2, c.start + MIN_SHOW), next - 0.04);
  });
  const file = out ?? path.join(path.dirname(path.resolve(project.root, project.cfg.output)), 'video.srt');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, all.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n'));
  return { file, count: all.length };
}
