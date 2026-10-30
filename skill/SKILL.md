---
name: reelmaker
description: Make a narrated explainer video (MP4) from a topic, article or notes, with Vietnamese or English voice-over, animated HTML scenes and burned-in captions. Use when the user asks to make, edit or re-render a video ("làm video", "video giải thích", "video về…"), or mentions reelmaker.
---

# reelmaker

A video is a folder: `video.json` (settings + one entry per scene, each with its narration) and one HTML page per
scene. The `reelmaker` CLI voices each scene with edge-tts, sets the scene's length to its voice-over, plays the
page frame by frame in headless Chrome and joins everything into an MP4.

CLI: `reelmaker` (if not on PATH: `node ~/dev/reelmaker/bin/reelmaker.js`).

## Workflow: step by step, the user approves each step

Go through the steps in order. At the end of steps 1–4, show the result, **stop and wait** for the user's
approval or changes (AskUserQuestion when the choice is a short list, otherwise a plain question). Never run
ahead to the next step on your own; if the user says "làm luôn" / "auto", do the remaining steps without stopping
(then pick the recommended script direction yourself and say which one you picked).
Talk to the user in their language (Vietnamese by default). Start each step with its header, e.g. `**Bước 2/5 — Kịch bản**`.

1. **Bước 1/5 — Yêu cầu.** Run `reelmaker config` and `reelmaker styles` first (offer the user's own styles too). If `"saved": false`, the machine was never set up: do
   **Thiết lập** (below) before anything else. Then ask in one AskUserQuestion: topic (if not given), length
   (30 s / 60 s / 90 s), style (see **Styles**; skip if the request already implies one), and one question "Dùng thiết lập mặc định?" whose first option states the saved defaults
   (e.g. "HoaiMy, ngang 16:9, nền tối (Recommended)") and whose other options change format, voice or theme for
   this video only. Skip what the user already answered. Then `reelmaker new <slug>` (it lands in `videosDir` with
   the saved format, voice, rate and theme); edit `video.json` / the `:root` colours in `shared.css` only for a
   choice that differs from the defaults.
2. **Bước 2/5 — Kịch bản**, in two stops:
   - **2a. Chọn hướng kịch bản.** Propose **3 different directions** for the same topic, each genuinely different
     in angle or structure, not three wordings of one script — e.g. *câu hỏi → giải đáp* (start from a puzzle the
     viewer has), *kể chuyện* (follow one character or one object through it), *liệt kê / so sánh* (numbered steps,
     myth vs fact, before/after), *thí nghiệm / ví dụ đời thường*, *góc nhìn bất ngờ* (a surprising fact first).
     For each give: a name, one-line idea, the opening line (the hook, word for word, see **Hook** below) with its
     on-screen title, the scene outline in one line (e.g. "Hook → Trứng → Sâu → Nhộng → Bướm → Kết"), and the
     estimated length. Ask with one AskUserQuestion (one option per direction, the one you recommend first with
     "(Recommended)" and a one-line reason; put the hook and title in `preview`). The user may also pick "Other"
     to mix directions ("hook của 2, cấu trúc của 1").
   - **2a+. Chọn câu hook.** Once a direction is picked, write **3 hooks for it, each from a different formula**
     (below), each with spoken line + on-screen title, and ask with one AskUserQuestion (recommended first). Skip
     only if the user already wrote the hook or said "làm luôn".
   - **2b. Kịch bản chi tiết.** Write the chosen direction as a table in chat: scene id, narration, what is shown on
     screen. One idea per scene, 1–3 sentences (≈ 5–12 s). Write for the ear: short sentences, no markdown. Write
     numbers, money, dates, units and names the way they should **appear** ("70.000đ/kg", "28/10", "15%",
     "TP.HCM", "iPhone 17"): for Vietnamese voices reelmaker turns them into speech itself (see **Phát âm**) and
     captions show them as written. Wait for approval; apply edits until approved. If the user wants a
     different direction now, go back to 2a. Then write it into `video.json` (replace the sample scenes), run
     `reelmaker say --check <folder>` and handle what it lists (below), then `reelmaker voice <folder>` (it prints
     "đọc là: …" for each changed scene: read it for mistakes).
   Keep the other directions in `script-options.md` in the project folder (name, idea, hook, outline), so the user
   can ask later for "phiên bản 2" of the same video from another direction.
3. **Bước 3/5 — Nghe thử giọng.** Report each scene's length and the total, give the audio files
   (`build/audio/<id>.mp3`, `open` them to listen). Offer: keep, change voice, speed (`rate`, e.g. `+10%`), or
   rewrite a scene, or try a VieNeu voice (offer 2–3 that fit the topic). Re-run `reelmaker voice` after changes.
   **Music in the same step:** `video.json` has `musicMood` from the user's setup (search words, or `none` = no
   music: skip unless the user asks). Run `reelmaker music <folder> "<musicMood, or words that fit the topic>"`
   (English: "calm piano", "upbeat ukulele", "acoustic guitar", "epic cinematic", "corporate", or
   "Kevin MacLeod <mood>"), pick 2–3 that fit by title/length, give the user the `nghe-thu.mp3` path with the
   "nghe ở m:ss" times (`open` it), and set their choice with `reelmaker music <folder> --use <id>`
   (`--start 12` to skip a slow intro). You cannot hear: never call a track good, let the user pick.
4. **Bước 4/5 — Dựng cảnh.** Build one HTML file per scene (rules below), keep `shared.css` and adapt its palette.
   Check each with `reelmaker still <folder> <scene-id> 0.5,3,end` and **look at the PNGs** (Read). Then run
   `reelmaker check <folder> --no-video` and fix every ✗ (look at the `ảnh:` PNG it names); fix a ⚠ unless it is
   intended (say which ones you kept and why). Repeat until no ✗. Then show the user one still per scene (the
   mid-scene PNG paths; `open` them) and wait for approval or changes.
