// Nối các cảnh thành video cuối, trộn nhạc nền (nếu có) và chuẩn hoá âm lượng.
import fs from 'node:fs';
import path from 'node:path';
import { run, mediaDuration } from './exec.js';
import { joinWithTransitions } from './transitions.js';

// Âm lượng chuẩn của YouTube/TikTok/Reels; đỉnh chừa 1.5 dB để không rè khi nền tảng nén lại.
const LOUDNESS = 'I=-14:TP=-1.5:LRA=11';

export async function assemble(project, sceneFiles, { browser } = {}) {
  const { cfg, root, build } = project;
  const out = path.resolve(root, cfg.output);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  // có chuyển cảnh: nối bằng xfade / GL; không: nối thẳng, giữ nguyên hình (nhanh)
  let joined = await joinWithTransitions(project, sceneFiles, { browser });
  if (!joined) {
    const list = path.join(build, 'concat.txt');
    fs.writeFileSync(list, sceneFiles.map((f) => `file '${f.replaceAll("'", "'\\''")}'`).join('\n'));
    joined = path.join(build, 'joined.mp4');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
  }
  const total = await mediaDuration(joined);

  const inputs = ['-i', joined];
  let mix = '[0:a]anull[mix]';
  if (cfg.music) {
    const music = path.resolve(root, cfg.music);
    if (!fs.existsSync(music)) throw new Error(`không thấy file nhạc ${cfg.music}`);
    inputs.push('-ss', String(cfg.musicStart ?? 0), '-stream_loop', '-1', '-i', music);
    const fadeAt = Math.max(0, total - 2).toFixed(2);
    // mỗi bài nhạc to nhỏ khác nhau: đưa về cùng mức (musicLevel LUFS, mặc định -30 ≈ dưới giọng 12 dB),
    // lặp cho đủ dài, nhỏ lại khi có giọng đọc (sidechain), mờ dần 2 giây cuối
    mix = [
      `[1:a]aresample=48000,loudnorm=I=${cfg.musicLevel}:TP=-6:LRA=20,volume=${cfg.musicVolume},afade=t=in:d=1,afade=t=out:st=${fadeAt}:d=2[m]`,
      `[0:a]asplit=2[v][sc]`,
      `[m][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck]`,
      `[v][duck]amix=inputs=2:duration=first:normalize=0[mix]`,
    ].join(';');
  }

  // lượt 1: đo âm lượng của bản trộn
  const measure = await run('ffmpeg', [
    '-hide_banner', '-nostats', ...inputs, '-t', total.toFixed(3),
    '-filter_complex', `${mix};[mix]loudnorm=${LOUDNESS}:print_format=json[a]`, '-map', '[a]', '-f', 'null', '-',
  ], { stderr: true });
  const m = JSON.parse(measure.slice(measure.lastIndexOf('{'), measure.lastIndexOf('}') + 1));
  const measured = `measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}`;

  // lượt 2: chỉnh tuyến tính theo số đo (giữ nguyên độ to nhỏ tự nhiên của giọng)
  await run('ffmpeg', [
    '-y', '-loglevel', 'error', ...inputs,
    '-filter_complex', `${mix};[mix]loudnorm=${LOUDNESS}:${measured}:linear=true,aresample=48000[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-t', total.toFixed(3), '-movflags', '+faststart', out,
  ]);
  fs.rmSync(joined);
  return out;
}
