"""Căn thời gian từng chữ của giọng đọc bằng Whisper (faster-whisper, offline).

Dùng: align.py <audio.mp3> <voice.json> [model]
voice.json là file của reelmaker ({"lines": [{"start", "end", "text", "words": [...]}], …}); thời gian từng chữ
(ước lượng, vd của VieNeu) được thay bằng thời gian Whisper nghe được, rồi ghi đè file. Chữ trong kịch bản giữ
nguyên: Whisper chỉ cho biết lúc nào chữ đó được đọc. In ra JSON: {"matched": tỉ lệ chữ khớp, "words": số chữ}.
"""
import difflib
import json
import os
import re
import sys
import unicodedata

MODELS = os.path.join(os.path.expanduser("~"), ".reelmaker", "models", "whisper")


def norm(w):
    w = unicodedata.normalize("NFC", w.lower())
    return re.sub(r"[^\w]", "", w)


DIGIT = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]
SCALE = ["", "nghìn", "triệu", "tỷ"]


def triple(n, full):
    h, t, u = n // 100, n // 10 % 10, n % 10
    out = [DIGIT[h], "trăm"] if h or full else []
    if t == 0:
        out += (["linh"] if (h or full) else []) + [DIGIT[u]] if u else []
    elif t == 1:
        out += ["mười"] + (["lăm"] if u == 5 else [DIGIT[u]] if u else [])
    else:
        out += [DIGIT[t], "mươi"] + (["mốt"] if u == 1 else ["lăm"] if u == 5 else [DIGIT[u]] if u else [])
    return out


def read_int(s):
    """cùng cách đọc với src/pronounce.js (readInt)"""
    if len(s) > 1 and s.startswith("0") or len(s) > 12:
        return [DIGIT[int(d)] for d in s]
    if not s.strip("0"):
        return ["không"]
    groups = [int(s[max(0, i - 3):i]) for i in range(len(s), 0, -3)][::-1]
    out, started = [], False
    for i, g in enumerate(groups):
        if g:
            out += triple(g, started) + ([SCALE[len(groups) - 1 - i]] if SCALE[len(groups) - 1 - i] else [])
            started = True
    return out


def spell(word):
    """Whisper viết số bằng chữ số ("28/10/2026", "70.000") — giọng đọc thì đọc bằng chữ: đổi ra chữ để so khớp"""
    out = []
    for part in re.findall(r"\d+(?:[.,]\d{3})+|\d+|[^\d\W]+", word):
        if part[0].isdigit():
            out += read_int(re.sub(r"\D", "", part))
        else:
            out.append(part)
    return out or [word]


def main():
    audio, path = sys.argv[1], sys.argv[2]
    size = sys.argv[3] if len(sys.argv) > 3 else "small"
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    words = [w for line in data["lines"] for w in line.get("words", [])]
    if not words:
        print(json.dumps({"matched": 0, "words": 0}))
        return
    text = " ".join(w["text"] for w in words)

    from faster_whisper import WhisperModel

    model = WhisperModel(size, device="cpu", compute_type="int8", download_root=MODELS)
    # lời kịch bản làm gợi ý: Whisper nghe ra đúng chữ hơn (tên riêng, dấu)
    segments, _ = model.transcribe(audio, language="vi", word_timestamps=True, initial_prompt=text,
                                   vad_filter=False, beam_size=5, condition_on_previous_text=False)
    heard = []
    for s in segments:
        for w in s.words or []:
            parts = [norm(p) for p in spell(w.word)] if re.search(r"\d", w.word) else [norm(w.word)]
            parts = [p for p in parts if p]
            # một số nhiều chữ: chia thời gian đều cho các chữ
            for k, p in enumerate(parts):
                d = (w.end - w.start) / len(parts)
                heard.append((p, w.start + k * d, w.start + (k + 1) * d))

    # khớp chuỗi chữ kịch bản với chuỗi chữ nghe được
    a = [norm(w["text"]) for w in words]
    b = [h[0] for h in heard]
    times = [None] * len(words)
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            times[blk.a + k] = (heard[blk.b + k][1], heard[blk.b + k][2])
    matched = sum(t is not None for t in times)

    # chữ không khớp: chia khoảng trống giữa hai chữ đã khớp theo độ dài chữ
    end_all = max([h[2] for h in heard] + [words[-1]["end"]])
    i = 0
    while i < len(words):
        if times[i] is not None:
            i += 1
            continue
        j = i
        while j < len(words) and times[j] is None:
            j += 1
        lo = times[i - 1][1] if i > 0 else (words[0]["start"] if not heard else heard[0][1])
        hi = times[j][0] if j < len(words) else end_all
        span = [len(a[k]) or 1 for k in range(i, j)]
        t = lo
        for k, n in zip(range(i, j), span):
            d = max(0.0, hi - lo) * n / sum(span)
            times[k] = (t, t + d)
            t += d
        i = j

    k = 0
    for line in data["lines"]:
        for w in line.get("words", []):
            s, e = times[k]
            w["start"], w["end"] = round(s, 3), round(max(e, s + 0.05), 3)
            k += 1
        if line.get("words"):
            line["start"], line["end"] = line["words"][0]["start"], line["words"][-1]["end"]
    data["aligned"] = f"whisper-{size}"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(json.dumps({"matched": round(matched / len(words), 3), "words": len(words)}))


if __name__ == "__main__":
    main()
