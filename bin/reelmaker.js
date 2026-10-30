#!/usr/bin/env node
// reelmaker: làm video giải thích từ các cảnh HTML + giọng đọc edge-tts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject, findScene } from '../src/project.js';
import { voiceScene, listVoices, listVieneuVoices, voiceSamples, allVoices, resolveVoice, sayText, ENGINES } from '../src/voice.js';
import { cloneVoice, listClones, removeClone } from '../src/clone.js';
import { BUILTIN_FILE, USER_FILE, readUserDict, writeUserDict, mergedDict, builtinDict, riskyWords, isVietnamese } from '../src/pronounce.js';
import { launchBrowser, renderScene, stills } from '../src/render.js';
import { assemble } from '../src/assemble.js';
import { readConfig, setup, doctor, applyToProject } from '../src/config.js';
import { check, printReport } from '../src/check.js';
import { searchMedia, useMedia } from '../src/media.js';
import { searchMusic, useMusic } from '../src/music.js';
import { XFADE, glLibrary, previewSheets } from '../src/transitions.js';
import { run } from '../src/exec.js';
import { beatPlan } from '../src/beats.js';
import { makeThumbnails } from '../src/thumbnail.js';
import { startStudio, readComments, updateComment } from '../src/studio.js';
import { writeSrt } from '../src/srt.js';
import { listStyles, styleDir, saveStyle } from '../src/styles.js';
import { publish, PLATFORMS } from '../src/publish.js';
import { addLottie } from '../src/lottie.js';
import os from 'node:os';
import { KEY_NAMES, setKey, listKeys, readHidden } from '../src/keys.js';

const HOME = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const HELP = `reelmaker — video từ cảnh HTML + giọng đọc

  reelmaker setup                         kiểm tra máy + chọn giọng, khung hình, giao diện, nhạc, tiếng hiệu ứng mặc định
     [--voice "<tên hoặc số trong reelmaker voices>"] [--rate +5%] [--format 16:9|9:16|1:1] [--theme dark|light]
     [--music calm|upbeat|acoustic|epic|none] [--musicLevel low|mid|high] [--sfx on|soft|off]
     [--transition fade|slideleft|gl:cube|cut|…] [--transitionDuration fast|normal|slow|0.6] [--beatSync on|off] [--videosDir …]
  reelmaker doctor                        chỉ kiểm tra máy
  reelmaker config                        in thiết lập hiện tại (JSON)
  reelmaker new <tên | thư mục> [--style whiteboard|news|meme|map|metro|engraving|vox|math|listening]
                                          tạo project mẫu (chỉ tên → trong thư mục lưu video);
                                          --style whiteboard: kiểu bảng trắng, bàn tay vẽ từng nét
                                          --style news: tin nóng dọc 9:16 kiểu TikTok, phụ đề karaoke
                                          --style meme: meme người que, vuông, lặp liền mạch
                                          --style map: bản đồ lộ trình du lịch (rồi: reelmaker map <thư mục>)
                                          --style metro: căn hộ / địa điểm gần ga, dọc 9:16, tuyến metro vẽ qua từng ga
                                          --style engraving: tranh khắc cổ màu nâu, kể chuyện lịch sử
                                          --style vox: phóng sự kiểu Vox, ảnh tư liệu cắt dán, bút dạ quang
                                          --style math: toán kiểu 3Blue1Brown, nền tối, hình và công thức vẽ dần
                                          --style listening: luyện nghe tiếng Anh, đọc chậm, chép chính tả, song ngữ
  reelmaker keys [set|remove pixabay]     xem / nhập (ẩn) / xoá khoá API — chạy trong terminal
  reelmaker voices [lọc]               liệt kê giọng edge-tts và VieNeu (mặc định vi-VN)
  reelmaker voices --sample [--text "…"] [--rate -10%] [--only vieneu|edge]
                                          nghe thử mọi giọng: một file mp3, mỗi giọng đọc tên mình rồi câu mẫu
  reelmaker say "chữ hoặc câu" [--as "cách đọc"] [--voice …] [--rate +20%] [--pitch +15Hz]
                                          nghe thử cách đọc; --as lưu vào từ điển phát âm (số, tiền, ngày tự đổi)
  reelmaker say --list | --remove "chữ" | --check <thư mục>
                                          xem từ điển / bỏ một từ / tìm chữ trong kịch bản dễ bị đọc sai
  reelmaker voice-clone <file ghi âm> [file…] --name "Tên" [--consent] [--separate]
                                          nhân bản giọng (của bạn / người đã đồng ý) từ 3–60 giây ghi âm → "voice": "clone:Tên"
                                          --separate: tách lời khỏi nhạc nền trước (bài hát, video có nhạc; cần Demucs)
  reelmaker voice-clone --list | --remove "Tên"
  reelmaker voice <thư mục>               tạo giọng đọc, in thời lượng từng cảnh
  reelmaker still <thư mục> <cảnh> [t,…]  chụp ảnh cảnh tại các giây (vd 0.5,3,end)
  reelmaker images <thư mục> "từ khoá" [--video] [--source all|wikimedia|pixabay] [--count 9] [--any]
                                          tìm ảnh/video miễn phí, tải bản xem trước + bảng ảnh có mã
  reelmaker images <thư mục> --use <mã> [--as tên]
                                          lấy ảnh/video vào assets/, ghi nguồn vào credits.json
  reelmaker music <thư mục> "từ khoá" [--count 6]
                                          tìm nhạc nền miễn phí (Wikimedia), file nghe thử các bài
  reelmaker music <thư mục> --use <mã> [--start giây]
                                          đặt làm nhạc nền (assets/nhac-nen.mp3), ghi nguồn
  reelmaker music <thư mục> --off         bỏ nhạc nền
  reelmaker hand <ảnh> [--tip x,y] [--rotate 45] [--erase "x1,y1,x2,y2"] [--project <thư mục>]
                                          đổi bàn tay cho kiểu bảng trắng (ảnh tay cầm bút trên phông xanh lá)
  reelmaker map <thư mục> --transit "Văn Quán; Phùng Khoang; …; Cát Linh" [--from "<địa chỉ>"] [--to "Văn Miếu"] [--city "Hà Nội"]
                                          tuyến metro / tàu: bản đồ tối, tuyến vẽ qua từng ga, km + phút mỗi ga, đi bộ nét chấm
  reelmaker lottie <thư mục> <file.json|file.lottie|https://…> [--as tên] [--author "…" --license "…"]
                                          lấy hoạt hình Lottie (vd từ lottiefiles.com) vào cảnh, chạy theo thời gian cảnh
  reelmaker lineart <thư mục> <ảnh> --scene <id> [--draw 0.3-4.5] [--color auto|none|4.7] [--mode lines|sketch]
                                          biến ảnh thành tranh nét cho bàn tay vẽ lại (kiểu bảng trắng)
  reelmaker studio <thư mục>              mở trang xem video + ghim góp ý lên khung hình (127.0.0.1:4173)
  reelmaker comments <thư mục> [--all] [--json] | --done <id> [--reply "…"] | --answer <id> | --dismiss <id>
                                          đọc / đánh dấu góp ý từ studio
  reelmaker map <thư mục> --scene <id> --stops "Hà Nội; Ninh Bình; Sầm Sơn, Thanh Hoá" [--mode drive|flight|line]
                                          bản đồ lộ trình: đường vẽ dần, xe chạy, máy quay bám theo (OpenStreetMap)
  reelmaker style save <thư mục> --name <tên> [--description "…"]
                                          lưu video ưng ý thành mẫu riêng (dùng: reelmaker new <tên> --style <mẫu>)
  reelmaker styles [--remove <tên>]       liệt kê / xoá mẫu riêng
  reelmaker publish <thư mục> [--platforms youtube,tiktok,shorts,reels,facebook,square] [--max-mb 50]
                                          bộ để đăng out/dang/: video từng nền tảng, ảnh bìa, SRT, mô tả + ghi nguồn
  reelmaker srt <thư mục>                 xuất phụ đề out/video.srt (tự xuất mỗi lần render)
  reelmaker thumbnail <thư mục> [--title "Chữ *từ khoá* vàng"] [--kicker "Bạn có biết?"] [--scene id] [--count 3]
                                          ảnh bìa YouTube 1280×720 / TikTok 1080×1920 → out/thumbnail.jpg
  reelmaker transitions [--sheet]      liệt kê chuyển cảnh (58 ffmpeg + 125 gl:…); --sheet: bảng ảnh xem trước
  reelmaker render <thư mục> [--scene id,…] [--force] [--jobs N]
                                          render các cảnh và ghép thành MP4
  reelmaker check <thư mục> [--scene id,…] [--no-video] [--json]
                                          tìm lỗi: chữ tràn/đè/bị phụ đề che, font, tương phản,
                                          cảnh trống, khung đen, hình đứng, im lặng, âm lượng
`;