5. **Bước 5/5 — Render.** `reelmaker render <folder>`, then `reelmaker check <folder>` (scenes + the final MP4:
   black frames, frozen picture, long silences, loudness, clipping). Fix ✗ and render again (at most two rounds).
   Give the path of `out/video.mp4`, its length and the check summary (errors / warnings left), `open` it, and ask
   what to change. Changes: edit the narration or HTML and render again; only changed scenes re-render.
   **Subtitles (SRT):** render also writes `out/video.srt` (YouTube CC: viewers can turn it on/off, auto-translate,
   search). It shows the narration as written (digits stay digits); older projects whose narration spells
   numbers out can add `"srtReplace"` (`{"một nghìn chín trăm năm mươi sáu": "1956"}`). Run
   `reelmaker srt <folder>` (no re-render) and Read the file. Tell the user to upload it with the video on YouTube
   (Phụ đề → Tải tệp lên); TikTok/Reels don't need it (captions are burned in).
   **Thumbnail in the same step:** propose a short title (≤ 6 words, the hook, one keyword in `*…*` turns yellow,
   e.g. `"5 sự thật *gây sốc* về AI"`) and a kicker (`"Bạn có biết?"`, `"Du lịch"`), run `reelmaker thumbnail
   <folder> --title "…" --kicker "…"` (3 options from the 3 best-looking scenes, text and captions hidden;
   1280×720 for 16:9, 1080×1920 cover for 9:16), Read them, `open` the best one and give all 3 paths so the user
   can pick (`--scene <id>` to force a background). `out/thumbnail.jpg` is option 1.

## Hook (câu mở đầu)

The first 2–3 seconds decide whether a viewer scrolls past, above all on TikTok / Reels / Shorts. The hook is
what is **said** and **written** — effects only push it. Formulas (example: Indian buffalo meat at 70.000đ/kg):
- **Con số gây sốc:** "Chỉ 70.000 đồng một ký, rẻ hơn thịt bò gần một nửa." — title "Thịt trâu *70.000đ/kg*"
- **Đảo ngược điều ai cũng tin:** "Thứ bạn ăn mỗi tuần có thể không phải thịt bò." — "Bạn đang ăn *thịt gì?*"
- **Câu hỏi đúng chỗ đau:** "Vì sao thịt trâu nhập lại rẻ hơn cả thịt lợn?" — "Rẻ hơn *thịt lợn?*"
- **Cảnh báo / điều nên biết:** "Trước khi mua thịt bò ở chợ, xem cái này." — "*Xem trước* khi mua"
- **Bỏ lửng:** "Người chăn nuôi Việt đang gặp một đối thủ không ai ngờ…" — "Đối thủ *không ngờ*"
Rules:
- Spoken hook: one sentence, ≤ 12 words, read in ≤ 3 s (`reelmaker check` warns above that); the first word
  already carries meaning — no "Xin chào", "Hôm nay", "Các bạn có biết", channel intros.
- It holds a number, a contrast or a sharp word (rẻ, đắt, sai, cấm, sốc, bí mật, không ai ngờ) **and is true**:
  the rest of the video must deliver what it promises. Never invent a number or exaggerate a source's claim; a
  bỏ lửng hook gets its answer before the end.
- On-screen title: ≤ 6 words, says the same idea differently (not a transcript), one keyword in `*…*` / yellow;
  visible from the first frame (big, ≥ 64 px at 1080×1920; check warns if no big title at 0.5 s). Scene 1 is
  also the thumbnail people see in the feed.
- Delivery: for a feed video give the hook scene a punchier read: `"rate": "+22%", "pitch": "+22Hz"` on scene 1
  and `"pitch": "+6Hz"` for the rest (edge-tts voices only; VieNeu ignores pitch). `reelmaker say "<hook>" --rate
  +22% --pitch +22Hz` to try levels.
- Scene 2 pays off fast (the number explained, the answer started) so the hook does not feel like bait.
- For 16:9 YouTube explainers the same rules apply, a little looser (≤ 4 s is fine; say so if you keep it).

## Giọng nhân bản (`reelmaker voice-clone`)

The user can have videos read in their own voice: `reelmaker voice-clone <recording> --name "<Tên>" --consent`
(3–15 s of clear speech, any format: m4a from a phone, mp3, wav, even a video; quiet room, natural pace, 6–10 s is
best). It runs offline with VieNeu (first time downloads the speaker encoder + denoiser) and saves
`~/.reelmaker/voices/<Tên>/`; then `"voice": "clone:<Tên>"` (or `reelmaker setup --voice "<Tên>"`); it shows in
`reelmaker voices`. Captions are estimated then aligned by Whisper, like other VieNeu voices; `pitch` is ignored.
- **Consent first:** before passing `--consent`, ask the user whether the recording is their own voice or someone
  who agreed. Never clone a public figure or anyone who has not agreed, whatever the stated purpose; refuse and
  say why. Don't download voice recordings of other people from the web to clone.
- Several files at once are joined (`voice-clone a.m4a b.mp4 --name …`); up to 60 s is used (best 8 s window +
  averaged voice print). Songs or videos with background music: add `--separate` (Demucs splits the vocals off
  first; `.venv-demucs`); without it the music leaks into the voice (measured 0.74 → 0.79 similarity with it).
- Clean recordings are not denoised (the denoiser made voices less similar); speeding a clone above +10% also
  lowers similarity — shorten the narration instead. To match a person's delivery (poetry-like, phrase by phrase),
  set `"phrasing": true` (pause after every comma phrase) and tune `rate` until words/second match their recording.
- Try it: `reelmaker say "<a line>" --voice "clone:<Tên>"`; if it sounds off, record again (less noise, no music,
  one speaker) and re-run with the same name (scenes using it re-voice by themselves). `--list`, `--remove "<Tên>"`.

## Phát âm (từ điển, `reelmaker say`)

For Vietnamese voices (edge `vi-VN-*`, VieNeu) the narration is converted before it is voiced; captions, SRT and
`reel.lines` keep the words as written (`build/audio/<id>.json` holds the spoken form).
- Automatic: numbers ("70.000" → bảy mươi nghìn, "1,5" → một phẩy năm, "0912…" digit by digit), money and units
  (đ, VND, USD, $, %, km, kg, m², km/h, k, tr…), "/kg" → một ký, "đồng/tháng", dates ("28/10/2026", "ngày 28/10",
  "tháng 4" → tháng tư), times ("8h30"), ranges ("10-15" → mười đến mười lăm), "thứ 4" → thứ tư, "x2".
