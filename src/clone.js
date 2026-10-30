// Giọng nhân bản (VieNeu, offline): từ 3–60 giây ghi âm (dài hơn: chọn đoạn tốt nhất, dấu giọng trung bình) → ~/.reelmaker/voices/<tên>/ (ref.wav, voice.npz, meta.json).
// Dùng như mọi giọng khác: "voice": "clone:<tên>".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, mediaDuration } from './exec.js';

export const VOICES_DIR = path.join(os.homedir(), '.reelmaker', 'voices');
const MIN_SECS = 3;
const MAX_SECS = 60;

export const cloneDir = (name) => path.join(VOICES_DIR, name.replace(/[/\\:]/g, '-').trim());

export function listClones() {
  if (!fs.existsSync(VOICES_DIR)) return [];
  return fs.readdirSync(VOICES_DIR)
    .map((d) => path.join(VOICES_DIR, d, 'meta.json'))
    .filter((f) => fs.existsSync(f) && fs.existsSync(path.join(path.dirname(f), 'voice.npz')))
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
}

// đổi khi nhân bản lại cùng tên → giọng các cảnh dùng nó được đọc lại
export function cloneStamp(name) {
  const npz = path.join(cloneDir(name), 'voice.npz');
  if (!fs.existsSync(npz)) throw new Error(`chưa có giọng nhân bản "${name}" (reelmaker voice-clone <file ghi âm> --name "${name}")`);
  return String(fs.statSync(npz).mtimeMs);
}

// Demucs (tách lời khỏi nhạc nền): môi trường riêng vì kéo theo PyTorch; cài: python3.11 -m venv .venv-demucs && .venv-demucs/bin/pip install demucs soundfile
const HOME = path.dirname(path.dirname(new URL(import.meta.url).pathname));
export const DEMUCS = path.join(HOME, '.venv-demucs', 'bin', 'python');

// chỉ giữ lời (giọng) của mỗi file: bài hát, video có nhạc nền
async function separateVocals(files, tmp, log) {
  if (!fs.existsSync(DEMUCS)) throw new Error('chưa cài Demucs (tách lời khỏi nhạc): python3.11 -m venv .venv-demucs && .venv-demucs/bin/pip install demucs soundfile');
  log(`  🎚  tách lời khỏi nhạc nền (${files.length} file)…`);
  const wavs = [];
  for (const [i, f] of files.entries()) {
    const wav = path.join(tmp, `in-${i}.wav`);
    await run('ffmpeg', ['-y', '-v', 'error', '-i', f, '-vn', '-ac', '2', '-ar', '44100', wav]);
    wavs.push(wav);
  }
  await run(DEMUCS, ['-m', 'demucs', '--two-stems=vocals', '-n', 'htdemucs', '-o', path.join(tmp, 'sep'), ...wavs]);
  return wavs.map((w) => path.join(tmp, 'sep', 'htdemucs', path.basename(w, '.wav'), 'vocals.wav'));
}

export async function cloneVoice(files, { name, python, script, denoise = 'auto', separate = false, log = console.log }) {
  files = [files].flat();
  for (const f of files) if (!fs.existsSync(f)) throw new Error(`không thấy ${f}`);
  if (!name) throw new Error('thiếu --name "<tên giọng>"');
  const dir = cloneDir(name);
  fs.mkdirSync(dir, { recursive: true });
  const ref = path.join(dir, 'ref.wav');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-clone-'));
  try {
    const inputs = separate ? await separateVocals(files, tmp, log) : files;
    // mọi định dạng (m4a của iPhone, mp3, video…) → wav mono, nối các file, bỏ quãng lặng dài (lúc nhạc dạo đã tách
    // khỏi lời), giữ tối đa 60 giây
    await run('ffmpeg', ['-y', '-v', 'error', ...inputs.flatMap((f) => ['-i', f]),
      '-filter_complex', `${inputs.map((_, i) => `[${i}:a]`).join('')}concat=n=${inputs.length}:v=0:a=1,silenceremove=stop_periods=-1:stop_duration=0.6:stop_threshold=-40dB`,
      '-ac', '1', '-ar', '44100', '-t', String(MAX_SECS), ref]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const seconds = await mediaDuration(ref);
  if (seconds < MIN_SECS) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`đoạn ghi âm chỉ ${seconds.toFixed(1)}s: cần ít nhất ${MIN_SECS} giây nói liền (tốt nhất 30–60 giây)`);
  }
  log(`  👂 lấy dấu giọng từ ${seconds.toFixed(1)}s ghi âm (lần đầu tải thêm bộ nhân bản giọng)…`);
  const out = await run(python, ['-I', script, 'clone', ref, path.join(dir, 'voice.npz'), denoise]);
  const info = JSON.parse(out.trim().split('\n').pop());
  const meta = {
    name, source: files.map((f) => path.basename(f)).join(', '), separated: separate, seconds: Number(seconds.toFixed(1)), created: new Date().toISOString(), consent: true,
    denoise: info.denoise, snrDb: info.snr_db, windows: info.windows, bestAt: info.best_at,
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  return { ...meta, dir };
}

export function removeClone(name) {
  const dir = cloneDir(name);
  if (!fs.existsSync(dir)) throw new Error(`không có giọng nhân bản "${name}"`);
  fs.rmSync(dir, { recursive: true, force: true });
}
