# reelmaker

**Làm video giải thích, video TikTok/Reels có giọng đọc tiếng Việt, ngay trên máy của bạn, miễn phí.**

Bạn nói chủ đề, Claude Code viết kịch bản và dựng từng cảnh. reelmaker lo phần còn lại: đọc lời, chạy hiệu ứng, ghép
nhạc, phụ đề, rồi xuất ra file MP4. Mỗi bước bạn đều được xem và duyệt trước khi đi tiếp.

- 27 giọng đọc tiếng Việt (Bắc, Trung, Nam); phụ đề karaoke khớp từng chữ
- 10 kiểu video: giải thích, bảng trắng tay vẽ, tin nóng TikTok, meme, bản đồ du lịch, gần ga metro, tranh khắc cổ,
  phóng sự kiểu Vox, toán kiểu 3Blue1Brown, luyện nghe tiếng Anh
- Ảnh, video, nhạc miễn phí (Wikimedia, Pixabay) kèm ghi nguồn tự động; hoạt hình Lottie
- Tự kiểm tra lỗi (chữ tràn, bị nút TikTok che, thiếu font, âm lượng…), trang góp ý ghim lên khung hình
- Ảnh bìa, phụ đề SRT, bộ file sẵn để đăng YouTube / TikTok / Reels

---

## Mục lục

