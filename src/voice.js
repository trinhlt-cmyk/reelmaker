// Giọng đọc cho từng cảnh: build/audio/<id>.mp3 + <id>.json (phụ đề, thời lượng).
// Chỉ đọc lại khi lời, giọng hoặc tốc độ thay đổi.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from './project.js';
import { run, mediaDuration } from './exec.js';
import { cloneDir, cloneStamp, listClones } from './clone.js';
import { isVietnamese, mergedDict, speakable, spokenText, remapLines } from './pronounce.js';

const HOME = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Hai bộ đọc, cùng cách gọi: edge-tts (online, có thời gian từng từ) và VieNeu-TTS (offline, giọng "vieneu:<tên>").
export const ENGINES = {
  edge: { python: path.join(HOME, '.venv/bin/python'), script: path.join(HOME, 'tts.py') },
  vieneu: { python: path.join(HOME, '.venv-vieneu/bin/python'), script: path.join(HOME, 'vieneu_tts.py') },
};

// Whisper (faster-whisper, offline) nghe lại giọng đọc để lấy thời gian thật của từng chữ: VieNeu chỉ ước lượng.
export const WHISPER = { python: path.join(HOME, '.venv-whisper/bin/python'), script: path.join(HOME, 'tools', 'align.py') };

// Căn thời gian từng chữ của một file giọng (ghi đè json); tắt bằng "align": false trong video.json
async function alignVoice(project, scene, mp3, json, log) {
  if (project.cfg.align === false || !fs.existsSync(WHISPER.python)) return null;
  log(`  👂 cảnh ${scene.id}: Whisper căn thời gian từng chữ`);
  const out = await run(WHISPER.python, ['-I', WHISPER.script, mp3, json, project.cfg.whisperModel ?? 'small']);
  const { matched } = JSON.parse(out.trim().split('\n').pop());
  if (matched < 0.6) log(`  ⚠ cảnh ${scene.id}: Whisper chỉ khớp ${Math.round(matched * 100)}% số chữ, phần còn lại chia đều`);
  return JSON.parse(fs.readFileSync(json, 'utf8'));
}

export function engineOf(voice) {
  // "clone:<tên>" = giọng nhân bản, đọc bằng VieNeu với dấu giọng đã lưu
  if (voice.startsWith('clone:')) return { name: 'vieneu', voice: `clone:${cloneDir(voice.slice('clone:'.length))}`, ...ENGINES.vieneu };
  return voice.startsWith('vieneu:')
    ? { name: 'vieneu', voice: voice.slice('vieneu:'.length), ...ENGINES.vieneu }
    : { name: 'edge', voice, ...ENGINES.edge };
}

export function audioPaths(project, scene) {
  const dir = path.join(project.build, 'audio');
  return { dir, mp3: path.join(dir, `${scene.id}.mp3`), json: path.join(dir, `${scene.id}.json`) };
}

