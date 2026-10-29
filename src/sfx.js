// Tiếng hiệu ứng tự đặt theo hiệu ứng hình trong cảnh:
//   - chuyển sang cảnh mới (trừ cảnh đầu): whoosh
//   - animation tên "pop" (lớp .pop): pop
//   - phần tử (hoặc phần tử cha) có data-sfx="<tên>": tiếng đó khi animation của nó bắt đầu; "none" để tắt
//   - data-sfx-at="1.2" (kèm data-sfx): tiếng ở giây đó, không cần animation
// Tắt cả video: "sfx": false; to nhỏ: "sfxVolume" (mặc định 1).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'sfx');

// { whoosh: ['…/whoosh-1.wav', …], pop: […], … }
export function library() {
  const lib = {};
  for (const f of fs.existsSync(DIR) ? fs.readdirSync(DIR).sort() : []) {
    const m = f.match(/^([a-z]+)-\d+\.wav$/);
    if (m) (lib[m[1]] ??= []).push(path.join(DIR, f));
  }
  return lib;
}

// Chạy trong trang (thời gian chưa tua, t = 0): thời điểm bắt đầu của các animation cần có tiếng.
function collectCues() {
  const cues = [];
  for (const a of document.getAnimations()) {
    const el = a.effect?.target;
    if (!el) continue;
    const marked = el.closest('[data-sfx]')?.dataset.sfx;
    const sound = marked ?? (a.animationName === 'pop' ? 'pop' : null);
    if (!sound || sound === 'none') continue;
    cues.push({ t: a.effect.getTiming().delay / 1000, sound });
  }
  for (const el of document.querySelectorAll('[data-sfx-at]')) {
    cues.push({ t: Number(el.dataset.sfxAt), sound: el.dataset.sfx || 'pop' });
  }
  return cues;
}

// Danh sách tiếng của một cảnh: [{ t, file, gain }], đã bỏ tiếng trùng và tiếng quá dày.
export async function sceneCues(page, project, scene, duration) {
  const { sfx = true, sfxVolume = 1 } = project.cfg;
  if (sfx === false || scene.sfx === false) return [];
  const lib = library();
  const raw = await page.evaluate(collectCues);
  if (project.cfg.scenes.indexOf(scene) > 0 && scene.transitionSfx !== false) raw.push({ t: 0, sound: 'whoosh' });

  const cues = [];
  const unknown = new Set();
  for (const c of raw.sort((a, b) => a.t - b.t)) {
    if (!(c.t >= 0 && c.t < duration - 0.1)) continue;
    if (!lib[c.sound]) {
      unknown.add(c.sound);
      continue;
    }
    // hai tiếng cách nhau < 0.18s nghe như một: giữ tiếng đầu
    if (cues.length && c.t - cues.at(-1).t < 0.18) continue;
    const variants = lib[c.sound];
    const n = cues.filter((x) => x.sound === c.sound).length;
    cues.push({ t: Number(c.t.toFixed(3)), sound: c.sound, file: variants[n % variants.length], gain: sfxVolume });
  }
  if (unknown.size) console.warn(`  ⚠ cảnh ${scene.id}: không có tiếng ${[...unknown].join(', ')} (có: ${Object.keys(lib).join(', ')})`);
  return cues;
}

// Mã nhận diện thư viện, để đổi file tiếng thì các cảnh render lại.
export function libraryStamp() {
  return Object.values(library()).flat().map((f) => `${path.basename(f)}:${fs.statSync(f).size}`).join('|');
}
