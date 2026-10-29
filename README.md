# reelmaker

Làm video giải thích (MP4) từ các cảnh HTML + giọng đọc edge-tts + phụ đề, để Claude Code tự viết kịch bản và dựng cảnh.

## Cài

```sh
git clone https://github.com/trinhlt-cmyk/reelmaker.git ~/dev/reelmaker
cd ~/dev/reelmaker
npm install
python3.11 -m venv .venv && .venv/bin/pip install edge-tts
npm link                                            # lệnh reelmaker
ln -s ~/dev/reelmaker/skill ~/.claude/skills/reelmaker   # skill cho Claude Code
```

Cần: Node ≥ 20, ffmpeg, Google Chrome.

Giọng VieNeu-TTS (offline, 25 giọng Bắc/Trung/Nam), tuỳ chọn:

```sh
uv venv -p python3.11 .venv-vieneu && VIRTUAL_ENV=.venv-vieneu uv pip install vieneu
```

Model (~vài trăm MB) tải về `~/.reelmaker/models/vieneu` ở lần đọc đầu. Dùng: `"voice": "vieneu:Ngọc Huyền"`.

Whisper (tuỳ chọn, căn thời gian từng chữ cho giọng VieNeu):

```sh
python3.11 -m venv .venv-whisper && .venv-whisper/bin/pip install faster-whisper
```

Tuỳ chọn khác: `brew install potrace` (`reelmaker lineart`). Nội dung của bên thứ ba và giấy phép: `THIRD_PARTY.md`.

Rồi chạy `reelmaker setup`: kiểm tra máy và hỏi giọng, tốc độ, khung hình, giao diện, thư mục lưu video mặc định
(lưu ở `~/.reelmaker/config.json`). `reelmaker doctor` chỉ kiểm tra máy.

## Dùng

Trong Claude Code: "làm video giải thích vì sao bầu trời màu xanh". Hoặc tự tay:

```sh
reelmaker new ~/Videos/reelmaker/bau-troi
reelmaker voice  ~/Videos/reelmaker/bau-troi            # độ dài từng cảnh
reelmaker still  ~/Videos/reelmaker/bau-troi 01-hook 0.5,end
reelmaker render ~/Videos/reelmaker/bau-troi            # → out/video.mp4
reelmaker check  ~/Videos/reelmaker/bau-troi            # tìm lỗi bố cục, font, hình, tiếng
```

Kiểu tin nóng dọc TikTok (9:16, ảnh tràn khung, tiêu đề chữ to bật từng từ, phụ đề karaoke, cắt nhanh):

```sh
reelmaker new tin-moi --style news            # 3 cảnh mẫu về Thành nhà Hồ
```

Kiểu meme người que (vuông 1080×1080, ~8 giây, lặp liền mạch, không giọng đọc):

```sh
reelmaker new meme-moi --style meme           # mẫu: "Khi code chạy được lần đầu… nhưng không biết tại sao"
```

Người que trong `stick.js`: tư thế theo thời gian (`pose`), nét mặt (`face`), bong bóng thoại (`say`), đi lại (`move`).

Bản đồ, lộ trình du lịch (OpenStreetMap; đường bộ thật hoặc đường bay; xe chạy, máy quay bám theo):

```sh
reelmaker new chuyen-di --style map            # mẫu: Hà Nội – Ninh Bình – Sầm Sơn, và bay Hà Nội – TP.HCM
reelmaker map <thư mục>                         # tạo mọi cảnh có "map": {"stops": "A; B; C", "mode": "drive|flight|line"}
reelmaker map <thư mục> --scene 03-hue --stops "Đà Nẵng; Hội An; Huế" --mode drive   # một cảnh, kiểu nào cũng được
```

Giọng VieNeu không cho biết lúc nào đọc chữ nào; có Whisper (faster-whisper, offline) thì `reelmaker voice` nghe lại
từng đoạn và căn thời gian từng chữ cho phụ đề, karaoke, nét vẽ. Cài: `python3.11 -m venv .venv-whisper &&
.venv-whisper/bin/pip install faster-whisper` (model ~480 MB tải lần đầu vào `~/.reelmaker/models/whisper`).

Hoạt hình Lottie (nhân vật, icon động… từ lottiefiles.com), dùng được ở mọi kiểu, chạy theo thời gian cảnh:

```sh
reelmaker lottie <thư mục> ~/Downloads/con-meo.json --as con-meo   # hoặc file .lottie, hoặc đường dẫn https
```

Font Google và thư viện CDN (KaTeX…) được lưu ở `~/.reelmaker/cache/web` sau lần tải đầu: render không cần mạng.

Tuyến metro / tàu (kiểu `metro`, hoặc trong bất kỳ video nào):

```sh
reelmaker new can-ho-gan-ga --style metro      # mẫu: căn hộ gần ga Văn Quán → metro 2A → Văn Miếu
reelmaker map <thư mục> --transit "Văn Quán; Phùng Khoang; …; Cát Linh" --from "<địa chỉ>" --to "Văn Miếu"
```

Bản đồ tối, tuyến vẽ dần qua từng ga, km và phút mỗi ga (ước tính), đoạn đi bộ nét chấm (`lib/transit.js`).

Phụ đề karaoke dùng được cho mọi kiểu: `"captionStyle": "karaoke"` trong video.json.

Bốn kiểu nữa, mỗi kiểu có 3 cảnh mẫu:

