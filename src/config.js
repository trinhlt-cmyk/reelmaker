// Thiết lập chung của máy: ~/.reelmaker/config.json (giọng, tốc độ, khung hình, giao diện, thư mục lưu video).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { run } from './exec.js';
import { listVoices, ENGINES, WHISPER, allVoices, resolveVoice } from './voice.js';
import { getKey, KEY_NAMES } from './keys.js';
import { resolveTransition } from './transitions.js';
import { CHROME_CANDIDATES } from './render.js';

const FILE = path.join(os.homedir(), '.reelmaker', 'config.json');
const HOME = path.dirname(path.dirname(new URL(import.meta.url).pathname));

export const FORMATS = { '16:9': { width: 1920, height: 1080 }, '9:16': { width: 1080, height: 1920 }, '1:1': { width: 1080, height: 1080 } };
export const THEMES = {
  dark: { bg: '#0b1324', fg: '#f4f6fb', muted: '#9aa6c1', accent: '#4da3ff', warm: '#ffb547' },
  light: { bg: '#f6f8fc', fg: '#0b1324', muted: '#5b6680', accent: '#1f6fe0', warm: '#e07b00' },
};
const VOICES = { HoaiMy: 'vi-VN-HoaiMyNeural', NamMinh: 'vi-VN-NamMinhNeural' };
// Loại nhạc nền → từ khoá tìm trên Wikimedia (Claude dùng ở Bước 3); none = không nhạc.
export const MUSIC_MOODS = {
  calm: 'Kevin MacLeod calm',
  upbeat: 'Kevin MacLeod upbeat',
  acoustic: 'acoustic guitar',
  epic: 'Kevin MacLeod epic',
  none: null,
};
export const MUSIC_LEVELS = { low: -34, mid: -30, high: -26 }; // LUFS của nhạc nền trước khi trộn
export const SFX_MODES = { on: { sfx: true, sfxVolume: 1 }, soft: { sfx: true, sfxVolume: 0.55 }, off: { sfx: false, sfxVolume: 1 } };

const DEFAULTS = {
  voice: VOICES.HoaiMy,
  rate: '+5%',
  format: '16:9',
  theme: 'dark',
  music: 'calm',
  musicLevel: 'mid',
  sfx: 'on',
  transition: 'fade',
  transitionDuration: 0.5,
  beatSync: 'on',
  videosDir: path.join(os.homedir(), 'Videos', 'reelmaker'),
};

export function readConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')), saved: true };
  } catch {
    return { ...DEFAULTS, saved: false };
  }
}

function writeConfig(cfg) {
  const { saved, ...rest } = cfg;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(rest, null, 2) + '\n');
}

// Giá trị người dùng nhập → giá trị lưu; trả về null nếu không hợp lệ.
const PARSE = {
  voice: (v) =>
    VOICES[v] ??
    (/^[a-z]{2}-[A-Z]{2}-\w+Neural$/.test(v) ? v : /^vieneu:\S/.test(v) ? v : null),
  rate: (v) => (/^[+-]\d{1,2}%$/.test(v) ? v : /^\d{1,2}$/.test(v) ? `+${v}%` : null),
  format: (v) => (FORMATS[v] ? v : null),
  theme: (v) => (THEMES[v] ? v : null),
  music: (v) => (v in MUSIC_MOODS ? v : null),
  musicLevel: (v) => (MUSIC_LEVELS[v] ? v : null),
  sfx: (v) => (SFX_MODES[v] ? v : null),
  transition: (v) => {
    try {
      resolveTransition(v);
      return v;
    } catch {
      return null;
    }
  },
  // giây; nhanh / vừa / chậm hoặc một số 0.1–2
  transitionDuration: (v) => {
    const n = { fast: 0.3, normal: 0.5, slow: 0.8 }[v] ?? Number(v);
    return n >= 0.1 && n <= 2 ? n : null;
  },
  beatSync: (v) => (['on', 'off'].includes(v) ? v : null),
  videosDir: (v) => path.resolve(v.replace(/^~(?=$|\/)/, os.homedir())),
};

