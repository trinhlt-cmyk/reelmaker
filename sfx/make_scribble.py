"""Tạo tiếng bút dạ cọ giấy: tiếng ồn trắng lọc dải (~1.5–6 kHz), biên độ nhấp nhô theo nhịp nét bút
(8–13 lần/giây, ngẫu nhiên), mờ vào/ra. Chỉ dùng thư viện chuẩn của Python.

Dùng: make_scribble.py <out.wav> <độ dài giây> <seed>
"""
import math
import random
import struct
import sys
import wave

SR = 48000


def scribble(seconds, seed):
    rnd = random.Random(seed)
    n = int(SR * seconds)
    hp_prev_in = hp_prev_out = lp = 0.0
    a_hp = math.exp(-2 * math.pi * 1500 / SR)
    a_lp = 1 - math.exp(-2 * math.pi * 6000 / SR)
    # nhịp nét bút: chuỗi "nét" dài ngẫu nhiên, mỗi nét lên rồi xuống
    strokes, t = [], 0.0
    while t < seconds:
        d = rnd.uniform(0.07, 0.13)
        strokes.append((t, d, rnd.uniform(0.55, 1.0)))
        t += d
    out = []
    k = 0
    for i in range(n):
        x = i / SR
        while k < len(strokes) - 1 and x >= strokes[k][0] + strokes[k][1]:
            k += 1
        s0, sd, amp = strokes[k]
        phase = (x - s0) / sd
        stroke_env = amp * math.sin(math.pi * min(max(phase, 0), 1)) ** 0.7
        white = rnd.uniform(-1, 1)
        hp = a_hp * (hp_prev_out + white - hp_prev_in)  # thông cao bậc 1
        hp_prev_in, hp_prev_out = white, hp
        lp += a_lp * (hp - lp)  # thông thấp bậc 1
        fade = min(1.0, x / 0.03, (seconds - x) / 0.06)
        out.append(lp * stroke_env * max(fade, 0))
    peak = max(map(abs, out)) or 1
    return [v / peak for v in out]


def main():
    out, seconds, seed = sys.argv[1], float(sys.argv[2]), int(sys.argv[3])
    mono = scribble(seconds, seed)
    with wave.open(out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<hh", int(v * 32000), int(v * 32000)) for v in mono))


if __name__ == "__main__":
    main()
