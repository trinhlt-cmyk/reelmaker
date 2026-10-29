"""Giọng đọc VieNeu-TTS (offline, chạy trên CPU) cho reelmaker.

Dùng:
  vieneu_tts.py voices                                         in danh sách giọng (JSON)
  vieneu_tts.py say <text_file> <out_wav> <voice> <speed>      đọc văn bản ra file wav

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


def load():
    # các thông báo của thư viện ra stderr, để stdout chỉ còn kết quả
    real_stdout, sys.stdout = sys.stdout, sys.stderr
    try:
        from vieneu import Vieneu
        from vieneu._v3_turbo_engine import onnx_runtime_lite

        onnx_dir = fetch(V3_REPO, V3_FILES, V3_SUBFOLDER, MODELS / "v3-turbo")
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


def main():
    cmd = sys.argv[1]
    tts = load()
    if cmd == "voices":
        print(json.dumps([{"id": v[1], "label": v[0]} for v in tts.list_preset_voices()], ensure_ascii=False))
        return
    # cùng giao diện với tts.py: <text_file> <out_mp3> <out_json> <voice> <rate> <max_words>
    text_file, out_mp3, out_json, voice, rate, max_words = sys.argv[2:8]
    with open(text_file, encoding="utf-8") as f:
        text = f.read().strip()
    real_stdout, sys.stdout = sys.stdout, sys.stderr
    try:
        audio = tts.infer(text=text, voice=tts.get_preset_voice(voice or None), apply_watermark=False)
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