1. [Cài đặt](#cài-đặt)
2. [Bắt đầu nhanh](#bắt-đầu-nhanh)
3. [Các kiểu video](#các-kiểu-video)
4. [Lệnh](#lệnh)
5. [Một project gồm những gì](#một-project-gồm-những-gì)
6. [Lỗi thường gặp](#lỗi-thường-gặp)
7. [Nguồn và giấy phép](#nguồn-và-giấy-phép)

---

## Cài đặt

**Cần có:** macOS hoặc Linux, [Node.js](https://nodejs.org) 20 trở lên, [ffmpeg](https://ffmpeg.org),
Google Chrome, Python 3.11.

```sh
# 1. Tải về và cài
git clone https://github.com/trinhlt-cmyk/reelmaker.git ~/dev/reelmaker
cd ~/dev/reelmaker
npm install
python3.11 -m venv .venv && .venv/bin/pip install edge-tts librosa pillow
npm link                                              # để gõ được lệnh `reelmaker`

# 2. Cho Claude Code biết cách dùng reelmaker
ln -s ~/dev/reelmaker/skill ~/.claude/skills/reelmaker

# 3. Kiểm tra máy và chọn thiết lập mặc định (giọng, khung hình, nhạc…)
reelmaker setup
```

`reelmaker doctor` cho biết máy còn thiếu gì và lệnh để cài.

**Tuỳ chọn thêm:**

| Thành phần | Để làm gì | Cài |
|---|---|---|
| VieNeu-TTS | 25 giọng Việt offline | `uv venv -p python3.11 .venv-vieneu && VIRTUAL_ENV=.venv-vieneu uv pip install vieneu` |
| Whisper | Phụ đề khớp từng chữ cho giọng VieNeu | `python3.11 -m venv .venv-whisper && .venv-whisper/bin/pip install faster-whisper` |
| potrace | Biến ảnh thành tranh nét (kiểu bảng trắng) | `brew install potrace` |
| Khoá Pixabay | Thêm nguồn ảnh/video miễn phí | Tạo tài khoản ở pixabay.com rồi chạy `reelmaker keys set pixabay` |

Model VieNeu và Whisper (vài trăm MB) tự tải về `~/.reelmaker/models` ở lần dùng đầu.

---

## Bắt đầu nhanh

### Cách 1 — nhờ Claude Code (nên dùng)

Mở Claude Code và nói, ví dụ:

> làm video 1 phút giới thiệu Sầm Sơn, kiểu bảng trắng

> làm video TikTok từ bài báo này: https://…

Claude đi qua 5 bước và dừng lại chờ bạn duyệt ở mỗi bước:

| Bước | Claude làm | Bạn làm |
|---|---|---|
| 1. Yêu cầu | hỏi độ dài, kiểu video, giọng | trả lời hoặc chọn mặc định |
| 2. Kịch bản | đưa 3 hướng, rồi viết chi tiết hướng bạn chọn | chọn, sửa, "duyệt" |
| 3. Giọng và nhạc | đọc lời, tìm nhạc | nghe thử, đổi giọng/tốc độ, chọn nhạc |
| 4. Dựng cảnh | dựng từng cảnh, tự kiểm tra lỗi, gửi ảnh chụp | duyệt hoặc góp ý |
| 5. Render | xuất MP4, phụ đề, ảnh bìa | xem video, sửa nếu cần |

### Cách 2 — tự chạy lệnh

```sh
reelmaker new bau-troi                       # tạo project mẫu trong ~/Videos/reelmaker/bau-troi
# sửa lời đọc trong video.json và các cảnh trong scenes/*.html
reelmaker voice  ~/Videos/reelmaker/bau-troi # đọc lời, báo độ dài từng cảnh
reelmaker still  ~/Videos/reelmaker/bau-troi 01-hook 0.5,end   # chụp thử một cảnh
reelmaker render ~/Videos/reelmaker/bau-troi # → out/video.mp4
reelmaker check  ~/Videos/reelmaker/bau-troi # tìm lỗi
```

Chỉ gõ tên (`bau-troi`) thì project nằm trong thư mục lưu video mặc định (đổi bằng `reelmaker setup`).

---

## Các kiểu video

Tạo bằng `reelmaker new <tên> --style <kiểu>`. Mỗi kiểu có sẵn vài cảnh mẫu để xem và sửa.

| Kiểu | `--style` | Khung | Hợp với |
|---|---|---|---|
| Giải thích | *(bỏ trống)* | 16:9 | bài học, giới thiệu: chữ, sơ đồ, ảnh chuyển động |
| Bảng trắng | `whiteboard` | 16:9 | giải thích khái niệm: bàn tay thật vẽ từng nét rồi tô màu |
| Tin nóng | `news` | 9:16 | TikTok/Reels: chữ to, số liệu, phụ đề karaoke |
| Meme | `meme` | 1:1 | người que hài hước, lặp liền mạch |
| Bản đồ | `map` | 16:9 | du lịch, hành trình: đường vẽ dần, xe/máy bay chạy |
| Gần ga metro | `metro` | 9:16 | bất động sản: ảnh căn hộ, tuyến metro vẽ qua từng ga, tổng thời gian |
| Tranh khắc | `engraving` | 16:9 | lịch sử: tranh cổ màu nâu, hạt phim, máy quay lia |
| Phóng sự Vox | `vox` | 16:9 | "vì sao…": ảnh cắt dán, bút dạ quang, khoanh đỏ |
| Toán | `math` | 16:9 | kiểu 3Blue1Brown: hình vẽ dần, công thức KaTeX |
| Luyện nghe | `listening` | 16:9 | tiếng Anh: chép chính tả, nghe chậm, dịch, từ vựng |

Video ưng ý có thể lưu thành **mẫu riêng** của kênh (xem [Mẫu riêng](#mẫu-riêng)).

---

## Lệnh

Gõ `reelmaker` không kèm gì để xem danh sách đầy đủ. `<tm>` dưới đây là thư mục project, ví dụ
`~/Videos/reelmaker/sam-son`.

### Thiết lập

| Lệnh | Làm gì |
|---|---|
| `reelmaker setup` | Kiểm tra máy rồi hỏi các lựa chọn mặc định: giọng, tốc độ, khung hình, giao diện, nhạc, tiếng hiệu ứng, chuyển cảnh |
| `reelmaker doctor` | Chỉ kiểm tra máy |
| `reelmaker config` | Xem thiết lập đang dùng |
| `reelmaker keys set pixabay` | Nhập khoá Pixabay (gõ ẩn). **Đừng dán khoá vào chat** |

Đặt thẳng không cần hỏi: `reelmaker setup --voice "Quốc Tuấn" --rate +5% --format 9:16 --music upbeat`.

### Tạo và dựng video

| Lệnh | Làm gì |
|---|---|
| `reelmaker new <tên> [--style <kiểu>]` | Tạo project mới từ một kiểu hoặc mẫu riêng |
| `reelmaker voice <tm>` | Đọc lời từng cảnh, in độ dài (chỉ đọc lại cảnh có thay đổi) |
| `reelmaker still <tm> <cảnh> 0.5,3,end` | Chụp ảnh một cảnh ở các giây cho trước, để xem nhanh |
| `reelmaker render <tm>` | Render và ghép thành `out/video.mp4` |
| `reelmaker render <tm> --scene 03-bai-bien` | Chỉ render lại một cảnh |

### Giọng đọc

| Lệnh | Làm gì |
|---|---|
| `reelmaker voices` | Danh sách 27 giọng, đánh số, ghi rõ online/offline |
| `reelmaker voices --sample` | Một file mp3 có mọi giọng đọc cùng một câu, kèm mốc thời gian từng giọng |
| `reelmaker voices --sample --text "câu của bạn"` | Nghe thử bằng câu khác |

Chọn giọng bằng tên hoặc số: `reelmaker setup --voice "Trúc Ly"`, hoặc `"voice"` trong `video.json`.

### Giọng của bạn (nhân bản giọng)

Ghi âm 6–10 giây bạn nói tự nhiên, chỗ yên tĩnh (file m4a từ điện thoại cũng được), rồi:

```bash
reelmaker voice-clone ~/Downloads/giong-toi.m4a --name "Lê"
reelmaker say "Xin chào, đây là giọng của tôi." --voice "clone:Lê"
```

Bài hát hoặc video có nhạc nền: thêm `--separate` để tách lời khỏi nhạc trước (cần Demucs:
`python3.11 -m venv .venv-demucs && .venv-demucs/bin/pip install demucs soundfile`). Nhiều file cùng lúc cũng được:
`reelmaker voice-clone a.mp4 b.mp3 --name "Lê" --separate`.

Từ đó đặt `"voice": "clone:Lê"` trong `video.json` (hoặc `reelmaker setup --voice "Lê"`). Chạy offline bằng VieNeu.
Chỉ dùng giọng của bạn hoặc người đã đồng ý. `reelmaker voice-clone --list` / `--remove "Lê"`.

### Phát âm

Viết kịch bản bình thường: `iPhone 17 giá 70.000đ/kg, rẻ hơn 15% so với TP.HCM.` Giọng đọc tiếng Việt sẽ đọc
"ai phôn mười bảy giá bảy mươi nghìn đồng một ký…", còn phụ đề vẫn hiện đúng chữ bạn viết. Số, tiền, ngày, giờ,
đơn vị tự đổi; chữ viết tắt và tên nước ngoài tra từ điển (có sẵn khoảng 140 từ).

| Lệnh | Làm gì |
|---|---|
| `reelmaker say "TikTok ra mắt ngày 28/10"` | Nghe thử cách đọc một câu, in ra "đọc là: …" |
| `reelmaker say "Canva" --as "can va"` | Lưu cách đọc vào từ điển của bạn (`~/.reelmaker/pronounce.json`) |
| `reelmaker say --check <tm>` | Tìm chữ trong kịch bản dễ bị đọc sai mà từ điển chưa có |
| `reelmaker say --list` | Xem từ điển của bạn |
| `reelmaker say --remove "Canva"` | Bỏ một cách đọc |

### Ảnh, video, nhạc, hoạt hình

| Lệnh | Làm gì |
|---|---|
| `reelmaker images <tm> "hoan kiem lake"` | Tìm ảnh miễn phí, ra bảng ảnh có mã (từ khoá tiếng Anh tìm được nhiều hơn) |
| `reelmaker images <tm> "street food" --video` | Tìm video ngắn (cần khoá Pixabay) |
| `reelmaker images <tm> --use <mã> --as ho-guom` | Lấy ảnh vào `assets/`, ghi nguồn vào `credits.json` |
| `reelmaker music <tm> "Kevin MacLeod calm"` | Tìm nhạc nền, ra một file nghe thử các bài |
| `reelmaker music <tm> --use <mã>` | Đặt làm nhạc nền (`--start 12` để bỏ đoạn đầu) |
| `reelmaker music <tm> --off` | Bỏ nhạc nền |
| `reelmaker lottie <tm> con-meo.json --as con-meo` | Thêm hoạt hình Lottie (file .json / .lottie / link từ lottiefiles.com) |
| `reelmaker transitions --sheet` | Xem 183 kiểu chuyển cảnh |

### Bản đồ

| Lệnh | Làm gì |
|---|---|
| `reelmaker map <tm> --scene 03-hue --stops "Đà Nẵng; Hội An; Huế" --mode drive` | Lộ trình đường bộ thật, xe chạy, máy quay bám theo (`flight` = đường bay, `line` = đường thẳng) |
| `reelmaker map <tm> --transit "Văn Quán; Phùng Khoang; …; Cát Linh" --from "<địa chỉ>" --to "Văn Miếu"` | Tuyến metro / tàu: bản đồ tối, tuyến vẽ qua từng ga, km và phút mỗi ga, đoạn đi bộ |

Ga bị tìm sai chỗ thì ghi kèm toạ độ: `"Vành Đai 3@20.9932,105.8008"`.

### Kiểu bảng trắng

| Lệnh | Làm gì |
|---|---|
| `reelmaker lineart <tm> anh.jpg --scene 03-bai-bien --mode sketch` | Biến ảnh thành tranh nét để bàn tay vẽ lại rồi hiện màu (`lines` cho tranh nét đen trắng) |
| `reelmaker hand anh-tay.png --rotate 45` | Đổi bàn tay (ảnh tay cầm bút trên phông xanh lá) |

### Kiểm tra và duyệt

| Lệnh | Làm gì |
|---|---|
| `reelmaker check <tm>` | Tìm lỗi: chữ tràn/đè, bị phụ đề hoặc nút TikTok che, thiếu font, khó đọc, cảnh trống, khung đen, im lặng, âm lượng |
| `reelmaker check <tm> --no-video` | Chỉ kiểm tra các cảnh, chưa cần render |
| `reelmaker studio <tm>` | Mở trang xem video (http://127.0.0.1:4173), bấm lên khung hình để ghim góp ý |
| `reelmaker comments <tm>` | Đọc các góp ý đã ghim |

`✗` là lỗi cần sửa, `⚠` là cảnh báo nên xem lại.

### Xuất và đăng

| Lệnh | Làm gì |
|---|---|
| `reelmaker thumbnail <tm> --title "5 sự thật *gây sốc*" --kicker "Bạn có biết?"` | 3 phương án ảnh bìa (chữ trong `*…*` màu vàng) |
| `reelmaker srt <tm>` | Xuất phụ đề `out/video.srt` cho YouTube (render cũng tự xuất) |
| `reelmaker publish <tm>` | Bộ để đăng trong `out/dang/`: video cho từng nền tảng, ảnh bìa, SRT, `mo-ta.txt` (mô tả, mốc chương, hashtag, ghi nguồn) |
| `reelmaker publish <tm> --platforms tiktok,shorts --max-mb 50` | Chọn nền tảng, nén vừa dung lượng |

### Mẫu riêng

| Lệnh | Làm gì |
|---|---|
| `reelmaker style save <tm> --name kenh-cua-toi` | Lưu video ưng ý thành mẫu: giọng, nhạc, màu, bố cục |
| `reelmaker new video-moi --style kenh-cua-toi` | Video mới theo mẫu đó |
| `reelmaker styles` | Xem danh sách mẫu riêng (`--remove <tên>` để xoá) |

---

## Một project gồm những gì

```
~/Videos/reelmaker/sam-son/
├── video.json        cài đặt + danh sách cảnh và lời đọc
├── scenes/           mỗi cảnh một file HTML
├── shared.css        màu, chữ, hiệu ứng dùng chung
├── assets/           ảnh, nhạc, hoạt hình
├── credits.json      nguồn ảnh/nhạc (tự ghi)
├── build/            file tạm: giọng đọc, cảnh đã render, ảnh chụp
└── out/              video.mp4, video.srt, thumbnail.jpg, dang/
```

Một cảnh trong `video.json`:

```json
{ "id": "01-hook", "html": "scenes/01-hook.html", "narration": "Lời đọc của cảnh, viết cho tai nghe." }
```

Cảnh không có lời thì ghi `"duration": 4` thay cho `"narration"`. Một số cài đặt hay dùng:

| Khoá | Ý nghĩa |
|---|---|
| `"voice"`, `"rate"` | giọng và tốc độ, cho cả video hoặc từng cảnh |
| `"phrasing": true` | giọng VieNeu / nhân bản nghỉ sau từng vế câu (nhịp ngâm, kể chuyện) |
| `"pitch": "+20Hz"` | cao độ giọng (giọng edge-tts): cao hơn nghe gắt, kiểu "giật tít"; đặt cho cả video hoặc riêng cảnh hook |
| `"captionStyle": "karaoke"` | phụ đề chữ to, từ đang đọc sáng lên |
| `"transition": "gl:cube"` | kiểu chuyển cảnh (xem `reelmaker transitions`) |
| `"beatSync": true` | chuyển cảnh rơi đúng nhịp nhạc |
| `"pronounce": { "Canva": "can va" }` | cách đọc riêng cho video này (`false` = tắt tự đổi số và từ điển) |
| `"srtReplace": { "hai trăm": "200" }` | (project cũ viết số bằng chữ) đổi lại thành chữ số trong file SRT |
| `"hookCheck": false` | tắt kiểm tra câu mở đầu (≤ 3 giây, có tít chữ to lúc 0,5 giây) của `reelmaker check` |
| `"credits": true` | thêm cảnh "Nguồn ảnh và video" ở cuối (mặc định tắt; nguồn nằm trong `mo-ta.txt`) |

---

## Lỗi thường gặp

| Gặp | Cách xử lý |
|---|---|
| Không thấy lệnh `reelmaker` | Chạy `npm link` trong thư mục reelmaker, hoặc dùng `node ~/dev/reelmaker/bin/reelmaker.js` |
| edge-tts báo không nhận được tiếng | Mạng chập chờn: chạy lại, hoặc dùng giọng VieNeu (offline) |
| Phụ đề giọng VieNeu lệch | Cài Whisper (bảng tuỳ chọn ở trên) rồi chạy lại `reelmaker voice` |
| Pixabay bị chặn | Mạng chặn Pixabay: dùng `--source wikimedia` |
| Bản đồ không tải được | Lần đầu cần mạng tới openstreetmap.fr, photon.komoot.io, router.project-osrm.org; bản đồ đã tải được lưu lại |
| Render chậm | `reelmaker render <tm> --jobs 3` để render nhiều cảnh cùng lúc |

Font Google và thư viện CDN được lưu ở `~/.reelmaker/cache/web` sau lần tải đầu, nên các lần sau render không cần
mạng.

---

## Nguồn và giấy phép

Code của reelmaker không kèm giấy phép dùng lại; tác giả giữ toàn quyền.
Ảnh mẫu, tiếng hiệu ứng, thư viện và bản đồ của bên thứ ba giữ giấy phép riêng: xem
[THIRD_PARTY.md](THIRD_PARTY.md).

Video bạn làm ra: ảnh, nhạc lấy qua reelmaker được ghi nguồn trong `credits.json` và `out/dang/mo-ta.txt`. Nhớ dán
phần ghi nguồn vào mô tả khi đăng, vì nhiều giấy phép (CC BY, CC BY-SA) bắt buộc điều này.
