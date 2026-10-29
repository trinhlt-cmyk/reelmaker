// Cắt cảnh theo nhịp nhạc ("beatSync": true + có "music"): dò nhịp bản nhạc nền rồi chỉnh độ dài mỗi cảnh
// (chỉ phần nghỉ sau giọng đọc) để lúc cảnh sau bắt đầu hiện ra rơi đúng một nhịp. Không bao giờ cắt vào lời.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './exec.js';
import { hash } from './project.js';
import { voiceScene } from './voice.js';
import { resolveTransition } from './transitions.js';

const HOME = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PYTHON = path.join(HOME, '.venv-vieneu', 'bin', 'python'); // có librosa (cài kèm vieneu)
const LONGER = 0.6; // cảnh được kéo dài tối đa chừng này để chờ nhịp
const SILENT_FLEX = 0.35; // giây
const SHORTER = 0.25; // hoặc rút ngắn tối đa chừng này (vẫn chừa ≥ MIN_PAUSE sau lời)
const MIN_PAUSE = 0.15;

async function detectBeats(project, length) {
  const { cfg, root, build } = project;
  const music = path.resolve(root, cfg.music);
  const key = hash(music, fs.statSync(music).mtimeMs, cfg.musicStart ?? 0, Math.ceil(length));
  const cache = path.join(build, 'beats.json');
  if (fs.existsSync(cache)) {
    const c = JSON.parse(fs.readFileSync(cache, 'utf8'));
    if (c.key === key) return c;
  }
  if (!fs.existsSync(PYTHON)) throw new Error('cắt theo nhịp cần librosa (có sẵn khi cài VieNeu: reelmaker doctor)');
  const out = JSON.parse(await run(PYTHON, ['-I', path.join(HOME, 'tools', 'beats.py'), music, String(cfg.musicStart ?? 0), String(Math.ceil(length) + 2)]));
  const result = { key, ...out };
  fs.mkdirSync(build, { recursive: true });
  fs.writeFileSync(cache, JSON.stringify(result));
  return result;
}

// { tempo, scenes: { id: { duration, beats: [giây tính từ đầu cảnh] } }, onBeat, cuts } — hoặc null nếu không bật.
export async function beatPlan(project) {
  const { cfg } = project;
  if (!cfg.beatSync || !cfg.music) return null;
  if (project._beatPlan) return project._beatPlan;

  // độ dài tự nhiên của từng cảnh và giới hạn được phép
  const scenes = [];
  for (const scene of cfg.scenes) {
    const v = await voiceScene(project, scene, { log: () => {} });
    const lead = v.audio ? scene.lead : 0;
    const natural = scene.duration ?? lead + v.duration + scene.tail;
    const speechEnd = v.audio ? lead + v.duration : 0;
    scenes.push({ scene, natural, speechEnd });
  }
  // phần chồng lên nhau ở chỗ chuyển cảnh (xfade / GL): cảnh sau bắt đầu hiện ra sớm hơn chừng đó
  const overlap = scenes.map(({ scene }, k) => {
    if (k === 0) return 0;
    const t = resolveTransition(scene.transition ?? cfg.transition);
    if (t.kind === 'cut') return 0;
    const prev = cfg.scenes[k - 1];
    const d = Number(scene.transitionDuration ?? cfg.transitionDuration);
    return prev.narration ? Math.min(d, prev.tail) : d;
  });

  const total = scenes.reduce((s, x) => s + x.natural, 0);
  const { tempo, beats } = await detectBeats(project, total + LONGER * scenes.length);
  let start = 0;
  let onBeat = 0;
  const plan = {};
  scenes.forEach(({ scene, natural, speechEnd }, k) => {
    let duration = natural;
    const last = k === scenes.length - 1;
    // cảnh không lời có "duration": co giãn nhẹ ±SILENT_FLEX (tắt riêng cảnh bằng "beatSync": false)
    const silent = scene.duration !== undefined && !scene.narration && scene.beatSync !== false;
    if (!last && (scene.duration === undefined || silent)) {
      const minLen = silent ? natural - SILENT_FLEX : Math.max(natural - SHORTER, speechEnd + Math.max(MIN_PAUSE, overlap[k + 1]));
      const maxLen = natural + (silent ? SILENT_FLEX : LONGER);
      // điểm cảnh sau bắt đầu hiện = start + len - overlap; chọn nhịp gần điểm tự nhiên nhất trong khoảng cho phép
      const lo = start + minLen - overlap[k + 1];
      const hi = start + maxLen - overlap[k + 1];
      const want = start + natural - overlap[k + 1];
      const candidates = beats.filter((b) => b >= lo && b <= hi);
      if (candidates.length) {
        const b = candidates.reduce((x, y) => (Math.abs(y - want) < Math.abs(x - want) ? y : x));
        duration = b - start + overlap[k + 1];
        onBeat++;
      }
    }
    duration = Math.round(duration * cfg.fps) / cfg.fps; // đúng số khung hình
    plan[scene.id] = {
      duration,
      beats: beats.filter((b) => b >= start && b < start + duration).map((b) => Number((b - start).toFixed(3))),
    };
    start += duration - (overlap[k + 1] ?? 0);
  });
  project._beatPlan = { tempo, scenes: plan, onBeat, cuts: scenes.length - 1 };
  return project._beatPlan;
}
