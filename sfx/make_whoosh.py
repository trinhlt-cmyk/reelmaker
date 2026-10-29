"""Tạo tiếng "whoosh" chuyển cảnh: tiếng ồn hồng qua bộ lọc thông thấp quét lên rồi xuống, to dần rồi
nhỏ dần, lia từ trái sang phải. Chỉ dùng thư viện chuẩn của Python.

Dùng: make_whoosh.py <out.wav> <độ dài giây> <tần số đỉnh Hz> <seed>
"""
import math
import random
import struct
import sys
import wave

SR = 48000


def whoosh(seconds, peak_hz, seed):
    rnd = random.Random(seed)
    n = int(SR * seconds)
    # tiếng ồn hồng (Paul Kellet, bản rút gọn)
    b0 = b1 = b2 = 0.0
    lp1 = lp2 = 0.0
    left, right = [], []
    for i in range(n):
        x = i / n
        white = rnd.uniform(-1, 1)
        b0 = 0.99765 * b0 + white * 0.0990460
        b1 = 0.96300 * b1 + white * 0.2965164
        b2 = 0.57000 * b2 + white * 1.0526913
        pink = (b0 + b1 + b2 + white * 0.1848) * 0.2
        # tần số cắt quét theo hình chuông, đỉnh ở 40% thời lượng
        bell = math.exp(-((x - 0.4) ** 2) / 0.045)
        cutoff = 250 + peak_hz * bell
        a = 1 - math.exp(-2 * math.pi * cutoff / SR)
        lp1 += a * (pink - lp1)
        lp2 += a * (lp1 - lp2)  # hai tầng cho dốc 12 dB/oct
        # biên độ: lên nhanh, xuống chậm
        env = (x / 0.4) ** 2 if x < 0.4 else math.exp(-((x - 0.4) / 0.28) ** 2)
        s = lp2 * env
        pan = 0.15 + 0.7 * x  # trái → phải
        left.append(s * math.cos(pan * math.pi / 2))
        right.append(s * math.sin(pan * math.pi / 2))
    peak = max(max(map(abs, left)), max(map(abs, right))) or 1
    return [v / peak for v in left], [v / peak for v in right]


def main():
    out, seconds, peak_hz, seed = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), int(sys.argv[4])
    left, right = whoosh(seconds, peak_hz, seed)
    with wave.open(out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<hh", int(l * 32000), int(r * 32000)) for l, r in zip(left, right)))


if __name__ == "__main__":
    main()
