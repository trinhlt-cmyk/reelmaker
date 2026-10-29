"""Dò nhịp (beat) của bản nhạc nền.

Dùng: beats.py <file nhạc> <giây bắt đầu> <độ dài cần (giây)>
In ra JSON: {"tempo": bpm, "beats": [giây, …], "downbeats": [giây, …]} — tính từ <giây bắt đầu> của bài
(tức là đúng thời điểm trong video, vì nhạc nền bắt đầu ở 0 của video).
"""
import json
import sys

import librosa
import numpy as np


def main():
    path, start, length = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    y, sr = librosa.load(path, sr=22050, mono=True, offset=start, duration=length + 2)
    tempo, frames = librosa.beat.beat_track(y=y, sr=sr, units='frames')
    times = librosa.frames_to_time(frames, sr=sr)
    # nhịp mạnh: nhịp có năng lượng khởi âm lớn nhất trong mỗi nhóm 4 (nhịp đầu ô nhịp, thường là trống cái)
    onset = librosa.onset.onset_strength(y=y, sr=sr)
    strength = onset[np.clip(frames, 0, len(onset) - 1)] if len(frames) else np.array([])
    down = []
    if len(times) >= 4:
        phase = int(np.argmax([strength[k::4].mean() for k in range(4)]))
        down = times[phase::4]
    print(json.dumps({
        'tempo': round(float(np.atleast_1d(tempo)[0]), 1),
        'beats': [round(float(t), 3) for t in times if t <= length],
        'downbeats': [round(float(t), 3) for t in down if t <= length],
    }))


if __name__ == '__main__':
    main()