```sh
reelmaker new lich-su --style engraving       # tranh khắc cổ màu nâu, máy quay lia trên tranh (mẫu: Kẻ Chợ thế kỷ XVII)
reelmaker new vi-sao --style vox              # phóng sự kiểu Vox: ảnh cắt dán, bút dạ quang, khoanh đỏ (mẫu: bàn phím QWERTY)
reelmaker new pytago --style math             # toán kiểu 3Blue1Brown: hình vẽ dần, công thức KaTeX (mẫu: định lý Pythagoras)
reelmaker new nghe-1 --style listening        # luyện nghe tiếng Anh: chép chính tả, nghe chậm, dịch, từ vựng
```

Kiểu bảng trắng (bàn tay vẽ từng nét, viết chữ, tô màu, tiếng bút):

```sh
reelmaker new cau-vong --style whiteboard     # 2 cảnh mẫu: mưa → cầu vồng, giọt nước tách màu
```

Cảnh là một SVG với các nhóm `<g data-draw="1.2-2.5">` (vẽ trong khoảng thời gian đó) và `<g data-fill="2.6">`
(tô màu); `whiteboard.js` lo bàn tay, nét, chữ và tiếng bút (`sfx/scribble-*.wav`, tự tạo bằng
`sfx/make_scribble.py`).

Bàn tay là ảnh thật (`template-whiteboard/assets/hand.png`). Đổi bàn tay: chụp hoặc tự tạo ảnh tay cầm bút dạ
trên phông xanh lá, rồi `reelmaker hand <ảnh>` (xoá phông, tìm đầu ngòi, cho cánh tay mờ dần; `--tip x,y`,
`--erase "x1,y1,x2,y2"`, `--project <thư mục>`). Không dùng ảnh stock đã bị xoá watermark.

Tranh chi tiết từ ảnh (tay vẽ lại tranh nét, rồi ảnh màu hiện dần): cần `brew install potrace`.

```sh
reelmaker lineart <thư mục> ~/Downloads/con-meo.png --scene 03-con-meo   # ghi scenes/03-con-meo.html
```

`--mode lines` cho tranh hoạt hình / tranh tô màu (đẹp nhất), `--mode sketch` cho ảnh chụp, `--color none` giữ
đen trắng.

Phụ đề SRT (YouTube): tự xuất `out/video.srt` mỗi lần render; `reelmaker srt <thư mục>` để xuất lại.
Số viết bằng chữ trong lời đọc → hiện chữ số trong phụ đề: `"srtReplace": {"một nghìn chín trăm năm mươi sáu": "1956"}`.

Mẫu riêng của kênh và bộ để đăng:

```sh
reelmaker style save <thư mục> --name kenh-cua-toi     # lưu phong cách video ưng ý (giọng, nhạc, khung, bố cục, quy tắc)
reelmaker new video-moi --style kenh-cua-toi            # video mới theo mẫu đó; reelmaker styles để xem danh sách
reelmaker publish <thư mục>                             # out/dang/: video từng nền tảng, ảnh bìa, SRT, mo-ta.txt
```

Studio — xem video và ghim góp ý lên khung hình (chạy trên máy, http://127.0.0.1:4173):

```sh
reelmaker studio <thư mục>        # bấm lên hình để ghim góp ý; video tự tải lại khi render xong
reelmaker comments <thư mục>      # Claude đọc góp ý (kèm ảnh có vòng đỏ chỗ ghim); --done <id> khi đã sửa
```

Ảnh bìa (YouTube 1280×720 hoặc bìa TikTok 1080×1920), 3 phương án từ các cảnh đẹp nhất:

```sh
reelmaker thumbnail <thư mục> --title "5 sự thật *gây sốc* về AI" --kicker "Bạn có biết?"   # → out/thumbnail.jpg
```

Ảnh thật và video stock miễn phí:

```sh
reelmaker images <thư mục> "hoan kiem lake"             # Wikimedia (+ Pixabay nếu có khoá) → bảng ảnh có mã
reelmaker images <thư mục> "street food" --video        # video ngắn (Pixabay)
reelmaker images <thư mục> --use hoan-kiem-lake-3 --as ho-guom   # → assets/ho-guom.jpg + credits.json
reelmaker keys set pixabay                               # nhập khoá Pixabay (ẩn), chạy trong terminal
```

Nguồn ảnh/nhạc nằm trong `credits.json` và được ghi vào `mo-ta.txt` khi `reelmaker publish`; muốn có cảnh "Nguồn ảnh và video" ở cuối video thì thêm `"credits": true` vào video.json.

Nhạc nền (Wikimedia Commons: Kevin MacLeod, Jason Shaw… giấy phép CC) và tiếng hiệu ứng:

```sh
reelmaker music <thư mục> "calm piano"                  # tìm, tạo nghe-thu.mp3 với đoạn 20s của từng bài
reelmaker music <thư mục> --use calm-piano-2 [--start 12]   # đặt làm nhạc nền, ghi nguồn
reelmaker music <thư mục> --off                          # bỏ nhạc
```

Chuyển cảnh: `"transition": "fade"` (mặc định, 0.5s) cho cả video hoặc từng cảnh; 58 kiểu của ffmpeg
(`slideleft`, `circleopen`, `zoomin`…) và 125 kiểu GL Transitions viết `"gl:cube"`, `"gl:crosswarp"`… (MIT,
render bằng WebGL trong Chrome); `"cut"` để cắt thẳng. Xem trước: `reelmaker transitions --sheet`.

Tiếng hiệu ứng tự thêm khi render: whoosh lúc chuyển cảnh, pop khi phần tử có hiệu ứng `.pop` hiện ra; thêm
bằng `data-sfx="click|tick|chime|pop|whoosh"` trên phần tử. Thư viện tiếng ở [sfx/](sfx/README.md) (Kenney CC0 +
whoosh tự tạo). Tắt: `"sfx": false` trong video.json.

Cách viết cảnh: xem [skill/SKILL.md](skill/SKILL.md).
