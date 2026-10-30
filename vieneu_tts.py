"""Giọng đọc VieNeu-TTS (offline, chạy trên CPU) cho reelmaker.

Dùng:
  vieneu_tts.py voices                                         in danh sách giọng (JSON)
  vieneu_tts.py say <text_file> <out_wav> <voice> <speed>      đọc văn bản ra file wav
  vieneu_tts.py clone <ref_audio> <out.npz>                     nhân bản giọng: lưu dấu giọng (speaker_emb + codes)
  voice "clone:<thư mục>" = giọng nhân bản đã lưu (<thư mục>/voice.npz)

Model được tải một lần vào ~/.reelmaker/models/vieneu (file thật, không symlink: onnxruntime mới từ chối
file .data nằm ngoài thư mục model, mà cache của HuggingFace lại để chúng ở dạng symlink).
"""
import json
import os
import sys
from pathlib import Path

MODELS = Path(os.environ.get("REELMAKER_MODELS", Path.home() / ".reelmaker" / "models")) / "vieneu"
V3_REPO = "pnnbao-ump/VieNeu-TTS-v3-Turbo"
V3_SUBFOLDER = "onnx_update"
V3_FILES = [
    "vieneu_prefill.onnx", "vieneu_decode_step.onnx", "vieneu_acoustic_cached.onnx",
    "vieneu_backbone_shared.data", "vieneu_v3_heads.npz", "config.json", "tokenizer.json",
]
# nhân bản giọng: bộ lấy dấu giọng + bộ lọc tạp âm, ở gốc repo; chỉ tải khi nhân bản lần đầu
CLONE_FILES = ["speaker_encoder.onnx", "denoiser.onnx"]
CODEC_REPO = "OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX"
CODEC_FILES = [
    "moss_audio_tokenizer_decode_full.onnx", "moss_audio_tokenizer_decode_shared.data",
    "moss_audio_tokenizer_decode_step.onnx", "codec_browser_onnx_meta.json",
    "moss_audio_tokenizer_encode.onnx", "moss_audio_tokenizer_encode.data",
]


def fetch(repo, files, subfolder, dest):
    from huggingface_hub import hf_hub_download

    for fn in files:
        target = dest / (subfolder or "") / fn
        if target.is_file():
            continue
        print(f"tải {repo}/{fn}", file=sys.stderr)
        try:
            hf_hub_download(repo, fn, subfolder=subfolder, local_dir=dest)
        except Exception:
            if not fn.endswith(".json"):
                raise
    return dest / (subfolder or "")


def load(clone=False):
    # các thông báo của thư viện ra stderr, để stdout chỉ còn kết quả
    real_stdout, sys.stdout = sys.stdout, sys.stderr
    try:
        from vieneu import Vieneu
        from vieneu._v3_turbo_engine import onnx_runtime_lite

        onnx_dir = fetch(V3_REPO, V3_FILES, V3_SUBFOLDER, MODELS / "v3-turbo")
        if clone:
            # engine tìm speaker_encoder.onnx / denoiser.onnx cạnh model (thư mục onnx)
            fetch(V3_REPO, CLONE_FILES, None, onnx_dir)
        codec_dir = fetch(CODEC_REPO, CODEC_FILES, None, MODELS / "codec")
        # Vieneu() không chuyển codec_dir xuống engine (vieneu 3.8): gài vào trực tiếp
        engine = onnx_runtime_lite.OnnxV3LiteEngine
        original_init = engine.__init__

        def init(self, *args, **kwargs):
            kwargs.setdefault("codec_dir", str(codec_dir))
            original_init(self, *args, **kwargs)

        engine.__init__ = init
        return Vieneu(onnx_dir=str(onnx_dir))
    finally:
        sys.stdout = real_stdout