// Trả về { audio, duration, lines, key } của cảnh; cảnh không lời dùng "duration" trong video.json.
export async function voiceScene(project, scene, { force = false, log = console.log } = {}) {
  if (!scene.narration) return { audio: null, duration: scene.duration, lines: [], key: 'silent' };
  const { dir, mp3, json } = audioPaths(project, scene);
  // giọng đọc nhận bản đã đổi số / từ điển; build/audio/<id>.json giữ chữ như đã đọc, phụ đề trả về chữ của kịch bản
  const units = project.cfg.pronounce !== false && isVietnamese(scene.voice, scene.narration)
    ? speakable(scene.narration, mergedDict(project)) : [{ display: scene.narration, spoken: scene.narration }];
  const spoken = spokenText(units);
  const shown = (r) => ({ ...r, lines: remapLines(r.lines, units, project.cfg.captionMaxWords) });
  // 'words': phụ đề lưu kèm thời gian từng từ (karaoke); đổi định dạng này thì tăng số để tạo lại
  // pitch ("+15Hz" = giọng cao, gắt kiểu giật tít): chỉ edge-tts; chỉ vào khoá khi có, để giọng cũ không phải đọc lại
  const pitch = scene.pitch && scene.pitch !== '+0Hz' ? scene.pitch : null;
  const cloned = scene.voice.startsWith('clone:') ? [cloneStamp(scene.voice.slice('clone:'.length))] : [];
  // "phrasing": true — VieNeu nghỉ sau từng vế câu (nhịp ngâm, kể chuyện)
  const phrasing = scene.phrasing ?? project.cfg.phrasing;
  const key = hash(spoken, scene.voice, scene.rate, project.cfg.captionMaxWords, 'words-1', ...(pitch ? [pitch] : []), ...cloned, ...(phrasing ? ['phrase'] : []));
  if (!force && fs.existsSync(json) && fs.existsSync(mp3)) {
    const cached = JSON.parse(fs.readFileSync(json, 'utf8'));
    if (cached.key === key) {
      // giọng VieNeu đọc trước khi có Whisper: căn lại mà không phải đọc lại
      if (engineOf(scene.voice).name === 'vieneu' && !cached.aligned) {
        const aligned = await alignVoice(project, scene, mp3, json, log);
        if (aligned) return { audio: mp3, ...shown(aligned) };
      }
      return { audio: mp3, ...shown(cached) };
    }
  }
  fs.mkdirSync(dir, { recursive: true });
  log(`  🎙  cảnh ${scene.id}: đọc ${spoken.length} ký tự (${scene.voice})`);
  if (spoken !== scene.narration) log(`     đọc là: ${spoken}`);
  const textFile = path.join(dir, `${scene.id}.txt`);
  fs.writeFileSync(textFile, spoken);
  const raw = `${json}.raw`;
  const engine = engineOf(scene.voice);
  if (!fs.existsSync(engine.python)) throw new Error(`chưa cài bộ đọc ${engine.name} (chạy reelmaker doctor)`);
  // tăng tốc (atempo) làm giọng nhân bản kém giống: đo được 0.785 ở +0% → 0.717 ở +25%
  if (scene.voice.startsWith('clone:') && parseInt(scene.rate, 10) > 10) log(`  ⚠ cảnh ${scene.id}: giọng nhân bản ở tốc độ ${scene.rate} kém giống hơn; nên ≤ +10% (rút gọn lời đọc thay vì tăng tốc)`);
  if (pitch && engine.name === 'vieneu') log(`  ⚠ cảnh ${scene.id}: giọng VieNeu chưa đổi được cao độ ("pitch" bỏ qua)`);
  const args = [textFile, mp3, raw, engine.voice, scene.rate, String(project.cfg.captionMaxWords), ...(pitch && engine.name === 'edge' ? [pitch] : []),
    ...(phrasing && engine.name === 'vieneu' ? ['--phrase'] : [])];
  await run(engine.python, ['-I', engine.script, ...(engine.name === 'vieneu' ? ['say'] : []), ...args]);
  const { lines } = JSON.parse(fs.readFileSync(raw, 'utf8'));
  fs.rmSync(raw);
  const duration = await mediaDuration(mp3);
  const result = { key, duration, lines };
  fs.writeFileSync(json, JSON.stringify(result, null, 1));
  if (engine.name === 'vieneu') {
    const aligned = await alignVoice(project, scene, mp3, json, log);
    if (aligned) return { audio: mp3, ...shown(aligned) };
  }
  return { audio: mp3, ...shown(result) };
}

// Đọc một câu ngắn (reelmaker say): áp từ điển như khi làm video; trả về file mp3 và câu đã đổi
export async function sayText(text, { voice, rate = '+0%', pitch = null, project = null } = {}) {
  const spoken = isVietnamese(voice, text) ? spokenText(speakable(text, mergedDict(project))) : text;
  const dir = path.join(os.homedir(), '.reelmaker', 'say');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = voice.startsWith('clone:') ? cloneStamp(voice.slice('clone:'.length)) : '';
  const base = path.join(dir, hash(spoken, voice, rate, pitch ?? '', stamp).slice(0, 10));
  const mp3 = `${base}.mp3`;
  if (!fs.existsSync(mp3)) {
    const engine = engineOf(voice);
    if (!fs.existsSync(engine.python)) throw new Error(`chưa cài bộ đọc ${engine.name} (chạy reelmaker doctor)`);
    fs.writeFileSync(`${base}.txt`, spoken);
    try {
      await run(engine.python, ['-I', engine.script, ...(engine.name === 'vieneu' ? ['say'] : []), `${base}.txt`, mp3, `${base}.json`, engine.voice, rate, '12', ...(pitch && engine.name === 'edge' ? [pitch] : [])]);
    } catch (e) {
      fs.rmSync(mp3, { force: true });
      throw e;
    }
  }
  return { mp3, spoken };
}

export async function listVoices(filter = 'vi-VN') {
  const out = await run(path.join(HOME, '.venv/bin/edge-tts'), ['--list-voices']);
  return out.split('\n').filter((l) => !filter || l.includes(filter));
}

// [{ id: "vieneu:Ngọc Huyền", label: "⭐ Ngọc Huyền — Nữ · Bắc · …" }]
export async function listVieneuVoices() {
  const { python, script } = ENGINES.vieneu;
  if (!fs.existsSync(python)) return [];
  const out = await run(python, ['-I', script, 'voices']);
  return JSON.parse(out).map((v) => ({ id: `vieneu:${v.id}`, label: v.label }));
}