- Dictionary: `data/pronounce.vi.json` (built-in: TP.HCM, UBND, AI, iPhone, TikTok…) < `~/.reelmaker/pronounce.json`
  (the user's) < `"pronounce": {…}` in `video.json` (this video only; `null` turns a built-in entry off).
  Keys with capitals match case exactly. `"pronounce": false` turns the whole thing off.
- `reelmaker say --check <folder>` lists words likely misread (abbreviations, foreign words, mixed case) not in the
  dictionary. For each: if the reading is obvious, propose one ("Canva" → "can va") and add it — to `video.json`
  `pronounce` for names only in this video, `reelmaker say "<từ>" --as "<cách đọc>"` (user dictionary) for words
  that will come back; ask the user when unsure. Write readings as Vietnamese syllables the voice can read.
- `reelmaker say "<câu>"` voices a sentence with the saved voice and prints "đọc là: …" + the mp3 path (plays by
  itself only in the user's terminal). `--list` shows the user's entries, `--remove "<từ>"` drops one.
- When the user says a word is read wrong ("đọc sai chữ X"), fix it with `say --as`, then `reelmaker voice` again.

## What `reelmaker check` finds

✗ errors (fix): text off-screen, text over text, captions covering text, text in the 9:16 app zones (top 150 px,
bottom 480 px, left 60, right 140 at 1080×1920), letters drawn from a fallback font (missing Vietnamese marks), a
blank frame at 0.3 s, JS errors, black frames, audio peaks above -1 dBFS.
⚠ warnings (judge): text over lines/shapes, low contrast (< 3:1 large text, < 4.5:1 small), an animation ending
after the scene, captions over 2 lines, picture frozen ≥ 4 s, silence ≥ 2.5 s, loudness off -14 LUFS,
`hook` (scene 1: first sentence read in > 3 s, or no big title at 0.5 s — rewrite per **Hook**;
`"hookCheck": false` in `video.json` for videos that are not meant for a feed).
`--json` gives the same list with `scene`, `t` (seconds into the scene), `kind`, `message`, `still`.
`render` already normalises the final audio to -14 LUFS / -1.5 dBTP.

## Đăng video (`reelmaker publish`)

When the user is happy with the video (end of Bước 5), build the publishing kit: fill `video.json`
`"description"` (2–3 sentences for the post, the hook first), `"hashtags"` (4–8, no "#", Vietnamese without
diacritics joined like `TriTueNhanTao`), and `"chapter"` on the scenes where a YouTube chapter starts (first at
scene 1; each chapter must last ≥ 10 s, so group short scenes), then `reelmaker publish <folder>`
(`--platforms youtube,tiktok,shorts,reels,facebook,square`; default: 16:9 → youtube + tiktok, 9:16 → tiktok +
shorts + reels; `--max-mb 50` to fit a size limit). It writes `out/dang/`: one MP4 per platform (a different
aspect is letterboxed on a blurred copy — say that a native vertical render looks better and offer
`reelmaker new … --style news` for TikTok-first videos), `anh-bia.jpg`, `video.srt`, `mo-ta.txt` (title,
description, chapters, required credits for music/photos/maps, hashtags). Show `mo-ta.txt` and `open` the folder;
remind the user to paste the credits with the post and to upload the SRT on YouTube.

## Mẫu riêng (phong cách của kênh)

After a video the user liked, or when they say "lưu thành mẫu", "lần sau làm giống vậy", "phong cách kênh tôi":
1. Agree on a name (lowercase, dashes) and `reelmaker style save <folder> --name <name> --description "<one line:
   what videos, format, voice, music, look>"`. It keeps settings, `shared.css`, libraries, scene files, music and
   the assets the scenes use; drops topic photos.
2. Edit `~/.reelmaker/styles/<name>/STYLE.md` → "Quy tắc của kênh": the user's choices and feedback from this
   conversation and the studio comments, as rules ("mở đầu bằng một con số", "≤ 6 chữ mỗi tiêu đề", "chữ vàng cho
   từ khoá", "luôn có meme người que ở cảnh giữa", "kết bằng 'Theo dõi để biết thêm'"). Show them to the user.
3. Later "làm video … theo mẫu <name>": `reelmaker new <slug> --style <name>` (keeps its voice/music/format; the
   saved defaults are not applied), **read its STYLE.md and scene files first**, follow the rules, reuse the scene
   layouts with the new content, replace every photo. `reelmaker styles` lists them; `--remove <name>` deletes.

## Studio (xem video, ghim góp ý)

After a render (Bước 5) offer the studio: start it **in the background** (`reelmaker studio <folder>`, Bash with
run_in_background) — it opens http://127.0.0.1:4173 in the user's browser (local only). The user watches, clicks on
the frame to pin a comment at that moment and spot, then presses "Xong — gửi cho Claude" and tells you.
Then: `reelmaker comments <folder>` lists open comments (time, scene, seconds into the scene, % position, text,
and `ảnh:` a frame grab with a red ring on the spot — **Read each image**). Fix each one at its source (scene HTML,
narration, music, timing), render again (the studio reloads the video by itself), then mark them:
`reelmaker comments <folder> --done <id>[,<id>] --reply "đã làm chữ to hơn"`; a question → `--answer <id> --reply
"…"`; one you won't do → `--dismiss <id> --reply "lý do"`. Say in chat which ones you did and which not, and why.
The studio keeps running across renders; stop it when the user is done.

## Thiết lập (setup)

Run when `reelmaker config` shows `"saved": false`, or when the user asks to set up, check the machine, or change
their defaults ("thiết lập", "cài đặt", "đổi giọng mặc định", "kiểm tra máy").

1. `reelmaker doctor`: every line ✓ or ✗ with the fix command. Show the ✗ ones; run a fix only after the user agrees
   (`brew install …` changes their machine).
2. Ask in one AskUserQuestion (current values from `reelmaker config` as the first, Recommended option):
   voice (one list for both engines: HoaiMy nữ / NamMinh nam / VieNeu voices such as Ngọc Huyền, Quốc Tuấn;
   `reelmaker voices --sample` makes one mp3 with every voice for the user to listen to), speed (+0% / +5% / +10%),
   format (16:9 / 9:16 / 1:1), theme (dark / light); then a second AskUserQuestion: music (calm nhẹ nhàng /
   upbeat vui tươi / acoustic / epic hùng tráng / none không nhạc), music level (low / mid / high), sound effects
   (on / soft / off).
   Ask the folder for videos only if the user brings it up (default `~/Videos/reelmaker`).
3. Save: `reelmaker setup --voice <name or number from `reelmaker voices`, e.g. HoaiMy, "Quốc Tuấn"> --rate <+5%> --format <16:9> --theme <dark>
   --music <calm> --musicLevel <mid> --sfx <on> [--videosDir <dir>]`.
   Show the saved summary it prints. A person at a terminal can instead run `reelmaker setup` with no flags: it
   asks the same questions itself.

## video.json

```json
{
  "title": "…", "width": 1920, "height": 1080, "fps": 30,
  "voice": "vi-VN-HoaiMyNeural", "rate": "+5%",
  "captions": true, "music": "music.mp3", "musicVolume": 0.12,
  "scenes": [
    { "id": "01-hook", "html": "scenes/01-hook.html", "narration": "…" },
    { "id": "02-logo", "html": "scenes/02-logo.html", "duration": 3, "captions": false }
  ]
}
```

- Voices, two engines (`reelmaker voices` lists both):
  - edge-tts (online): `vi-VN-HoaiMyNeural` (female), `vi-VN-NamMinhNeural` (male); other languages via
    `reelmaker voices en-US`. Captions are timed word by word.
  - VieNeu-TTS (offline, Vietnamese only, 25 voices with North / Central / South accents and styles: tự nhiên,
    tin tức, kể chuyện, đọc truyện): `"voice": "vieneu:Ngọc Huyền"`. VieNeu gives no word timings: when Whisper is
    installed (`reelmaker doctor` shows it), `reelmaker voice` runs it on each VieNeu clip (`👂`) and replaces the
    estimated word times with the heard ones (`"aligned": "whisper-small"` in `build/audio/<id>.json`; ~5 s per
    scene, offline; `"align": false` turns it off, `"whisperModel": "medium"` is more accurate but slower). Without
    Whisper the captions are estimated and can drift a little; it reads faster than edge-tts, so re-time animations to the new lengths. Featured
    voices: Ngọc Huyền, Trúc Ly, Mai Anh (nữ Bắc), Hải Đăng, Thiện Minh (nam Bắc), Thùy Dung (nữ Nam), Quang Sơn,
    Ngọc Trân (Trung).
  `voice`/`rate` can also be set per scene.
- A scene without narration needs `duration` (seconds). `lead` (0.3) and `tail` (0.6) pad the voice-over per scene.
- `music` is optional, a file in the folder, that the user supplies; it is looped, ducked under the voice and faded out.

## Scene rules

Time is controlled by reelmaker, not by the browser clock. Every frame it pauses all animations and seeks them to
the frame's time, so:

- **Animate with CSS `@keyframes` + `animation-delay`**, all declared when the page loads (classes in `shared.css`:
  `.fade-up`, `.fade-in`, `.pop`, and `@keyframes draw` for SVG strokes with `stroke-dasharray`/`dashoffset`).
  Elements built by a script at load time are fine (set their `animation-delay` inline).
- **No** `setTimeout`, `setInterval`, `requestAnimationFrame` loops, CSS `transition`s or classes added later: they
  will not follow the timeline. For animation in JS use `reel.on(t => { … })` (called every frame with `t` in
  seconds; with GSAP: `const tl = gsap.timeline({paused:true}); reel.on(t => tl.seek(t))`).
- `reel.duration`, `reel.lines` (caption lines with `start`/`end`, in seconds) are available to time things to
  the words: e.g. highlight a term when it is said.
- Use `<link rel="stylesheet" href="../shared.css">`; images and fonts as relative files in the folder or from
  the web (the page waits for the network). Draw diagrams and abstract ideas with SVG/CSS.
- `<video src="../assets/x.mp4" muted playsinline>` plays in step with the timeline (`data-start="2"` starts
  2 s into the clip, `data-rate="0.5"` slows it, `loop` loops it). No autoplay or JS playback.

## Styles

`reelmaker new <slug> --style <style>`; when the user names no style, ask in Bước 1 (with the others):
- `default`: animated text + diagrams on a light/dark background (abstract explainers).
- `whiteboard`: a real hand draws line art (kids, lessons, processes, history) — section below.
- `news`: vertical 9:16 "tin nóng" short for TikTok / Reels / Shorts — section below.
- `meme`: square looping stick-figure meme (~8 s, no narration) — section below.
- `map`: travel route on a real map (road route, flights), camera follows — section below; also usable as single scenes in any style.
- `metro`: vertical 9:16 "căn hộ / địa điểm gần ga": 4 photo scenes, then a dark map where the metro line draws
  station by station, walking legs, and the total door-to-door time — section below.
- `engraving`: old engraving / sepia print, camera moves over one archival picture (history, "ngày xưa") — section below.
- `vox`: Vox-style explainer: paper board, archival photo cutouts, highlighter, red hand-drawn circles — section below.
- `math`: 3Blue1Brown-style maths: dark background, shapes drawn then filled, KaTeX formulas written — section below.
- `listening`: English listening lesson: dictation blanks, slow replay with word highlight, translation, vocab — section below.
These four (like news/meme) keep the template's frame, rate and transition whatever the user's setup says.

## Style: engraving (tranh khắc cổ)

For history, "ngày xưa", old cities, biographies, anything with archival engravings, maps, prints or old photos.
Cream paper, a double-ruled frame, the picture in sepia with film grain, flicker and the odd scratch; titles in
Playfair Display inside a "cartouche"; a red `.seal` stamp for a year. Sample: Kẻ Chợ (Thăng Long) in Samuel
Baron's 17th-century engraving. Building blocks (`shared.css` + `engraving.js`):
- `.frame > .plate[data-img][data-cam]`: the picture, camera keyframes `"giây:x,y,zoom; …"` (x,y = point in the
  picture to centre, 0..1; zoom 1 = fills the frame). Smooth moves, never shows the picture's edge. One good
  high-res picture can carry several scenes: wide shot → detail → another detail. Find the coordinates on a still.
- `.cartouche.tl|.tr` with `h1`/`h2`, `.rule` (ornament line), `p`, `q` (quote, adds its own quote marks);
  `data-ink="0.6"` or `"0.6-1.5"` reveals text left to right like ink.
- `.seal` red stamp (`animation-delay`), `.fade-in`.
Rules: pictures must be public domain or free licence (Wikimedia: "engraving", "gravure", "lithograph", city +
century; Commons categories like "Hanoi in the 1680s"); never invent what a picture shows — read its legend /
Commons description and only label what is there. Slow pace: `"rate": "-5%"`, 0.8 s tail, fade transitions.

## Style: vox (phóng sự kiểu Vox)

For "giải thích vì sao…", history of an object/idea, explainers built on documents, photos, quotes, numbers.
Grid paper board that pushes in slowly; photos as taped cutouts slapped onto the board; serif note cards; black
or red tags; highlighter sweeps; hand-drawn red circles and arrows (scribble sound). Sample: why keyboards are
QWERTY. Building blocks (`shared.css` + `vox.js`):
- `.board` (set `animation-duration` = scene length) wraps everything.
- `figure.cutout` (+ `.tape`, `.bw` black & white, `.torn` torn bottom edge), size/position/`--r` rotation inline,
  `animation-delay` for when it lands; `figcaption` for a source line.
- `.headline` big title; `mark` = highlighter sweep (set its `animation-delay` to when the words are said).
- `.note` card (`<small>` red kicker + serif text), `.tag` / `.tag.red` label, `.keys > .key(.lit)` key caps.
- `.ring` (`data-at`, left/top/width/height around the thing) and `.arrow` (`data-at`, `data-from="x,y"`,
  `data-to="x,y"`) draw in red at that time.
Rules: 2–4 elements per scene, each lands when the narration mentions it; circle the exact detail being talked
about (find it on a still); claims that are disputed are labelled ("Giả thuyết phổ biến"), every photo credited.

## Style: math (toán kiểu 3Blue1Brown)

For maths, physics, geometry, "chứng minh", formulas, graphs. Near-black background, bright strokes, translucent
fills, one colour per quantity kept for the whole video (`--blue` a, `--green` b, `--yellow` c, `--red`), KaTeX
for formulas (loaded from jsdelivr), Noto Serif for words. Sample: Pythagoras. Building blocks (`math.js`):
- `<svg class="scene" viewBox="0 0 1920 1080">` with `<g data-create="0.8-2.4">` → strokes draw in order, then
  fills fade in; shape classes `.blue .green .yellow .red` (stroke + translucent fill), `.thin`.
- `<div class="tex" data-tex="a^2+b^2=c^2" style="left:…; top:…">` (centred there; `.big`, `.small`,
  `.c-blue` …; colour terms with `{\color{#58c4dd}a^2}`), `data-write="3-4.2"` writes it left to right.
- `data-fade="t"` fade + rise, `data-indicate="t"` pulse with a yellow glow (point at the term being said).
- `.title`, `.note` (muted italic).
Rules: keep the same coordinates across scenes so the figure stays put between cuts (next scene starts with what
the last one ended on, then adds); one new idea per scene; show a numeric check (3² + 4² = 25 = 5²); time every
write/indicate to the word in `build/audio/<id>.json`.

## Style: listening (luyện nghe tiếng Anh)

For "luyện nghe", "học tiếng Anh", dictation, phrases for a situation. Each sentence gets two scenes: "Lượt 1 ·
Nghe và đoán" (normal speed, each word a blank that lights while spoken, answer revealed after it) and "Lượt 2 ·
Nghe chậm" (`"rate": "-30%"`, words highlight as spoken, Vietnamese translation, 2–3 vocab chips). An intro scene
in Vietnamese. Voices are set **per scene** (`"voice": "en-US-JennyNeural"` / `"vi-VN-HoaiMyNeural"`; also
AvaNeural, AndrewNeural, GuyNeural); `"captions": false` (the card is the caption); long `tail` (2–2.5 s) so the
viewer can repeat. Building blocks (`listening.js`): `<p class="en" data-mode="blank" data-reveal="end">` or
`data-mode="karaoke"` (the sentence must match the narration word for word), `.vi`, `.vocab > .chip` (`<b>` = the
English), `.wave` (bars move while speaking), `.topbar` with `.lesson` and `.step` / `.step.slow`, `.hero` intro.
Rules: natural everyday sentences, 6–14 words, A2–B1 unless the user says otherwise; translations natural, not word
for word; vocab chips for the 2–3 words a learner would miss.

## Style: metro (gần ga metro) and `reelmaker map --transit`

For real estate near a metro/train station, "đi làm bằng metro", commute times, station guides. Sample: an
(illustrative) flat near Văn Quán, metro 2A to Cát Linh, walk to Văn Miếu, ~30 minutes. Vertical 9:16, lime accent,
no narration by default (music + on-screen text, like the TikTok property videos it copies; add a voice if asked).
Scenes: 01–04 photos (`.ttl.low` two-line title, white + `<em>` lime; `.big` number; `.chips`; `.sub`; `.wm` small
disclaimer line), 05 walk to the first station, 06 the line station by station with a `.panel` (station name + "ga
i/n · km · ≈ phút" updated by `m.stationTime(i)`), 07 walk from the last station, 08 pull back + total.

Map data for ANY route, in any style: `reelmaker map <folder> --transit "Văn Quán; Phùng Khoang; …; Cát Linh"
--from "<address | name@lat,lon>" --to "<place>" [--city "Hà Nội"] [--name metro] [--min-per-km 1.77]
[--walk-kmh 5]`. It geocodes each station ("Ga <name>, <city>"), builds a zoom-16 OpenStreetMap base
(`assets/map/<name>.jpg`), writes `assets/map/<name>.js` (`window.TRANSIT[name]`: station px, km, minutes, walking
legs, totals), copies `lib/transit.js` + `lib/transit.css`, and prints every station's km/minutes. **Check the
station dots on a still**: a wrong one → `"Name@lat,lon"` in `--transit` and run again (e.g. "Vành Đai
3@20.9932,105.8008"). Times are estimates (train min/km, walking straight line × 1.25 at 5 km/h): say so on screen
("Ước tính …"). Numbers in text fill themselves: `<b data-transit="totalMin">`, `"walkMin.0"`, `"walkMin.1"`,
`"metroKm"`, `"metroMin"`, `"stations.length"`, `"toName"`.
In a scene (`<body class="map">`, `<link href="../lib/transit.css">`, data script, `lib/transit.js`):
`const m = Transit.create({ data: 'metro', walkFrom: [0.6, 2.8] | 'done', line: [0.5, 8.3] | 'done', walkTo: …,
cam: [[t, 'from' | 'to' | 'st<i>' | [x, y], zoom], …] | { follow: 0.95 }, labels: [{ at: secs | 'reach', xy, text,
sub, side: 'left' }] })`. Labels only show inside the safe area (`safe: { top: 360, bottom: 1150 }`, below the title,
above the panel and the app buttons). Keep "© OpenStreetMap" (`.m-attrib`) on every map scene. Never present an
illustrative flat as a real listing: keep the "video demo / minh hoạ" lines unless the user gives a real one.

## Style: map (bản đồ, lộ trình du lịch)

For trips, itineraries, "từ A tới B", logistics, history campaigns, flights, delivery routes, property location.
Map scenes work in **any** style (they bring their own `map.js` / `map.css`). In `video.json` give a scene
`"map": { "stops": "Hà Nội; Ninh Bình; Sầm Sơn, Thanh Hoá", "mode": "drive" | "flight" | "line",
"chip": "custom label", "vehicle": "car" | "plane" | "none" }`, run `reelmaker voice` first, then
`reelmaker map <folder>` (all map scenes) or `reelmaker map <folder> --scene <id> --stops "…" --mode …`.
It geocodes the stops (Photon / Nominatim), gets the real road route (OSRM, `drive`) or draws arcs (`flight`) /
straight lines (`line`), downloads the base map once (OpenStreetMap France tiles, cached in ~/.reelmaker/maps)
and writes the scene: the route draws in time with the narration, a car/plane rides along, the camera follows it,
each stop pops a pin + name as the route reaches it, then the camera pulls back to the whole route with a chip
("Hà Nội – Sầm Sơn · 193 km · ~2 giờ 40 phút"). The "© OpenStreetMap contributors" line stays on screen
(required). Rules:
- Name stops precisely ("Sầm Sơn, Thanh Hoá", "Thành phố Hồ Chí Minh"); a bare province name lands on its centre.
  Check the pins on a still; wrong place → more precise name.
- 2–5 stops per scene; one leg per sentence works best. Let the narration say the stops in route order.
- Don't use "→" in on-screen text (the font has no arrow): use "–".
- Needs network to openstreetmap.fr / photon.komoot.io / router.project-osrm.org on the first run of each map
  (openstreetmap.org itself is blocked on some networks).

## Style: meme (meme người que)

For "meme", "người que", funny relatable shorts, reactions ("khi …", "tôi lúc …"). 1080×1080, one scene of
6–10 s with `"duration"` (no narration, no captions), cut, pop/whoosh sounds; optional music. Read the sample
scene first. Building blocks:
- `stick.js`: `const a = Stick.create('#stage', { x, y, size })` (x, y = between the feet); `a.pose([[t, 'name',
  blendSeconds], …])` with poses `stand wave cheer shrug facepalm point think shock jump type run1 run2 sad dance1
  dance2` or a custom `{ armL:[shoulder, elbow], armR, legL:[hip, knee], legR, lean, head, y, crouch, look }`
  (degrees, 0 = straight down, + toward screen right); `a.face([[t, 'neutral|happy|shock|sad|smug|angry|sleepy']])`;
  `a.say('text', from, to, { side })` speech bubble (pop sound included); `a.move([[t, x, seconds]])` to walk.
  Two characters: create two and give them different `x`. Draw props (desk, phone, bed, door) as `<path class="prop">`.
- `.meme.top` / `.meme.bottom`: the caption (uppercase, white with black outline, `<b>` = yellow keyword).
  Top text sets up ("Khi …", "Tôi lúc 8h sáng"), bottom text is the punchline, appearing on the twist.
- `.fx` red "!" / "?" near a head; `.blink` with `style="--in:1.5s; --out:2.3s"` shows then hides an element.
Rules: **seamless loop** — the last pose, face, position and visible text equal the first frame (end with the
opening pose ~0.5 s before the end; hide punchline and bubbles before the end with `.blink`). One joke, setup →
twist → reaction; ≤ 8 words per caption; text within 30 px of the top/bottom edge, stage between y≈170 and 840.
Check the first vs last frame: `reelmaker still <folder> <scene> 0,end`.

## Style: news (tin nóng dọc TikTok)

For "video TikTok", "Reels", "Shorts", "tin nóng", "video dọc", quick facts, news, "3 điều về …".
The template is 1080×1920, `"captionStyle": "karaoke"` (big uppercase captions, 3 words at a time, the word being
spoken turns yellow), `"transition": "cut"` (fast cuts, whoosh on each), `"rate": "+10%"`, short lead/tail. These
stay fixed regardless of the user's saved format/rate/transition. Read the 3 sample scenes first.

Building blocks (`shared.css` + `news.js`): `.photo` full-screen photo with `.zoom-in` / `.zoom-out` / `.pan`
(set `animation-duration` ≈ scene length − 0.3 s) and `.shade` on top; `.top` text block inside the safe zone;
`.badge` red label with blinking dot ("Tin nóng", "Bạn có biết?", a place); `.headline` huge uppercase title,
`data-words="0.3"` makes its words pop one by one (`data-step`), `<b>` = keyword in yellow; `.stat` a giant number
slammed in the middle (`<small>` for its unit line); `.chip` small white pill (place, source, date).

Rules:
- **Hook in the first 2 seconds**: scene 1 is the most surprising fact as a question or number, never an intro.
- 3–6 scenes of 3–5 s, one fact per scene, 15–40 s in total; each scene has a real photo (`reelmaker images
  <folder> "<words>" --vertical`, or `--any` and let `.photo` crop) or a clip (`--video`).
- Narration for the ear and fast: short sentences; write numbers as digits ("70.000đ/kg"), they are read aloud correctly.
- Time the on-screen number/word to the moment it is said (read `build/audio/<id>.json`; words have times).
- Keep all text inside the safe zone: top 170 px, bottom 500 px, left 70 px, right 160 px (`.top` already does);
  `reelmaker check` flags anything under the app buttons (✗ — must fix).
- Music: upbeat (`reelmaker music <folder> "Kevin MacLeod upbeat"`), sound effects on.
- Facts must be right: for news, say where each fact comes from (a `.chip` with the source) and never invent one.

## Style: whiteboard (bảng trắng, bàn tay vẽ)

When the user wants a hand-drawn / whiteboard / "vẽ tay" / "bảng trắng" video, or a simple explainer for kids,
lessons, processes: `reelmaker new <slug> --style whiteboard`. Cream paper, black marker line art, a cartoon hand
that draws each stroke, writes text, then colours are filled in; a marker scribble sound plays while drawing.
Read the two sample scenes in the new project first (`scenes/01-sau-mua.html`, `scenes/02-giot-nuoc.html`).
The hand is a real photo (`assets/hand.png`, a hand holding a black marker, arm fading out to the right). To use
another hand: the user makes or takes a photo of a hand holding a marker on a plain green background (their own
photo, or one they generate themselves — never a stock image with its watermark removed), then
`reelmaker hand <photo> [--rotate 45]` keys out the background, finds the pen tip and sets it for new whiteboard projects (`--rotate` turns the hand around the pen tip, clockwise; 45 makes a horizontal arm go down-right)
(`--project <dir>` for an existing one). Look at the preview it prints (red ring = pen tip); fix with
`--tip x,y` or remove stray marks on the background with `--erase "x1,y1,x2,y2"`. Do not draw hands in SVG.

Each scene is one `<svg class="wb" viewBox="0 0 1920 1080">` plus `<script src="../whiteboard.js"></script>` at
the end of `<body>`:
- `<g data-draw="1.35-2.5">` … `</g>`: its `path`, `line`, `circle`, `ellipse`, `rect`, `polyline`, `polygon`
  and `text` are drawn in file order between 1.35 s and 2.5 s (time split by stroke length). `data-draw="4.1"`
  starts at 4.1 s at the default speed (`data-speed`, px/s). Default stroke: black, 6 px, round; classes `thin`
  (4 px), `bold` (9 px).
- `<g data-fill="2.55-0.6">`: colour layer (no outline) fading in from 2.55 s over 0.6 s; colours `var(--red)`,
  `--orange`, `--yellow`, `--green`, `--blue`, `--indigo`, `--violet`, `--sky`, `--grass`. Put fills slightly
  inside the outlines so the black line stays visible.
- `<text>` is written left to right in the handwriting font (Patrick Hand, has Vietnamese).

**Detailed pictures from an image (`reelmaker lineart`).** For anything SVG would make crude (a building, a
person, an animal, a machine, a landscape), turn an image into line art the hand redraws:
`reelmaker lineart <folder> <image> --scene <id>` (after `reelmaker voice`, so it times the drawing to that
scene: hand draws from 0.3 s to ~1.5 s before the end, then the original colour image fades in under the lines with
soft edges; `--color none` keeps it black and white, `--draw 0.3-4` / `--color 4.2` set the times, `--box x,y,w,h`
the area). Modes — pick by what the image *is*, not by guess:
- `lines`: black-and-white drawings, colouring pages, engravings, cartoons whose outlines are the only dark parts
  (cleanest result, e.g. a butterfly with black outlines).
- `sketch`: photos **and colour illustrations** (painted plates, colour cartoons with dark fills). `lines` on these
  turns every dark colour area into a solid black blob; `sketch` keeps only the edges, which looks hand-drawn.
- `auto` picks by brightness only; prefer choosing yourself.
Image sources: the user's own pictures, Wikimedia/Pixabay (`reelmaker images`, credits kept), or pictures the
user generates (e.g. Gemini: "tranh nét đen trắng kiểu tranh tô màu, nét dày, nền trắng" for line art, or "tranh
hoạt hình màu, viền đen rõ, nền trắng" for colour + outlines). On Wikimedia, illustrations are often portrait or
square: search with `--any`, English words ("caterpillar illustration", "<species> engraving"); public-domain
old-book plates on a white background work best (e.g. search "<species> Nemos" for Dr. F. Nemos' plates).
It writes the whole scene file; add your own `data-draw` text or arrows after the generated group. Check stills
**just before the colour appears** (the line art alone) and at the end: if it is a blob, switch mode; if too busy,
use a simpler image or `--detail 0.7` (sketch mode).

Whiteboard workflow additions:
- **Bước 2:** before writing the script, search the images for every scene that needs a detailed picture, and
  write scenes around the pictures you actually found (say which scenes are drawn by hand in SVG, which come from
  images). Don't promise a picture you don't have.
- **Bước 3:** the hand needs time: aim for ≥ 4.5 s per scene; with VieNeu voices (fast) use `"rate": "-10%"`.
- **Bước 4:** run `reelmaker lineart` with a `--box` that leaves room for a label (e.g. `--box 160,170,1600,690`
  keeps the top band for a title), then add labels/arrows **after** the drawing ends (`data-draw` starting at the
  drawing's end time): there is one hand, so two groups at the same time make it jump back and forth.

Rules: draw what the narration says *as it says it* (`reelmaker voice` first, then read the line times in
`build/audio/<id>.json` and set each group to the words); keep hand-drawn SVG simple and readable — clouds, sun,
drops, arrows, houses, trees, stick figures, charts, icons; 3–6 groups per scene; leave ~0.6 s at the end for the
hand to leave; write at most 3 short words of text; keep drawings clear of the caption strip. Use `"transition":
"fade"` or `"gl:Dreamy"`, music calm or acoustic. For anything detailed (faces, animals, buildings, machines) use
`reelmaker lineart` with an image instead of drawing it in SVG.

## Hoạt hình Lottie (`reelmaker lottie`)

Ready-made vector animations (characters, icons, loaders, weather, transport, reactions) from lottiefiles.com make
scenes far livelier than hand-written CSS. Works in every style. The user downloads a free animation from
LottieFiles ("Lottie JSON" or ".lottie", free ones are under the Lottie Simple License, no attribution needed) or
gives its https URL; then `reelmaker lottie <folder> <file|url> --as <name>` writes `assets/lottie/<name>.js`, copies
`lib/lottie.min.js` + `lib/reel-lottie.js` into the project, records it in credits.json and prints the snippet:
`<div data-lottie="<name>" data-start="0.5" style="position:absolute; left; top; width; height">` + the three
scripts before `</body>`. reelmaker seeks it frame by frame (no autoplay): `data-start` (s), `data-speed`, `data-loop`,
`data-from`/`data-to` (play one segment, in frames), `data-hide-before`. Time `data-start` to the word it illustrates.
Never use animations from paid packs or ones with a licence that forbids reuse; for other sources pass `--author`
and `--license` (then the credit goes into the post description).

## Offline fonts and CDN libraries

Fonts and scripts loaded from Google Fonts, jsdelivr, unpkg or cdnjs are cached in `~/.reelmaker/cache/web` the first
time a scene opens; later stills/renders/checks use the cache (no network needed, faster). Nothing to do by hand.

## Beat sync (cắt cảnh theo nhịp nhạc)

`"beatSync": true` in `video.json` (new projects get it from setup, default on) and a `"music"` file: at render,
reelmaker detects the music's beats (librosa, cached in `build/beats.json`) and stretches or trims each scene's
silent tail (≤ +0.6 s / −0.25 s, never into the words) so the next scene starts exactly on a beat. Render prints
`🥁 nhạc 80.7 BPM: 6/6 lần chuyển cảnh rơi đúng nhịp`. Nothing to do by hand; set it after choosing music (Bước 3).
In the page, `reel.beats` lists the beats inside the scene (seconds from the scene start): use it to land a big
moment on a beat — e.g. a `.stat` slam or `.pop` label: `el.style.animationDelay = reel.beats.find(b => b >= 2.4) + 's'`
in a script at load time (pick the first beat at/after the word it belongs to, never before the word is said).
Turn off per video with `"beatSync": false` (calm narration where pauses matter more than rhythm).

## Transitions

Every cut into a scene uses `"transition"` (default `"fade"`, 0.5 s; `"transitionDuration"`), set for the whole
video or per scene (the transition *into* that scene). Names: ffmpeg's 58 (`fade`, `fadeblack`, `slideleft`,
`circleopen`, `zoomin`, `dissolve`, `pixelize`…), 125 GL Transitions written `"gl:<name>"` (`gl:cube`,
`gl:crosswarp`, `gl:Dreamy`, `gl:ripple`, `gl:burn`, `gl:doorway`, `gl:Swirl`…), or `"cut"`.
`reelmaker transitions --sheet` makes two preview sheets (mid-transition frames): Read them to choose, and in
Bước 4 propose one transition style that fits the video (calm travel: `fade`, `gl:Dreamy`, `gl:crosswarp`; news:
`slideleft`, `wipeleft`; playful: `gl:cube`, `gl:doorway`, `gl:ripple`). One or two kinds per video, not a different
one every cut. The overlap eats the previous scene's silent tail, so no word is cut; the video gets shorter by
~0.5 s per transition. Changing transitions re-renders nothing but the final join.

## Sound effects

Added automatically at render, mixed under the voice: a **whoosh** on every cut to a new scene, a **pop** on
every element animated with `.pop`. Add more with `data-sfx` on an animated element (or its parent, e.g. a list):
`data-sfx="click"` (soft, for list items), `"tick"`, `"chime"` (a key fact), `"pop"`, `"whoosh"`; `data-sfx="none"`
silences one. `data-sfx-at="2.4"` (with `data-sfx`) plays at that second without an animation. Sounds closer than
0.18 s merge. Keep it sparse: one sound per real visual event, not on every fade. Whole video: `"sfx": false`,
`"sfxVolume": 0.6` (quieter). Music level: `"musicLevel": -30` LUFS (-26 louder, -34 quieter); `reelmaker music
<folder> --off` removes it.

## Real photos and stock clips (`reelmaker images`)

Use real pictures when the topic is something people want to *see*: places, food, people, events, history,
products, nature. Keep code-drawn visuals for abstract ideas (how something works, numbers, processes). The best
scenes often combine both: a photo as background with animated text or a diagram on top.

1. Search, in English or Vietnamese (English finds more on Wikimedia):
   `reelmaker images <folder> "hoan kiem lake"` (photos: Wikimedia Commons, plus Pixabay when its key is set),
   `reelmaker images <folder> "street food" --video` (short clips, Pixabay only). Add `--vertical` for 9:16
   (default follows the project's format), `--count 12` for more.
2. **Look at the contact sheet** it prints (Read the PNG): each picture has an id, source, size, licence. Pick
   by content and quality (sharp, well lit, subject clear, no watermark or text, room for your title).
3. In Bước 4, show the user the sheet path (`open` it) with your picks per scene and let them swap any.
4. `reelmaker images <folder> --use <id> --as <name>` copies it to `assets/<name>.jpg|png|mp4` and records
   author + licence in `credits.json`. No credits scene at the end by default (the user doesn't want one):
   credits go into the post description (`reelmaker publish` → `mo-ta.txt`); remind the user to paste them.
   `"credits": true` in video.json adds a 4 s "Nguồn ảnh và video" scene at the end if asked.
5. In the scene: `background: url(../assets/<name>.jpg) center / cover` with a slow Ken Burns move
   (`transform: scale(1.04) → scale(1.14)` over the scene length), and a gradient shade where text sits.
   `reelmaker check` flags text over a busy photo (⚠ "nằm đè lên hình"): that is expected when the text has a
   shade behind it; fix it only when the text is actually hard to read.

Pixabay needs a free key. If a search says it is missing, tell the user: create a free account at pixabay.com, copy
the key from https://pixabay.com/api/docs/, then run **in their own terminal** `reelmaker keys set pixabay` (typed
hidden). Never ask for the key in the chat. Wikimedia works without a key.
- Keep content clear of the caption area (bottom ~18 %), or set `"captions": false` for that scene. Restyle
  captions with a `#reel-caption { … }` rule.
- Big type (titles 80–130 px, body ≥ 40 px at 1080p), one idea per scene, ≤ 12 words on screen, high contrast.
- Start each scene with something visible within 0.3 s; finish the last animation before `reel.duration - 0.5`.

## Troubleshooting

- `No audio was received` from edge-tts: the tool retries; if it persists, check the network or simplify odd
  characters in the narration.
- A JS error in a scene is printed as `⚠ cảnh … có lỗi JS`; fix it, the frame may be wrong otherwise.
- Slow renders: heavy `box-shadow`/`filter: blur` cost per frame; `--jobs 3` renders more scenes at once.