def speech_spans(audio, sr, frame_s=0.02, min_gap_s=0.15):
    """Các đoạn có tiếng [(start, end)] (giây), tách bởi khoảng lặng dài ≥ min_gap_s."""
    import numpy as np

    n = int(sr * frame_s)
    frames = len(audio) // n
    if frames == 0:
        return [(0.0, len(audio) / sr)]
    rms = np.sqrt((audio[: frames * n].reshape(frames, n) ** 2).mean(axis=1))
    loud = rms > max(rms.max() * 0.03, 1e-4)
    spans, start, quiet = [], None, 0
    for i, on in enumerate(loud):
        if on:
            if start is None:
                start = i
            quiet = 0
        elif start is not None:
            quiet += 1
            if quiet * frame_s >= min_gap_s:
                spans.append((start * frame_s, (i - quiet + 1) * frame_s))
                start, quiet = None, 0
    if start is not None:
        spans.append((start * frame_s, (frames - quiet) * frame_s))
    return spans or [(0.0, len(audio) / sr)]


def caption_lines(text, spans, max_words):
    """Phụ đề ước lượng: VieNeu không cho thời gian từng từ, nên chia thời gian *có tiếng* theo số âm tiết
    (tiếng Việt: mỗi từ cách nhau bởi dấu cách là một âm tiết), bỏ qua các khoảng lặng giữa câu."""
    words = text.split()
    lines, buf = [], []
    for w in words:
        buf.append(w)
        if len(buf) >= max_words or w.endswith((".", "!", "?", "…")):
            lines.append(buf)
            buf = []
    if buf:
        lines.append(buf)

    total = sum(e - s for s, e in spans)

    def at(speech_t):
        # thời điểm trên trục "chỉ tính lúc có tiếng" → thời điểm thật trong file
        for s, e in spans:
            if speech_t <= e - s:
                return s + speech_t
            speech_t -= e - s
        return spans[-1][1]

    out, done = [], 0
    for line in lines:
        a = at(total * done / len(words))
        # thời gian từng từ (ước lượng như cả dòng) cho phụ đề kiểu karaoke
        timed = []
        for w in line:
            ws = at(total * done / len(words))
            done += 1
            timed.append({"start": round(ws, 3), "end": round(at(total * done / len(words)), 3), "text": w})
        b = at(total * done / len(words))
        out.append({"start": round(a, 3), "end": round(b, 3), "text": " ".join(line), "words": timed})
    return out


def rate_to_tempo(rate):
    """"+5%" → 1.05 (cùng cách viết tốc độ với edge-tts)."""
    return 1 + int(rate.rstrip("%")) / 100


def voice_of(tts, voice):
    """"clone:<thư mục>" → dấu giọng đã lưu; tên khác → giọng có sẵn"""
    if voice.startswith("clone:"):
        import numpy as np

        data = np.load(Path(voice[len("clone:"):]) / "voice.npz")
        return {"speaker_emb": data["speaker_emb"], "codes": data["codes"] if data["codes"].size else None}
    return tts.get_preset_voice(voice or None)


WINDOW_S = 8.0  # VieNeu chỉ dùng tối đa 8 giây bản ghi


