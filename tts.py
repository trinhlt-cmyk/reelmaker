"""Sinh giọng đọc bằng edge-tts + phụ đề canh theo từng từ.

Dùng: tts.py <text_file> <out_mp3> <out_json> <voice> <rate> <max_words> [pitch, vd +15Hz]
In ra JSON: {"lines": [{"start", "end", "text"}], "words": [...]}
"""
import asyncio
import json
import sys
import time

import edge_tts


async def synthesize(text, audio_path, voice, rate, pitch="+0Hz"):
    communicate = edge_tts.Communicate(text, voice=voice, rate=rate, pitch=pitch, boundary="WordBoundary")
    words = []
    with open(audio_path, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / 1e7
                words.append({"start": start, "end": start + chunk["duration"] / 1e7, "text": chunk["text"]})
    return words


def group_into_lines(words, text, max_words):
    """Ghép từ thành dòng phụ đề; ngắt khi đủ số từ hoặc hết câu.

    WordBoundary bỏ dấu câu, nên dò lại trong văn bản gốc để biết từ nào kết thúc câu
    và để dòng phụ đề giữ nguyên dấu câu.
    """
    lines, buf, pos = [], [], 0
    for w in words:
        idx = text.find(w["text"], pos)
        if idx >= 0:
            end = idx + len(w["text"])
            while end < len(text) and text[end] in ".,!?…:;\"'”)":
                end += 1
            shown, pos = text[idx:end], end
        else:
            shown = w["text"]
        buf.append({**w, "text": shown})
        if len(buf) >= max_words or shown.endswith((".", "!", "?", "…")):
            lines.append(make_line(buf))
            buf = []
    if buf:
        lines.append(make_line(buf))
    return lines


def make_line(buf):
    # giữ thời gian từng từ để phụ đề kiểu karaoke tô sáng đúng chữ đang đọc
    words = [{"start": round(b["start"], 3), "end": round(b["end"], 3), "text": b["text"]} for b in buf]
    return {"start": buf[0]["start"], "end": buf[-1]["end"], "text": " ".join(b["text"] for b in buf), "words": words}


def main():
    text_file, out_mp3, out_json, voice, rate, max_words = sys.argv[1:7]
    pitch = sys.argv[7] if len(sys.argv) > 7 else "+0Hz"
    with open(text_file, encoding="utf-8") as f:
        text = f.read().strip()
    # dịch vụ edge-tts thỉnh thoảng trả về rỗng: thử lại vài lần
    attempts = 6
    for attempt in range(attempts):
        try:
            words = asyncio.run(synthesize(text, out_mp3, voice, rate, pitch))
            break
        except edge_tts.exceptions.NoAudioReceived:
            if attempt == attempts - 1:
                raise
            time.sleep(2 * (attempt + 1))
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump({"words": words, "lines": group_into_lines(words, text, int(max_words))}, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
