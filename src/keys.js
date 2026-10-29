// Khoá API của các dịch vụ (hiện có: pixabay), lưu ở ~/.reelmaker/keys.json (chỉ chủ máy đọc được).
// Biến môi trường PIXABAY_API_KEY được ưu tiên hơn file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FILE = path.join(os.homedir(), '.reelmaker', 'keys.json');
export const KEY_NAMES = { pixabay: { env: 'PIXABAY_API_KEY', signup: 'https://pixabay.com/api/docs/ (đăng nhập, key nằm ở mục "Parameters")' } };

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function getKey(name) {
  return process.env[KEY_NAMES[name]?.env] || readAll()[name] || null;
}

export function setKey(name, value) {
  if (!KEY_NAMES[name]) throw new Error(`không biết khoá "${name}" (có: ${Object.keys(KEY_NAMES).join(', ')})`);
  const all = readAll();
  if (value) all[name] = value;
  else delete all[name];
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(FILE, 0o600);
}

export function listKeys() {
  return Object.keys(KEY_NAMES).map((name) => {
    const v = getKey(name);
    return { name, set: Boolean(v), shown: v ? `${v.slice(0, 4)}…${v.slice(-3)}` : null };
  });
}

// Đọc khoá từ bàn phím mà không hiện lên màn hình.
export function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) return reject(new Error('cần chạy trong terminal (Terminal/iTerm), không chạy qua Claude'));
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        stdout.write('\n');
        resolve(value.trim());
      } else if (ch === '\u0003') {
        stdin.setRawMode(false);
        stdout.write('\n');
        reject(new Error('đã huỷ'));
      } else if (ch === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}
