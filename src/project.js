// Đọc video.json của một project và điền giá trị mặc định.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readConfig } from './config.js';
import { readCredits, creditsPage } from './credits.js';

const DEFAULTS = {
  width: 1920,
  height: 1080,
  fps: 30,
  voice: 'vi-VN-HoaiMyNeural',
  rate: '+0%',
  captions: true,
  captionStyle: 'line', // 'line': cả dòng; 'karaoke': chữ to kiểu TikTok, từ đang đọc sáng lên
  captionMaxWords: 8,
  lead: 0.3, // giây im lặng trước giọng đọc mỗi cảnh
  tail: 0.6, // giây giữ lại sau khi đọc xong
  music: null,
  musicLevel: -30, // LUFS của nhạc nền trước khi trộn; -26 to hơn, -34 nhỏ hơn
  musicVolume: 1,
  musicStart: 0, // bắt đầu nhạc từ giây này
  sfx: true,
  sfxVolume: 1,
  transition: 'fade', // chuyển VÀO mỗi cảnh: "cut", tên xfade (fade, slideleft…) hoặc "gl:<tên>" (gl:cube…)
  transitionDuration: 0.5,
  beatSync: false, // true: chuyển cảnh rơi đúng nhịp nhạc nền (cần "music")
  output: 'out/video.mp4',
};

export function loadProject(dir) {
  const root = path.resolve(dir);
  const file = path.join(root, 'video.json');
  if (!fs.existsSync(file)) throw new Error(`không thấy ${file} (tạo bằng: reelmaker new ${dir})`);
  const { voice, rate } = readConfig();
  const cfg = { ...DEFAULTS, voice, rate, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  if (!Array.isArray(cfg.scenes) || cfg.scenes.length === 0) throw new Error('video.json chưa có scenes');
  const ids = new Set();
  cfg.scenes = cfg.scenes.map((s, i) => {
    const scene = { voice: cfg.voice, rate: cfg.rate, pitch: cfg.pitch, lead: cfg.lead, tail: cfg.tail, ...s };
    scene.id ??= String(i + 1).padStart(2, '0');
    if (ids.has(scene.id)) throw new Error(`trùng id cảnh "${scene.id}"`);
    ids.add(scene.id);
    if (!scene.html) throw new Error(`cảnh ${scene.id} thiếu "html"`);
    scene.htmlPath = path.join(root, scene.html);
    if (!scene.narration && !scene.duration) throw new Error(`cảnh ${scene.id} cần "narration" hoặc "duration"`);
    return scene;
  });
  const project = { root, cfg, build: path.join(root, 'build') };
  addCreditsScene(project);
  return project;
}

// Cảnh ghi nguồn 4 giây ở cuối: mặc định tắt (nguồn ghi trong mô tả khi đăng, reelmaker publish → mo-ta.txt);
// bật bằng "credits": true trong video.json.
function addCreditsScene(project) {
  const credits = readCredits(project);
  if (!credits.length || project.cfg.credits !== true) return;
  const html = path.join(project.build, 'credits.html');
  fs.mkdirSync(project.build, { recursive: true });
  const content = creditsPage(project, credits);
  if (!fs.existsSync(html) || fs.readFileSync(html, 'utf8') !== content) fs.writeFileSync(html, content);
  project.cfg.scenes.push({
    id: 'zz-nguon', html: 'build/credits.html', htmlPath: html, duration: 4, captions: false,
    voice: project.cfg.voice, rate: project.cfg.rate, lead: 0, tail: 0, generated: true,
  });
}

export function hash(...parts) {
  const h = crypto.createHash('sha256');
  for (const p of parts) h.update(typeof p === 'string' ? p : JSON.stringify(p)).update('\0');
  return h.digest('hex').slice(0, 16);
}

export function findScene(project, id) {
  const scene = project.cfg.scenes.find((s) => s.id === id);
  if (!scene) throw new Error(`không có cảnh "${id}" (có: ${project.cfg.scenes.map((s) => s.id).join(', ')})`);
  return scene;
}