// Nghe thử mọi giọng: mỗi giọng đọc "<tên>. <câu mẫu>", ghép lại thành một file kèm mốc thời gian từng giọng.
// Giọng đã đọc được giữ lại (~/.reelmaker/voice-samples), lần sau chỉ đọc giọng mới.
export async function voiceSamples(voices, text, { rate = '+0%', log = console.log } = {}) {
  const dir = path.join(os.homedir(), '.reelmaker', 'voice-samples', hash(text, rate).slice(0, 10));
  fs.mkdirSync(dir, { recursive: true });
  const spoken = (id) => (id.startsWith('vieneu:') ? id.slice(7) : id.replace(/^[a-z]{2}-[A-Z]{2}-|(Multilingual)?Neural$/g, '').replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2'))
    .replace('Hoai My', 'Hoài My');
  const parts = [];
  let t = 0;
  for (const id of voices) {
    const safe = id.replace(/[^\p{L}\p{N}]+/gu, '-');
    const mp3 = path.join(dir, `${safe}.mp3`);
    if (!fs.existsSync(mp3)) {
      log(`  🎙  ${id}`);
      const engine = engineOf(id);
      if (!fs.existsSync(engine.python)) continue;
      const textFile = path.join(dir, `${safe}.txt`);
      fs.writeFileSync(textFile, `${spoken(id)}. ${text}`);
      const raw = path.join(dir, `${safe}.json`);
      try {
        await run(engine.python, ['-I', engine.script, ...(engine.name === 'vieneu' ? ['say'] : []), textFile, mp3, raw, engine.voice, rate, '12']);
      } catch (e) {
        fs.rmSync(mp3, { force: true });
        log(`  ⚠ ${id}: ${String(e.message).split('\n')[0]}`);
        continue;
      }
    }
    // đệm 0.8s im lặng sau mỗi giọng, cùng định dạng để ghép
    const wav = path.join(dir, `${safe}.wav`);
    if (!fs.existsSync(wav)) await run('ffmpeg', ['-y', '-v', 'error', '-i', mp3, '-af', 'apad=pad_dur=0.8', '-ar', '24000', '-ac', '1', wav]);
    parts.push({ id, at: t, wav });
    t += await mediaDuration(wav);
  }
  const list = path.join(dir, 'list.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p.wav.replace(/'/g, "'\\''")}'`).join('\n'));
  const out = path.join(dir, 'giong-mau.mp3');
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'libmp3lame', '-q:a', '3', out]);
  return { out, parts, total: t };
}

// Mọi giọng của cả hai bộ đọc trong một danh sách: [{ id, name, about, engine, star }]
// (name = tên ngắn để gõ: "HoaiMy", "Quốc Tuấn"; engine = online/offline và độ khớp phụ đề)
export async function allVoices(filter = 'vi-VN') {
  const gender = { Female: 'Nữ', Male: 'Nam' };
  const rows = (await listVoices(filter)).map((l) => l.split(/\s+/)).filter((c) => c[0]).map(([id, g]) => ({
    id, name: id.replace(/^[a-z]{2}-[A-Z]{2}-|Neural$/g, ''), star: true,
    about: `${gender[g] ?? g}${id.startsWith('vi-VN') ? ' · Bắc · tự nhiên' : ''}`,
    engine: 'online · phụ đề khớp từng từ',
  }));
  if (filter.startsWith('vi')) {
    for (const v of await listVieneuVoices()) {
      rows.push({
        id: v.id, name: v.id.slice('vieneu:'.length), star: v.label.startsWith('⭐'),
        about: (v.label.split(' — ')[1] ?? '').replace(/Phong cách |Giọng đọc /, ''), engine: 'offline · phụ đề ước lượng',
      });
    }
    // giọng nhân bản của bạn (reelmaker voice-clone)
    for (const c of listClones()) {
      rows.push({ id: `clone:${c.name}`, name: c.name, star: true, about: `nhân bản · ${c.seconds}s ghi âm`, engine: 'offline · phụ đề ước lượng' });
    }
    // giọng Multilingual của edge-tts đọc được lời tiếng Việt (giọng người nước ngoài); để cuối cho số thứ tự cũ không đổi
    for (const [id, g] of (await listVoices('Multilingual')).map((l) => l.split(/\s+/)).filter((c) => c[0])) {
      rows.push({
        id, name: id.replace(/^[a-z]{2}-[A-Z]{2}-|MultilingualNeural$/g, ''), star: false,
        about: `${gender[g] ?? g} · giọng nước ngoài`, engine: 'online · phụ đề khớp từng từ',
      });
    }
  }
  return rows;
}

// "3", "HoaiMy", "quốc tuấn", "vieneu:Quốc Tuấn", "vi-VN-HoaiMyNeural" → id giọng; không khớp → null
export function resolveVoice(input, rows) {
  const s = String(input).trim();
  if (/^\d+$/.test(s)) return rows[Number(s) - 1]?.id ?? null;
  const low = s.toLowerCase().normalize('NFC');
  return rows.find((r) => r.id.toLowerCase() === low || r.name.toLowerCase().normalize('NFC') === low)?.id ?? null;
}