def clone(tts, ref, out, denoise=None):
    """Dấu giọng từ bản ghi (wav mono). Bản ghi dài: mỗi đoạn 8 giây (bước 2 giây) lấy một dấu giọng; dấu giọng lưu lại
    là trung bình của chúng (ổn định hơn một đoạn), còn mã mẫu (codes) lấy từ đoạn giống trung bình nhất.
    denoise None = tự quyết: chỉ lọc tạp âm khi bản ghi ồn (lọc trên bản ghi sạch làm giọng kém giống, đo được)."""
    import tempfile

    import numpy as np
    import soundfile as sf

    wav, sr = sf.read(ref, dtype="float32", always_2d=False)
    if wav.ndim > 1:
        wav = wav.mean(axis=1)
    frame = int(sr * 0.04)
    rms = np.sqrt(np.mean(wav[: len(wav) // frame * frame].reshape(-1, frame) ** 2, axis=1)) + 1e-9
    db = np.maximum(20 * np.log10(rms), -80)  # im lặng tuyệt đối (file tạo bằng máy) không làm số đo vọt lên
    snr = float(np.percentile(db, 90) - np.percentile(db, 10))
    if denoise is None:
        denoise = snr < 20
    win, step = int(WINDOW_S * sr), int(2 * sr)
    starts = list(range(0, max(1, len(wav) - win + 1), step))
    encoder = tts.engine._ensure_speaker_encoder()
    clips = [wav[a:a + win] for a in starts]
    if denoise and tts.engine.denoiser is not None:
        clips = [tts.engine.denoiser.denoise(c, sr) for c in clips]
        csr = 44100
    else:
        csr = sr
    embs = np.stack([np.asarray(encoder.embed(c, csr), dtype=np.float32).reshape(-1) for c in clips])
    mean = embs.mean(axis=0)
    unit = lambda v: v / (np.linalg.norm(v) + 1e-9)
    best = int(np.argmax([float(unit(e) @ unit(mean)) for e in embs]))
    fd, tmp = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        sf.write(tmp, wav[starts[best]:starts[best] + win], sr)
        _, codes = tts.engine.prepare_reference(tmp, denoise=denoise, use_ref_codes=True)
    finally:
        os.remove(tmp)
    # cùng độ lớn với dấu giọng của một đoạn (mô hình học trên dấu giọng từng đoạn)
    emb = unit(mean) * float(np.linalg.norm(embs[best]))
    np.savez(out, speaker_emb=emb.astype(np.float32),
             codes=np.asarray(codes if codes is not None else [], dtype=np.int64))
    return {"ok": True, "windows": len(clips), "best_at": round(starts[best] / sr, 1),
            "snr_db": round(snr, 1), "denoise": bool(denoise)}


def main():
    cmd = sys.argv[1]
    tts = load(clone=cmd == "clone")
    if cmd == "voices":
        print(json.dumps([{"id": v[1], "label": v[0]} for v in tts.list_preset_voices()], ensure_ascii=False))
        return
    if cmd == "clone":
        ref, out = sys.argv[2], sys.argv[3]
        denoise = {"on": True, "off": False}.get(sys.argv[4] if len(sys.argv) > 4 else "auto")
        real_stdout, sys.stdout = sys.stdout, sys.stderr
        try:
            result = clone(tts, ref, out, denoise)
        finally:
            sys.stdout = real_stdout
        print(json.dumps(result))
        return
    # cùng giao diện với tts.py: <text_file> <out_mp3> <out_json> <voice> <rate> <max_words>
    text_file, out_mp3, out_json, voice, rate, max_words = sys.argv[2:8]
    # --phrase: mỗi vế câu (tới dấu phẩy) đọc thành một đoạn, giữa các đoạn nghỉ 0.3s (phẩy) / 0.5s (chấm) — nhịp
    # ngâm, kể chuyện; mặc định VieNeu gom tới 256 ký tự một đoạn nên dấu phẩy bên trong gần như không nghỉ
    max_chars = 40 if "--phrase" in sys.argv[8:] else 256
    with open(text_file, encoding="utf-8") as f:
        text = f.read().strip()
    real_stdout, sys.stdout = sys.stdout, sys.stderr
    try:
        audio = tts.infer(text=text, voice=voice_of(tts, voice), apply_watermark=False, max_chars=max_chars)
    finally:
        sys.stdout = real_stdout

    import subprocess
    import soundfile

    tempo = rate_to_tempo(rate)
    wav = out_mp3 + ".wav"
    soundfile.write(wav, audio, tts.sample_rate)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-filter:a", f"atempo={tempo}", "-ar", "48000",
         "-b:a", "192k", out_mp3],
        check=True,
    )
    os.remove(wav)
    spans = [(s / tempo, e / tempo) for s, e in speech_spans(audio, tts.sample_rate)]
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump({"lines": caption_lines(text, spans, int(max_words))}, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