const QUESTIONS = [
  ['voice', 'Giọng đọc mặc định', [], 'gõ số hoặc tên giọng trong danh sách trên; nghe thử tất cả: reelmaker voices --sample'],
  ['rate', 'Tốc độ đọc', ['+0%', '+5%', '+10%', '-5%'], 'vd +10% nhanh hơn, -5% chậm hơn'],
  ['format', 'Khung hình', Object.keys(FORMATS), '16:9 YouTube, 9:16 TikTok/Reels, 1:1 Facebook/Instagram'],
  ['theme', 'Giao diện', Object.keys(THEMES), 'dark = nền tối, light = nền sáng'],
  ['music', 'Nhạc nền', Object.keys(MUSIC_MOODS), 'calm = nhẹ nhàng, upbeat = vui tươi, acoustic = guitar mộc, epic = hùng tráng, none = không nhạc'],
  ['musicLevel', 'Độ to nhạc nền', Object.keys(MUSIC_LEVELS), 'low = nhỏ, mid = vừa, high = to (luôn tự nhỏ lại khi có giọng đọc)'],
  ['sfx', 'Tiếng hiệu ứng', Object.keys(SFX_MODES), 'on = bật, soft = nhẹ, off = tắt (whoosh khi chuyển cảnh, pop khi nhãn hiện)'],
  ['transition', 'Chuyển cảnh', ['fade', 'fadeblack', 'slideleft', 'gl:crosswarp', 'cut'],
    'fade = mờ dần, cut = cắt thẳng, hoặc tên bất kỳ trong: reelmaker transitions (gl:… là hiệu ứng WebGL)'],
  ['beatSync', 'Cắt cảnh theo nhịp nhạc', ['on', 'off'], 'on = chuyển cảnh rơi đúng tiếng trống (kéo dài phần nghỉ sau lời tối đa 0.6s), off = tắt'],
  ['transitionDuration', 'Độ dài chuyển cảnh', ['fast', 'normal', 'slow'], 'fast = 0.3s, normal = 0.5s, slow = 0.8s, hoặc số giây (0.1–2)'],
  ['videosDir', 'Thư mục lưu video', [], ''],
];

const shown = (key, value) => (key === 'voice' ? value.replace(/^vieneu:/, '').replace(/^vi-VN-|Neural$/g, '') : value);

// Kiểm tra máy: in từng mục và trả về số mục thiếu.
export async function doctor({ log = console.log } = {}) {
  const checks = [
    ['Node.js ≥ 20', async () => Number(process.versions.node.split('.')[0]) >= 20 || `đang dùng ${process.version}`, 'cài Node 20+ (nvm install 22)'],
    ['ffmpeg', () => run('ffmpeg', ['-version']).then(() => true), 'brew install ffmpeg'],
    ['ffprobe', () => run('ffprobe', ['-version']).then(() => true), 'brew install ffmpeg'],
    ['Chrome', async () => CHROME_CANDIDATES.some((p) => p && fs.existsSync(p)) || 'không thấy', 'cài Google Chrome, hoặc đặt CHROME_PATH'],
    ['edge-tts', () => listVoices('vi-VN').then((v) => v.length > 0 || 'không lấy được danh sách giọng'),
      `cd ${HOME} && python3 -m venv .venv && .venv/bin/pip install edge-tts (cần mạng)`],
    ['puppeteer-core', async () => fs.existsSync(path.join(HOME, 'node_modules', 'puppeteer-core')) || 'chưa cài', `cd ${HOME} && npm install`],
    ['VieNeu-TTS (tuỳ chọn)', async () => fs.existsSync(ENGINES.vieneu.python) || 'chưa cài',
      `cd ${HOME} && uv venv -p python3.11 .venv-vieneu && VIRTUAL_ENV=.venv-vieneu uv pip install vieneu`, true],
    ['Whisper (tuỳ chọn, phụ đề VieNeu khớp từng chữ)', async () => fs.existsSync(WHISPER.python) || 'chưa cài',
      `cd ${HOME} && python3.11 -m venv .venv-whisper && .venv-whisper/bin/pip install faster-whisper`, true],
    ['potrace (tuỳ chọn, reelmaker lineart)', () => run('potrace', ['--version']).then(() => true), 'brew install potrace', true],
    ['Khoá Pixabay (tuỳ chọn, ảnh + video stock)', async () => Boolean(getKey('pixabay')) || 'chưa có (Wikimedia vẫn dùng được)',
      `tạo tài khoản miễn phí ở pixabay.com, lấy khoá ở ${KEY_NAMES.pixabay.signup}, rồi chạy trong terminal: reelmaker keys set pixabay`, true],
  ];
  let missing = 0;
  for (const [name, check, fix, optional] of checks) {
    let result;
    try {
      result = await check();
    } catch (e) {
      result = e.code === 'ENOENT' ? 'không có' : e.message.split('\n')[0];
    }
    if (result === true) log(`  ✓ ${name}`);
    else if (optional) log(`  ○ ${name}: ${result}\n      → ${fix}`);
    else {
      missing++;
      log(`  ✗ ${name}: ${result}\n      → ${fix}`);
    }
  }
  return missing;
}

