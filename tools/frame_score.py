"""Chấm điểm ảnh làm nền ảnh bìa: nhiều màu, tương phản tốt, có chi tiết (không trống trơn, không rối quá).

Dùng: frame_score.py <ảnh> [<ảnh> …]   → in JSON {đường dẫn: điểm}
"""
import json
import sys

import numpy as np
from PIL import Image


def score(path):
    im = Image.open(path).convert('RGB')
    im.thumbnail((480, 480))
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # độ rực màu (Hasler & Süsstrunk)
    rg, yb = r - g, 0.5 * (r + g) - b
    colorful = np.sqrt(rg.std() ** 2 + yb.std() ** 2) + 0.3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2)
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    contrast = lum.std()
    # mật độ cạnh: có chi tiết, nhưng phạt khi quá rối
    edges = (np.abs(np.diff(lum, axis=1)) > 25).mean()
    detail = edges * 100 if edges < 0.18 else 18 - (edges - 0.18) * 60
    # phạt ảnh quá tối hoặc quá sáng
    exposure = -abs(lum.mean() - 120) / 4
    return round(float(colorful * 0.6 + contrast * 0.8 + detail * 1.5 + exposure), 2)


print(json.dumps({p: score(p) for p in sys.argv[1:]}))
