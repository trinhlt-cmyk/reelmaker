// Chạy lệnh ngoài (ffmpeg, python) và báo lỗi kèm stderr.
import { spawn } from 'node:child_process';

// Trả stdout; với { stderr: true } trả stderr (ffmpeg ghi kết quả phân tích ra đó).
export function run(cmd, args, { input, stderr = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(stderr ? err : out) : reject(new Error(`${cmd} lỗi (mã ${code}):\n${err.slice(-2000)}`)),
    );
    if (input !== undefined) child.stdin.end(input);
  });
}

export async function mediaDuration(file) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseFloat(out);
}