async function ask(question) {
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

function parse(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) args.push(a);
    else if (['--force', '--no-input', '--no-video', '--json', '--video', '--vertical', '--horizontal', '--off', '--sheet', '--any', '--no-open', '--all', '--sample', '--list', '--no-play', '--consent', '--separate'].includes(a)) flags[a.slice(2)] = true;
    else flags[a.slice(2)] = argv[++i];
  }
  return { args, flags };
}

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

const commands = {
  async setup(_, flags) {
    await setup(flags);
  },

  async doctor() {
    if (await doctor()) process.exitCode = 1;
  },

  async config() {
    console.log(JSON.stringify(readConfig(), null, 2));
  },

  async new([dir], flags) {
    if (!dir) throw new Error('thiếu tên thư mục');
    const cfg = readConfig();
    const styles = { default: 'template', whiteboard: 'template-whiteboard', news: 'template-news', meme: 'template-meme', map: 'template-map', engraving: 'template-engraving', vox: 'template-vox', math: 'template-math', listening: 'template-listening', metro: 'template-metro' };
    const style = flags.style ?? 'default';
    const own = styles[style] ? null : styleDir(style);
    if (!styles[style] && !own) throw new Error(`không có kiểu "${style}" (có sẵn: ${Object.keys(styles).join(', ')}; mẫu riêng: ${listStyles().map((x) => x.name).join(', ') || 'chưa có'})`);
    const dest = dir.includes('/') ? path.resolve(dir) : path.join(cfg.videosDir, dir);
    if (fs.existsSync(dest) && fs.readdirSync(dest).length) throw new Error(`${dest} đã có file`);
    fs.cpSync(own ?? path.join(HOME, styles[style]), dest, { recursive: true });
    // mẫu riêng giữ nguyên cài đặt đã lưu (giọng, nhạc, khung…); kiểu có sẵn nhận thiết lập mặc định
    if (!own) applyToProject(dest, cfg);
    const made = JSON.parse(fs.readFileSync(path.join(dest, 'video.json'), 'utf8'));
    console.log(`✓ tạo ${dest} (${style === 'default' ? cfg.theme : style}, ${made.width}×${made.height}, ${made.voice}, ${made.rate})`);
    if (!cfg.saved) console.log('  chưa chạy reelmaker setup: đang dùng thiết lập mặc định');
  },

  async voices([filter = 'vi-VN'], flags) {
    if (flags.sample) {
      // reelmaker voices --sample [--text "…"] [--rate -10%] [--only vieneu|edge]
      const edge = flags.only === 'vieneu' ? [] : (await listVoices(filter)).map((l) => l.split(/\s+/)[0]).filter(Boolean);
      const vieneu = flags.only === 'edge' ? [] : (await listVieneuVoices()).map((v) => v.id);
      const text = flags.text ?? 'Chỉ vài giờ từ Hà Nội, có một bãi biển vừa để tắm, vừa để leo núi, vừa để ăn hải sản.';
      console.log(`Đọc thử ${edge.length + vieneu.length} giọng (giọng đã đọc lần trước không đọc lại)…`);
      const { out, parts } = await voiceSamples([...edge, ...vieneu], text, { rate: flags.rate });
      const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      console.log(`\n✓ ${out}`);
      for (const p of parts) console.log(`  ${mmss(p.at).padStart(5)}  ${p.id}`);
      return;
    }
    // một danh sách chung cho cả hai bộ đọc; cột cuối nói khác biệt (mạng, độ khớp phụ đề)
    const rows = await allVoices(filter);
    const w = Math.max(...rows.map((r) => r.name.length)) + 2;
    console.log(`Giọng đọc (⭐ = nổi bật; nghe thử tất cả: reelmaker voices --sample)\n`);
    rows.forEach((r, i) => console.log(`  ${String(i + 1).padStart(3)}. ${r.star ? '⭐' : '  '} ${r.name.padEnd(w)}${r.about.padEnd(26)}${r.engine}`));
    console.log('\n  Dùng: reelmaker setup --voice "<tên hoặc số>" (mặc định), hoặc "voice" trong video.json');
    if (filter.startsWith('vi') && !rows.some((r) => r.id.startsWith('vieneu:'))) console.log('\n  (giọng VieNeu offline chưa cài: reelmaker doctor)');
  },

  async voice([dir], flags) {
    const project = loadProject(dir);
    let total = 0;
    for (const scene of project.cfg.scenes) {
      const v = await voiceScene(project, scene, { force: flags.force });
      const d = scene.duration ?? (v.audio ? scene.lead : 0) + v.duration + scene.tail;
      total += d;
      console.log(`  cảnh ${scene.id}: ${d.toFixed(1)}s${v.audio ? ` (giọng ${v.duration.toFixed(1)}s)` : ''}`);
    }
    console.log(`  tổng: ${total.toFixed(1)}s`);
  },

  async still([dir, id, times = '0.5,end'], flags) {
    if (!id) throw new Error('thiếu id cảnh');
    const project = loadProject(dir);
    const { files, duration } = await stills(project, findScene(project, id), times.split(','));
    console.log(`cảnh ${id} dài ${duration.toFixed(2)}s:\n${files.map((f) => `  ${f}`).join('\n')}`);
  },

  // reelmaker voice-clone <file ghi âm> --name "Lê" --consent | --list | --remove "Lê"
  async 'voice-clone'(files, flags) {
    const file = files[0];
    if (flags.list) {
      const clones = listClones();
      if (!clones.length) return console.log('chưa có giọng nhân bản nào');
      for (const c of clones) console.log(`  ${c.name.padEnd(18)} ${String(c.seconds).padStart(5)}s  từ ${c.source}  (${c.created.slice(0, 10)})  → "voice": "clone:${c.name}"`);
      return;
    }
    if (flags.remove) {
      removeClone(flags.remove);
      return console.log(`✓ đã xoá giọng nhân bản "${flags.remove}"`);
    }
    if (!file || !flags.name) throw new Error('dùng: reelmaker voice-clone <file ghi âm 3–60 giây> [file…] --name "<tên>" [--consent] [--separate] [--denoise on|off]');
    // chỉ giọng của chính mình, hoặc người đã đồng ý
    if (!flags.consent) {
      if (!process.stdin.isTTY) throw new Error('cần xác nhận: đây là giọng của bạn hoặc người đã đồng ý cho dùng → thêm --consent');
      const ok = await ask('Đây là giọng của bạn, hoặc của người đã đồng ý cho bạn dùng? (c/k) ');
      if (!/^(c|có|y|yes)$/i.test(ok.trim())) throw new Error('không nhân bản: chỉ dùng giọng của bạn hoặc người đã đồng ý');
    }
    const c = await cloneVoice(files.map((f) => path.resolve(f)), { name: flags.name, denoise: flags.denoise ?? 'auto', separate: Boolean(flags.separate), ...ENGINES.vieneu });
    console.log(`✓ giọng nhân bản "${c.name}" (${c.seconds}s ghi âm): ${c.dir}`);
    console.log(`  bản ghi: tiếng nói to hơn nền ${c.snrDb} dB → ${c.denoise ? 'đã lọc tạp âm' : 'không lọc tạp âm (đủ sạch)'}${c.windows > 1 ? `; ${c.windows} đoạn 8 giây, mẫu chính từ giây ${c.bestAt}` : ''}`);
    if (c.snrDb < 20) console.log(`  ⚠ bản ghi khá ồn${c.separated ? '' : ' (có nhạc nền? thêm --separate để tách lời khỏi nhạc)'}: bản ghi sạch hơn thì giọng giống hơn`);
    if (c.seconds < 20) console.log('  mẹo: bản ghi 30–60 giây (nhiều câu, nhiều âm khác nhau) cho giọng ổn định hơn');
    console.log(`  nghe thử: reelmaker say "Xin chào, đây là giọng của tôi." --voice "clone:${c.name}"`);
    console.log(`  dùng: "voice": "clone:${c.name}" trong video.json, hoặc reelmaker setup --voice "${c.name}"`);
  },

  // reelmaker say "iPhone" [--as "ai phôn"] | --remove "iPhone" | --list | --check <thư mục>
  async say([text], flags) {
    if (flags.list) {
      const user = readUserDict();
      const builtin = Object.keys(builtinDict()).length;
      console.log(`Từ điển của bạn (${USER_FILE}):`);
      for (const [k, v] of Object.entries(user)) console.log(`  ${k.padEnd(20)} → ${v ?? '(bỏ cách đọc có sẵn)'}`);
      if (!Object.keys(user).length) console.log('  (trống)');
      console.log(`\n+ ${builtin} từ có sẵn: ${BUILTIN_FILE}`);
      return;
    }
    if (flags.check) {
      const project = loadProject(flags.check);
      const dict = mergedDict(project);
      const risky = new Map();
      for (const s of project.cfg.scenes) {
        if (!s.narration || !isVietnamese(s.voice, s.narration)) continue;
        for (const w of riskyWords(s.narration, dict)) risky.set(w, [...(risky.get(w) ?? []), s.id]);
      }
      if (!risky.size) return console.log('✓ không thấy chữ nào dễ đọc sai');
      console.log('Chữ có thể đọc sai (chưa có trong từ điển):');
      for (const [w, ids] of risky) console.log(`  ${w.padEnd(20)} cảnh ${ids.join(', ')}`);
      console.log('\n  Nghe thử: reelmaker say "<chữ>"   ·   sửa: reelmaker say "<chữ>" --as "<cách đọc>"');
      return;
    }
    if (flags.remove) {
      const user = readUserDict();
      // từ có sẵn: ghi null để tắt; từ của bạn: xoá
      if (flags.remove in builtinDict()) user[flags.remove] = null;
      else delete user[flags.remove];
      writeUserDict(user);
      console.log(`✓ bỏ cách đọc "${flags.remove}"`);
      return;
    }
    if (!text) throw new Error('dùng: reelmaker say "chữ hoặc câu" [--as "cách đọc"] [--voice …] [--rate +20%] [--pitch +15Hz] | --list | --remove "chữ" | --check <thư mục>');
    if (flags.as) {
      writeUserDict({ ...readUserDict(), [text]: flags.as });
      console.log(`✓ lưu: ${text} → ${flags.as}`);
    }
    const cfg = readConfig();
    let voice = flags.voice ?? cfg.voice;
    if (flags.voice) voice = resolveVoice(flags.voice, await allVoices()) ?? flags.voice;
    const { mp3, spoken } = await sayText(text, { voice, rate: flags.rate ?? cfg.rate, pitch: flags.pitch });
    console.log(`  đọc là: ${spoken}\n  ${mp3}`);
    // người gõ trong terminal: phát luôn
    if (process.stdout.isTTY && !flags['no-play']) await run('afplay', [mp3]).catch(() => {});
  },

  async keys([action, name]) {
    if (!action) {
      for (const k of listKeys()) console.log(`  ${k.set ? '✓' : '○'} ${k.name}${k.set ? `: ${k.shown}` : `: chưa có — lấy miễn phí ở ${KEY_NAMES[k.name].signup}`}`);
      return;
    }
    if (!KEY_NAMES[name]) throw new Error(`dùng: reelmaker keys ${action} <${Object.keys(KEY_NAMES).join('|')}>`);
    if (action === 'remove') {
      setKey(name, null);
      console.log(`✓ đã xoá khoá ${name}`);
    } else if (action === 'set') {
      const value = await readHidden(`Dán khoá ${name} (không hiện trên màn hình) rồi Enter: `);
      if (!value) throw new Error('khoá trống, không lưu');
      setKey(name, value);
      console.log(`✓ đã lưu khoá ${name} vào ~/.reelmaker/keys.json`);
    } else throw new Error('dùng: reelmaker keys [set|remove] <tên>');
  },

  async images([dir, query], flags) {
    const project = loadProject(dir);
    if (flags.use) {
      const { file, item } = await useMedia(project, flags.use, flags.as);
      console.log(`✓ ${file}  (${item.kind === 'video' ? 'video' : 'ảnh'} ${item.width}×${item.height}, ${item.license}, ${item.author})`);
      console.log(item.kind === 'video'
        ? `  trong cảnh: <video src="../${file}" muted playsinline style="object-fit:cover"></video>  (data-start="2" để bắt đầu từ giây 2)`
        : `  trong cảnh: background: url(../${file}) center / cover;   hoặc <img src="../${file}">`);
      if (item.attributionRequired) console.log('  giấy phép yêu cầu ghi nguồn: cảnh "Nguồn ảnh và video" ở cuối video sẽ tự ghi');
      return;
    }
    if (!query) throw new Error('thiếu từ khoá: reelmaker images <thư mục> "từ khoá"');
    const orientation = flags.any ? 'any' : flags.vertical ? 'vertical' : flags.horizontal ? 'horizontal' : undefined;
    const { items, sheet, notes } = await searchMedia(project, query, {
      source: flags.source ?? 'all', video: flags.video, count: Number(flags.count ?? 9), orientation,
    });
    for (const n of notes) console.log(`  ⚠ ${n}`);
    if (!items.length) {
      console.log('  không tìm thấy gì: thử từ khoá tiếng Anh, ngắn hơn, hoặc --source khác');
      process.exitCode = 1;
      return;
    }
    for (const c of items) {
      const what = c.kind === 'video' ? `video ${c.duration}s` : 'ảnh';
      console.log(`  ${c.id.padEnd(24)} ${c.source.padEnd(9)} ${what.padEnd(9)} ${`${c.width}×${c.height}`.padEnd(10)} ${c.license}  ${c.title.slice(0, 50)}`);
    }
    console.log(`\nbảng ảnh: ${sheet}\nlấy một cái: reelmaker images ${dir} --use <mã> --as <tên>`);
  },

  async music([dir, query], flags) {
    const project = loadProject(dir);
    if (flags.off) {
      const file = path.join(project.root, 'video.json');
      const video = JSON.parse(fs.readFileSync(file, 'utf8'));
      delete video.music;
      delete video.musicStart;
      fs.writeFileSync(file, JSON.stringify(video, null, 2) + '\n');
      const credits = path.join(project.root, 'credits.json');
      if (fs.existsSync(credits)) {
        fs.writeFileSync(credits, JSON.stringify(JSON.parse(fs.readFileSync(credits, 'utf8')).filter((c) => c.kind !== 'music'), null, 2) + '\n');
      }
      console.log('✓ đã bỏ nhạc nền');
      return;
    }
    if (flags.use) {
      const { file, item, seconds } = await useMusic(project, flags.use, { start: flags.start });
      console.log(`✓ nhạc nền: ${file} (${Math.round(seconds)}s, ${item.license}, ${item.author})`);
      console.log('  render lại để nghe: reelmaker render ' + dir);
      return;
    }
    if (!query) throw new Error('thiếu từ khoá: reelmaker music <thư mục> "calm acoustic"');
    const { items, playlist, notes } = await searchMusic(project, query, { count: Number(flags.count ?? 6) });
    for (const n of notes) console.log(`  ⚠ ${n}`);
    if (!items.length) {
      console.log('  không tìm thấy bài nào: thử từ khoá tiếng Anh về thể loại/tâm trạng (calm piano, upbeat, acoustic guitar, Kevin MacLeod…)');
      process.exitCode = 1;
      return;
    }
    const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    for (const c of items) {
      console.log(`  ${c.id.padEnd(22)} ${mmss(c.seconds).padStart(5)}  ${c.license.padEnd(12)} ${c.author.slice(0, 22).padEnd(22)} ${c.title.slice(0, 44)}   (nghe ở ${mmss(c.playlistAt)})`);
    }
    console.log(`\nnghe thử lần lượt: ${playlist}\nchọn một bài: reelmaker music ${dir} --use <mã>`);
  },

  // Tuyến metro / tàu: reelmaker map <thư mục> --transit "ga1; ga2; …" [--from …] [--to …] [--city …] [--name metro]
  async transit([dir], flags) {
    if (!dir || !flags.transit) throw new Error('dùng: reelmaker map <thư mục> --transit "Văn Quán; Phùng Khoang; …; Cát Linh" [--from "<địa chỉ | lat,lon>"] [--to "Văn Miếu"] [--city "Hà Nội"] [--name metro] [--min-per-km 1.77] [--walk-kmh 5]');
    const project = loadProject(dir);
    const name = flags.name ?? 'metro';
    const dirOut = path.join(project.root, 'assets', 'map');
    fs.mkdirSync(dirOut, { recursive: true });
    const spec = {
      name, stations: flags.transit.split(';').map((s) => s.trim()).filter(Boolean), city: flags.city ?? 'Hà Nội',
      from: flags.from, to: flags.to, minPerKm: flags['min-per-km'] ? Number(flags['min-per-km']) : undefined,
      walkKmh: flags['walk-kmh'] ? Number(flags['walk-kmh']) : undefined,
    };
    const specFile = path.join(dirOut, `${name}.spec.json`);
    fs.writeFileSync(specFile, JSON.stringify(spec, null, 2));
    console.log(`  … tìm ${spec.stations.length} ga${spec.from ? ', điểm đi' : ''}${spec.to ? ', điểm đến' : ''} và ghép bản đồ (lần đầu ~30–60 giây)`);
    const out = await run(path.join(HOME, '.venv', 'bin', 'python'), ['-I', path.join(HOME, 'tools', 'transit.py'), specFile,
      path.join(dirOut, `${name}.jpg`), path.join(dirOut, `${name}.js`)]);
    const r = JSON.parse(out.trim().split('\n').pop());
    fs.mkdirSync(path.join(project.root, 'lib'), { recursive: true });
    for (const f of ['transit.js', 'transit.css']) fs.copyFileSync(path.join(HOME, 'lib', f), path.join(project.root, 'lib', f));
    const vn = (x) => String(x).replace('.', ',');
    console.log(`✓ assets/map/${name}.jpg + ${name}.js  (${r.size.join('×')}, mức phóng ${r.zoom})`);
    r.stations.forEach(([n, km, min], i) => console.log(`  ga ${i + 1}/${r.stations.length}  ${n.padEnd(16)} ${vn(km).padStart(5)} km  ≈ ${min} phút`));
    if (spec.from) console.log(`  đi bộ tới ga đầu: ${vn(r.walkKm[0])} km ≈ ${r.walkMin[0]} phút`);
    if (spec.to) console.log(`  đi bộ từ ga cuối: ${vn(r.walkKm[1])} km ≈ ${r.walkMin[1]} phút`);
    console.log(`  tổng ≈ ${r.totalMin} phút (ước tính: tàu ${spec.minPerKm ?? 1.77} phút/km, đi bộ ${spec.walkKmh ?? 5} km/h)`);
    console.log(`  kiểm tra vị trí ga trên ảnh bản đồ; ga sai chỗ: ghi "Tên@lat,lon" trong --transit rồi chạy lại
  trong cảnh: <body class="map"> … <link rel="stylesheet" href="../lib/transit.css">
    <script src="../assets/map/${name}.js"></script> <script src="../lib/transit.js"></script>
    <script>Transit.create({ data: '${name}', line: [0.5, 8], cam: { follow: 1 } });</script>`);
  },

  // Hoạt hình Lottie: reelmaker lottie <thư mục> <file|url> [--as tên] [--author … --license … --page …]
  async lottie([dir, src], flags) {
    if (!dir || !src) throw new Error('dùng: reelmaker lottie <thư mục> <file.json|file.lottie|https://…> [--as tên] [--author "…"] [--license "…"] [--page url]');
    const project = loadProject(dir);
    const local = /^https?:/.test(src) ? src : path.resolve(src.replace(/^~(?=\/)/, os.homedir()));
    const r = await addLottie(project, local, { name: flags.as, author: flags.author, license: flags.license, page: flags.page });
    console.log(`✓ ${r.file}  (${r.w}×${r.h}, ${r.fps} khung/giây, ${r.frames} khung = ${r.seconds.toFixed(1)}s)`);
    console.log(`  trong cảnh (trước </body>):
    <div data-lottie="${r.name}" data-start="0.5" style="position:absolute; left:…px; top:…px; width:${Math.min(r.w, 600)}px; height:${Math.round(Math.min(r.w, 600) * r.h / r.w)}px"></div>
    <script src="../lib/lottie.min.js"></script>
    <script src="../assets/lottie/${r.name}.js"></script>
    <script src="../lib/reel-lottie.js"></script>
  tuỳ chọn: data-loop (lặp), data-speed="1.5", data-from="0" data-to="60" (một đoạn), data-hide-before`);
  },

  // Bàn tay cho kiểu bảng trắng: ảnh tay cầm bút trên phông trơn (xanh lá tốt nhất) hoặc PNG nền trong suốt.
  async hand([image], flags) {
    if (!image) throw new Error('dùng: reelmaker hand <ảnh> [--tip x,y] [--rotate 45] [--erase "x1,y1,x2,y2;…"] [--fade 220] [--project <thư mục>]');
    const src = path.resolve(image.replace(/^~(?=\/)/, os.homedir()));
    if (!fs.existsSync(src)) throw new Error(`không thấy ${src}`);
    // mặc định đổi bàn tay cho mọi video bảng trắng mới; --project: chỉ cho một project
    const target = flags.project ? path.resolve(flags.project) : path.join(HOME, 'template-whiteboard');
    const js = path.join(target, 'whiteboard.js');
    if (!fs.existsSync(js)) throw new Error(`${target} không phải project bảng trắng (thiếu whiteboard.js)`);
    const png = path.join(target, 'assets', 'hand.png');
    // ảnh xem trước để ngoài thư mục mẫu (không bị copy vào project mới)
    const preview = path.join(os.homedir(), '.reelmaker', 'hand-preview.jpg');
    fs.mkdirSync(path.dirname(png), { recursive: true });
    const args = [path.join(HOME, 'tools', 'make_hand.py'), src, png, '--preview', preview];
    for (const k of ['tip', 'erase', 'fade']) if (flags[k]) args.push(`--${k}`, flags[k]);
    let info;
    try {
      info = JSON.parse(await run(path.join(HOME, '.venv', 'bin', 'python'), ['-I', ...args]));
    } catch (e) {
      if (/No module named/.test(e.message)) throw new Error(`thiếu thư viện ảnh: ${HOME}/.venv/bin/pip install numpy pillow`);
      throw e;
    }
    const cfg = `const HAND_CFG = { src: '../assets/hand.png', width: ${info.width}, height: ${info.height}, tip: [${info.tip.join(', ')}], armSide: '${info.armSide}', rotate: ${Number(flags.rotate ?? 0)} }; // reelmaker hand`;
    const code = fs.readFileSync(js, 'utf8');
    if (!/const HAND_CFG = .*\/\/ reelmaker hand/.test(code)) throw new Error(`${js} không có dòng HAND_CFG`);
    fs.writeFileSync(js, code.replace(/const HAND_CFG = .*\/\/ reelmaker hand/, cfg));
    console.log(`✓ bàn tay mới: ${png}\n  ${info.width}×${info.height}, đầu ngòi (${info.tip.join(', ')}), cánh tay đi ra mép ${info.armSide}`);
    console.log(`  xem trước (vòng đỏ = đầu ngòi): ${preview}`);
    console.log('  ngòi lệch: chạy lại với --tip x,y; còn vết lạ trên phông: --erase "x1,y1,x2,y2"');
    if (!flags.project) console.log('  áp dụng cho video bảng trắng tạo mới; project đã có: thêm --project <thư mục>');
  },

  // Ảnh → tranh nét để bàn tay vẽ lại (kiểu bảng trắng): ghi ra scenes/<cảnh>.html, có thể hiện ảnh màu gốc ở cuối.
  async lineart([dir, image], flags) {
    if (!dir || !image || !flags.scene) {
      throw new Error('dùng: reelmaker lineart <thư mục> <ảnh> --scene <id> [--draw 0.3-4.5] [--color 4.7|auto|none] [--mode auto|lines|sketch] [--detail 1] [--box x,y,w,h] [--force]');
    }
    const project = loadProject(dir);
    const src = path.resolve(image.replace(/^~(?=\/)/, os.homedir()));
    if (!fs.existsSync(src)) throw new Error(`không thấy ${src}`);
    const sceneFile = path.join(project.root, 'scenes', `${flags.scene}.html`);
    if (fs.existsSync(sceneFile) && !flags.force) throw new Error(`${sceneFile} đã có: thêm --force để ghi đè`);
    if (!fs.existsSync(path.join(project.root, 'whiteboard.js'))) throw new Error('project không phải kiểu bảng trắng (reelmaker new … --style whiteboard)');

    const tmp = path.join(project.build, 'lineart', flags.scene);
    const args = ['-I', path.join(HOME, 'tools', 'lineart.py'), src, tmp];
    for (const k of ['mode', 'detail']) if (flags[k]) args.push(`--${k}`, flags[k]);
    const art = JSON.parse(await run(path.join(HOME, '.venv', 'bin', 'python'), args));

    // thời gian: theo giọng đọc của cảnh nếu đã có (reelmaker voice), không thì mặc định
    const scene = project.cfg.scenes.find((s) => s.id === flags.scene);
    let duration = scene?.duration ?? 5;
    if (scene?.narration) {
      const v = await voiceScene(project, scene, { log: () => {} });
      duration = (v.audio ? scene.lead : 0) + v.duration + scene.tail;
    }
    const [from, to] = (flags.draw ?? `0.3-${Math.max(1.5, duration - 1.6).toFixed(2)}`).split('-').map(Number);
    const colorAt = flags.color === 'none' ? null : flags.color && flags.color !== 'auto' ? Number(flags.color) : to + 0.1;

    // đặt tranh vừa khung, chừa dải phụ đề phía dưới
    const [bx, by, bw, bh] = (flags.box ?? '140,60,1640,800').split(',').map(Number);
    const s = Math.min(bw / art.width, bh / art.height);
    const w = art.width * s;
    const h = art.height * s;
    const ox = bx + (bw - w) / 2;
    const oy = by + (bh - h) / 2;
    const ext = path.extname(src).toLowerCase() || '.png';
    const asset = path.join('assets', 'lineart', `${flags.scene}${ext}`);
    fs.mkdirSync(path.join(project.root, 'assets', 'lineart'), { recursive: true });
    fs.copyFileSync(src, path.join(project.root, asset));

    const id = flags.scene.replace(/[^\w-]/g, '');
    const color = colorAt === null ? '' : `    <!-- màu: ảnh gốc hiện dần dưới nét vẽ, mép mờ vào nền giấy -->
    <defs>
      <radialGradient id="soft-${id}" cx=".5" cy=".5" r=".62"><stop offset=".66" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
      <mask id="softmask-${id}" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#soft-${id})"/></mask>
    </defs>
    <g data-fill="${colorAt.toFixed(2)}-0.9"><image href="../${asset}" x="${ox.toFixed(1)}" y="${oy.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="none" mask="url(#softmask-${id})"/></g>\n`;
    fs.writeFileSync(sceneFile, `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>${flags.scene}</title>
<link rel="stylesheet" href="../shared.css">
</head>
<body>
  <svg class="wb" viewBox="0 0 1920 1080">
${color}    <!-- tranh nét từ ${path.basename(src)} (${art.mode}, ${art.paths.length} đường): bàn tay vẽ từ ${from}s đến ${to}s -->
    <g data-draw="${from}-${to}" data-reveal transform="translate(${ox.toFixed(1)} ${oy.toFixed(1)}) scale(${s.toFixed(5)})">
      <g transform="${art.transform}">
${art.paths.map((d) => `        <path d="${d}"/>`).join('\n')}
      </g>
    </g>
    <!-- thêm chữ / nét tay khác ở đây: <g data-draw="…"><text …>…</text></g> -->
  </svg>
  <script src="../whiteboard.js"></script>
</body>
</html>
`);
    console.log(`✓ ${path.relative(project.root, sceneFile)}: ${art.paths.length} đường (${art.mode}), vẽ ${from}–${to}s${colorAt === null ? '' : `, màu hiện ở ${colorAt.toFixed(1)}s`}`);
    if (!scene) console.log(`  chưa có cảnh "${flags.scene}" trong video.json: thêm { "id": "${flags.scene}", "html": "scenes/${flags.scene}.html", "narration": "…" }`);
    console.log(`  xem: reelmaker still ${dir} ${flags.scene} 1,${((from + to) / 2).toFixed(1)},end`);
  },

  async studio([dir], flags) {
    const project = loadProject(dir);
    if (!fs.existsSync(path.resolve(project.root, project.cfg.output))) throw new Error('chưa có video: reelmaker render ' + dir);
    const { url } = await startStudio(project, { port: Number(flags.port ?? 4173) });
    if (!flags['no-open']) await run('open', [url]).catch(() => {});
    await new Promise(() => {}); // chạy tới khi Ctrl+C
  },

  // Góp ý từ studio: in danh sách; --done <id> [--reply "…"] / --answer / --dismiss để đánh dấu.
  async comments([dir], flags) {
    const project = loadProject(dir);
    for (const [flag, status] of [['done', 'applied'], ['answer', 'answered'], ['dismiss', 'dismissed'], ['reopen', 'open']]) {
      if (flags[flag]) {
        for (const id of String(flags[flag]).split(',')) {
          const c = updateComment(project, id, { status, ...(flags.reply ? { reply: flags.reply } : {}) });
          console.log(`✓ #${c.n} → ${status}`);
        }
        return;
      }
    }
    const list = readComments(project).filter((c) => flags.all || c.status === 'open');
    if (flags.json) return console.log(JSON.stringify(list, null, 2));
    if (!list.length) return console.log('  không có góp ý chưa xử lý');
    for (const c of list.sort((a, b) => a.t - b.t)) {
      console.log(`#${c.n} [${c.id}] ${c.status}  ${c.t.toFixed(2)}s · cảnh ${c.scene} @${c.sceneT}s · vị trí ${Math.round(c.x * 100)}% ngang, ${Math.round(c.y * 100)}% dọc`);
      console.log(`   "${c.text}"`);
      if (c.image) console.log(`   ảnh: ${path.join(project.root, c.image)}`);
    }
  },

  // Bản đồ lộ trình: tìm toạ độ, đường đi, ghép nền OpenStreetMap, ghi scenes/<cảnh>.html (map.js vẽ chuyển động)
  async map([dir], flags) {
    if (flags.transit) return commands.transit([dir], flags);
    // không có --scene: tạo mọi cảnh có "map": { "stops": "A; B", "mode", "chip", "vehicle" } trong video.json
    if (dir && !flags.scene) {
      const project = loadProject(dir);
      const todo = project.cfg.scenes.filter((s) => s.map?.stops);
      if (!todo.length) throw new Error('video.json chưa có cảnh nào ghi "map": { "stops": "Hà Nội; Huế" }');
      for (const s of todo) {
        await commands.map([dir], { ...flags, scene: s.id, stops: s.map.stops, mode: s.map.mode ?? flags.mode,
          chip: s.map.chip ?? flags.chip, vehicle: s.map.vehicle ?? flags.vehicle, tiles: s.map.tiles ?? flags.tiles, force: true });
      }
      return;
    }
    if (!dir || !flags.scene || !flags.stops) {
      throw new Error('dùng: reelmaker map <thư mục> --scene <id> --stops "Hà Nội; Ninh Bình; Sầm Sơn, Thanh Hoá" [--mode drive|flight|line] [--vehicle car|plane|none] [--draw 0.6-5] [--chip "…"] [--tiles hot|osmfr] [--force]');
    }
    const project = loadProject(dir);
    const sceneFile = path.join(project.root, 'scenes', `${flags.scene}.html`);
    if (fs.existsSync(sceneFile) && !flags.force) throw new Error(`${sceneFile} đã có: thêm --force để ghi đè`);
    for (const f of ['map.js', 'map.css']) {
      const dest = path.join(project.root, f);
      if (!fs.existsSync(dest)) fs.copyFileSync(path.join(HOME, 'template-map', f), dest);
    }
    const mode = flags.mode ?? 'drive';
    const stops = flags.stops.split(';').map((s) => s.trim()).filter(Boolean);
    const dirOut = path.join(project.root, 'assets', 'map');
    fs.mkdirSync(dirOut, { recursive: true });
    const specFile = path.join(dirOut, `${flags.scene}.spec.json`);
    fs.writeFileSync(specFile, JSON.stringify({ stops, mode, width: project.cfg.width, height: project.cfg.height, tiles: flags.tiles ?? 'hot' }));
    const png = path.join(dirOut, `${flags.scene}.png`);
    const dataFile = path.join(dirOut, `${flags.scene}.json`);
    console.log(`  … tìm ${stops.length} địa điểm, đường đi và tải bản đồ (lần đầu ~20–40 giây)`);
    await run(path.join(HOME, '.venv', 'bin', 'python'), ['-I', path.join(HOME, 'tools', 'maptool.py'), specFile, png, dataFile]);
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

    // thời gian theo giọng đọc của cảnh (nếu đã có)
    const scene = project.cfg.scenes.find((s) => s.id === flags.scene);
    let duration = scene?.duration ?? 6;
    if (scene?.narration) {
      const v = await voiceScene(project, scene, { log: () => {} });
      duration = (v.audio ? scene.lead : 0) + v.duration + scene.tail;
    }
    const [from, to] = (flags.draw ?? `0.6-${Math.max(1.8, duration - 1.7).toFixed(2)}`).split('-').map(Number);
    const vehicle = flags.vehicle ?? { drive: 'car', flight: 'plane', line: 'none' }[mode];
    const names = data.stops.map((s) => s.name);
    const m = data.minutes ? Math.round(data.minutes / 10) * 10 : 0;
    const hours = m ? ` · ~${m >= 60 ? `${Math.floor(m / 60)} giờ${m % 60 ? ` ${m % 60} phút` : ''}` : `${m} phút`}` : '';
    // "–" chứ không "→": font Be Vietnam Pro không có mũi tên
    const chip = flags.chip ?? `${names[0]} – ${names.at(-1)} · ${data.km.toLocaleString('vi-VN')} km${mode === 'drive' ? hours : ''}`;
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    fs.writeFileSync(sceneFile, `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>${flags.scene}</title>
<link rel="stylesheet" href="../shared.css">
<link rel="stylesheet" href="../map.css">
</head>
<body>
  <!-- bản đồ: ${esc(names.join(' → '))} (${mode}, ${data.km} km), đường vẽ từ ${from}s đến ${to}s -->
  <div class="map-attrib">${esc(data.attribution)}</div>
  <script src="../map.js"></script>
  <script>
    const MAP = ${JSON.stringify(data)};
    ReelMap.create({ data: MAP, img: '../assets/map/${flags.scene}.png', from: ${from}, to: ${to},
                     vehicle: '${vehicle}', follow: 2.0, chip: ${JSON.stringify(chip)} });
  </script>
</body>
</html>
`);
    console.log(`✓ scenes/${flags.scene}.html: ${names.join(' – ')} · ${data.km} km (${mode}), đường vẽ ${from}–${to}s`);
    if (!scene) console.log(`  chưa có cảnh "${flags.scene}" trong video.json: thêm { "id": "${flags.scene}", "html": "scenes/${flags.scene}.html", "narration": "…" }`);
  },

  // Phong cách riêng: reelmaker style save <thư mục> --name <tên> [--description "…"] | reelmaker styles [--remove <tên>]
  async style([action, dir], flags) {
    if (action !== 'save' || !dir || !flags.name) throw new Error('dùng: reelmaker style save <thư mục> --name <tên> [--description "…"] [--force]');
    const project = loadProject(dir);
    const { dest, kept, skipped } = saveStyle(project, flags.name, { description: flags.description, force: flags.force });
    console.log(`✓ mẫu "${flags.name}": ${dest}`);
    console.log(`  giữ ${kept.length} file${skipped.length ? `; bỏ ${skipped.length} ảnh/video của chủ đề cũ (${skipped.map((f) => path.basename(f)).join(', ')})` : ''}`);
    console.log(`  quy tắc kênh: ${path.join(dest, 'STYLE.md')}`);
    console.log(`  dùng: reelmaker new <tên-video> --style ${flags.name}`);
  },

  async styles(_, flags) {
    if (flags.remove) {
      const d = styleDir(flags.remove);
      if (!d) throw new Error(`không có mẫu "${flags.remove}"`);
      fs.rmSync(d, { recursive: true, force: true });
      return console.log(`✓ đã xoá mẫu "${flags.remove}"`);
    }
    console.log('Kiểu có sẵn: default, whiteboard, news, meme, map, metro, engraving, vox, math, listening');
    const own = listStyles();
    console.log(own.length ? '\nMẫu riêng:' : '\nChưa có mẫu riêng (reelmaker style save <thư mục> --name <tên>)');
    for (const s of own) console.log(`  ${s.name.padEnd(22)} ${s.base.padEnd(10)} ${s.size.padEnd(10)} ${s.voice ?? ''}\n      ${s.description}`);
  },

  async publish([dir], flags) {
    const project = loadProject(dir);
    const platforms = flags.platforms ? flags.platforms.split(',').map((x) => x.trim()) : undefined;
    const { outDir, files, notes, description } = await publish(project, { platforms, maxMb: flags['max-mb'] ? Number(flags['max-mb']) : undefined });
    console.log(`✓ bộ để đăng: ${outDir}`);
    for (const f of files) console.log(`  ${f.platform.padEnd(26)} ${path.basename(f.file).padEnd(22)} ${String(f.mb).padStart(6)} MB${f.reframed ? '  (đổi khung, nền mờ)' : ''}`);
    for (const n of notes) console.log(`  ⚠ ${n}`);
    console.log(`\n--- mo-ta.txt ---\n${description}`);
  },

  async srt([dir]) {
    const project = loadProject(dir);
    const { file, count } = await writeSrt(project);
    console.log(`✓ ${file} (${count} dòng phụ đề)`);
  },

  async thumbnail([dir], flags) {
    const project = loadProject(dir);
    const title = flags.title ?? project.cfg.title;
    if (!title) throw new Error('thiếu tiêu đề: --title "Toà thành *600 năm* tuổi" (từ giữa dấu * tô vàng)');
    const { files, size } = await makeThumbnails(project, { title, kicker: flags.kicker, scene: flags.scene, count: Number(flags.count ?? 3) });
    console.log(`✓ ${files.length} phương án ảnh bìa ${size}:`);
    for (const [i, f] of files.entries()) console.log(`  ${i + 1}. ${f.file}  (nền cảnh ${f.scene}, điểm ${f.score})`);
    console.log(`  mặc định: ${path.join(path.dirname(files[0].file), 'thumbnail.jpg')} (= phương án 1)`);
  },

  async transitions(_, flags) {
    console.log(`ffmpeg xfade (${XFADE.length}):\n  ${XFADE.join(' ')}`);
    console.log(`\nGL Transitions (${glLibrary().length}, viết "gl:<tên>"):\n  ${glLibrary().map((t) => t.name).join(' ')}`);
    if (!flags.sheet) {
      console.log('\nxem trước bằng ảnh: reelmaker transitions --sheet');
      return;
    }
    const browser = await launchBrowser();
    try {
      const { sheets, counts } = await previewSheets(browser, path.join(os.homedir(), '.reelmaker', 'transitions'));
      console.log(`\nbảng xem trước (khung ở giữa hiệu ứng, A xanh → B cam):\n  xfade (${counts.xfade}): ${sheets.xfade}\n  gl    (${counts.gl}): ${sheets.gl}`);
    } finally {
      await browser.close();
    }
  },

  async check([dir], flags) {
    const project = loadProject(dir);
    const only = flags.scene ? new Set(flags.scene.split(',')) : null;
    const log = flags.json ? () => {} : console.log;
    const result = await check(project, { only, video: !flags['no-video'], log });
    console.log(flags.json ? JSON.stringify(result, null, 2) : printReport(project, result));
    if (result.findings.some((f) => f.level === 'error')) process.exitCode = 1;
  },

  async render([dir], flags) {
    const project = loadProject(dir);
    const only = flags.scene ? new Set(flags.scene.split(',')) : null;
    const browser = await launchBrowser();
    const started = Date.now();
    try {
      // giọng đọc trước, tuần tự (edge-tts không thích bị gọi dồn)
      for (const scene of project.cfg.scenes) await voiceScene(project, scene);
      const beats = await beatPlan(project);
      if (beats) console.log(`  🥁 nhạc ${beats.tempo} BPM: ${beats.onBeat}/${beats.cuts} lần chuyển cảnh rơi đúng nhịp`);
      const files = await pool(project.cfg.scenes, Number(flags.jobs ?? 2), (scene) =>
        renderScene(browser, project, scene, { force: flags.force && (!only || only.has(scene.id)) }),
      );
      const out = await assemble(project, files, { browser });
      // phụ đề SRT kèm theo (YouTube), bỏ qua nếu video không có lời
      if (project.cfg.scenes.some((sc) => sc.narration)) await writeSrt(project).catch((e) => console.warn(`  ⚠ SRT: ${e.message}`));
      console.log(`\n✓ ${out} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
    } finally {
      await browser.close();
    }
  },
};

const { args, flags } = parse(process.argv.slice(2));
const cmd = commands[args[0]];
if (!cmd) {
  console.log(HELP);
  process.exit(args[0] ? 1 : 0);
}
cmd(args.slice(1), flags).catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