// reelmaker setup: kiểm tra máy rồi hỏi các lựa chọn mặc định.
// Có cờ (--voice …) thì lấy từ cờ, không hỏi; --no-input giữ nguyên những gì không có cờ.
export async function setup(flags, { log = console.log } = {}) {
  log('Kiểm tra máy');
  const missing = await doctor({ log });
  const cfg = readConfig();
  const given = QUESTIONS.filter(([key]) => flags[key] !== undefined);
  const ask = !flags['no-input'] && given.length === 0 && process.stdin.isTTY;

  const voices = given.some(([k]) => k === 'voice') || ask ? await allVoices() : [];
  for (const [key] of given) {
    // giọng: tên ngắn của cả hai bộ đọc ("HoaiMy", "Quốc Tuấn") hoặc id đầy đủ
    const value = key === 'voice' ? resolveVoice(flags[key], voices) ?? PARSE.voice(String(flags[key])) : PARSE[key](String(flags[key]));
    if (value === null) throw new Error(`--${key} "${flags[key]}" không hợp lệ`);
    cfg[key] = value;
  }

  if (ask) {
    log('\nLựa chọn mặc định (Enter = giữ nguyên)');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (const [key, label, options, hint] of QUESTIONS) {
        if (key === 'voice') {
          // một danh sách chung cho edge-tts và VieNeu, chọn bằng số hoặc tên
          voices.forEach((v, i) => log(`  ${String(i + 1).padStart(3)}. ${v.star ? '⭐' : '  '} ${v.name.padEnd(16)}${v.about.padEnd(26)}${v.engine}`));
        }
        if (hint) log(`  ${hint}`);
        const opts = options.length ? ` [${options.join(' / ')}]` : '';
        for (;;) {
          const answer = (await rl.question(`  ${label}${opts} (${shown(key, cfg[key])}): `)).trim();
          if (!answer) break;
          const value = key === 'voice' ? resolveVoice(answer, voices) ?? PARSE.voice(answer) : PARSE[key](answer);
          if (value !== null) {
            cfg[key] = value;
            break;
          }
          log('    không hợp lệ, nhập lại');
        }
      }
    } finally {
      rl.close();
    }
  }

  writeConfig(cfg);
  log(`\nĐã lưu ${FILE}`);
  for (const [key, label] of QUESTIONS) log(`  ${label}: ${shown(key, cfg[key])}`);
  if (missing) log(`\n⚠ Còn ${missing} mục thiếu ở trên: cài rồi chạy lại reelmaker setup.`);
  return missing;
}

const FIXED_STYLES = ['news', 'meme', 'metro', 'engraving', 'vox', 'math', 'listening'];

// Áp thiết lập vào project mới: khung hình, giọng, tốc độ trong video.json và bảng màu trong shared.css.
export function applyToProject(dest, cfg) {
  const jsonFile = path.join(dest, 'video.json');
  const video = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  // các kiểu có bố cục riêng (tin nóng dọc, meme vuông, tranh khắc, phóng sự, toán, luyện nghe): giữ khung, tốc độ, chuyển cảnh của mẫu
  const fixed = FIXED_STYLES.includes(video.style);
  // luyện nghe tiếng Anh: giọng đặt theo từng cảnh (Anh / Việt), không lấy giọng mặc định
  Object.assign(video, fixed ? {} : FORMATS[cfg.format], video.style === 'listening' ? {} : { voice: cfg.voice }, fixed ? {} : { rate: cfg.rate, transition: cfg.transition, transitionDuration: cfg.transitionDuration }, SFX_MODES[cfg.sfx], { beatSync: cfg.beatSync !== 'off' }, {
    musicLevel: MUSIC_LEVELS[cfg.musicLevel],
    // loại nhạc muốn tìm ở Bước 3 (reelmaker music); không phải file nhạc, render bỏ qua trường này
    musicMood: MUSIC_MOODS[cfg.music] ?? 'none',
  });
  fs.writeFileSync(jsonFile, JSON.stringify(video, null, 2) + '\n');

  // kiểu bảng trắng có bảng màu riêng (giấy kem, mực đen): không áp giao diện sáng/tối
  if (['whiteboard', ...FIXED_STYLES].includes(video.style)) return;
  const cssFile = path.join(dest, 'shared.css');
  const t = THEMES[cfg.theme];
  const vars = `:root {\n  --bg: ${t.bg};\n  --fg: ${t.fg};\n  --muted: ${t.muted};\n  --accent: ${t.accent};\n  --warm: ${t.warm};\n}`;
  fs.writeFileSync(cssFile, fs.readFileSync(cssFile, 'utf8').replace(/:root \{[^}]*\}/, vars));
}
