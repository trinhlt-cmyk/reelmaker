"""Biến ảnh thành tranh nét (đường vector) để bàn tay vẽ lại trong kiểu video bảng trắng.

Dùng: lineart.py <ảnh> <thư mục tạm> [--mode auto|lines|sketch] [--detail 1.0]
In ra JSON: {"width", "height", "mode", "transform", "paths": [d, …]} — paths đã xếp theo thứ tự vẽ.

- lines : ảnh vốn là tranh nét / tranh tô màu / hoạt hình viền đen → lấy các điểm tối làm nét.
- sketch: ảnh chụp → kiểu phác thảo bút chì (chia độ sáng cho bản làm mờ, giữ chỗ đổi sáng tối).
- auto  : nền phần lớn sáng → lines, ngược lại → sketch.
Nét đen trắng được potrace chuyển thành đường cong; đường nhỏ hơn ngưỡng bị bỏ (đốm bẩn).
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def box_blur(a, r):
    # làm mờ hộp bằng tổng cộng dồn (nhanh, không cần scipy)
    pad = np.pad(a, r, mode='edge')
    c = pad.cumsum(0).cumsum(1)
    c = np.pad(c, ((1, 0), (1, 0)))
    k = 2 * r + 1
    s = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return s / (k * k)


def otsu(gray):
    hist = np.bincount(gray.astype(np.uint8).ravel(), minlength=256).astype(float)
    total = hist.sum()
    sum_all = (np.arange(256) * hist).sum()
    best, thresh, w0, sum0 = 0, 128, 0, 0
    for t in range(256):
        w0 += hist[t]
        if w0 == 0 or w0 == total:
            continue
        sum0 += t * hist[t]
        m0, m1 = sum0 / w0, (sum_all - sum0) / (total - w0)
        between = w0 * (total - w0) * (m0 - m1) ** 2
        if between > best:
            best, thresh = between, t
    return thresh


def ink_mask(img, mode, detail):
    gray = np.asarray(img.convert('L')).astype(np.float32)
    if mode == 'auto':
        mode = 'lines' if (gray > 200).mean() > 0.45 else 'sketch'
    if mode == 'lines':
        t = min(otsu(gray), 150)
        ink = gray < t
    else:
        # phác thảo: vùng đổi sáng tối mạnh thành nét; detail lớn → nhiều nét hơn
        blur = box_blur(gray, max(2, int(min(gray.shape) / 120)))
        dodge = np.clip(gray / (blur + 1) * 255, 0, 255)
        ink = dodge < 255 - 28 / detail
    return ink, mode


def write_pbm(ink, path):
    h, w = ink.shape
    packed = np.packbits(ink.astype(np.uint8), axis=1)
    with open(path, 'wb') as f:
        f.write(f'P4\n{w} {h}\n'.encode())
        f.write(packed.tobytes())


def first_point(d):
    m = re.match(r'\s*[Mm]\s*(-?[\d.]+)[ ,](-?[\d.]+)', d)
    return (float(m.group(1)), float(m.group(2))) if m else (0.0, 0.0)


def order_paths(paths):
    # vẽ lần lượt đường gần nhất với đường vừa vẽ, bắt đầu từ góc trên trái (toạ độ potrace: y lật ngược)
    pts = [first_point(d) for d in paths]
    if not pts:
        return []
    left = set(range(len(paths)))
    cur = max(left, key=lambda i: pts[i][1] - pts[i][0])  # trên cùng-trái nhất (y potrace lớn = trên)
    order = [cur]
    left.remove(cur)
    while left:
        cx, cy = pts[cur]
        cur = min(left, key=lambda i: (pts[i][0] - cx) ** 2 + (pts[i][1] - cy) ** 2)
        order.append(cur)
        left.remove(cur)
    return [paths[i] for i in order]


def main():
    src, tmp = sys.argv[1], Path(sys.argv[2])
    args = sys.argv[3:]
    opt = {args[i].lstrip('-'): args[i + 1] for i in range(0, len(args) - 1, 2)}
    tmp.mkdir(parents=True, exist_ok=True)
    img = Image.open(src).convert('RGB')
    # giới hạn cỡ để số đường vừa phải
    img.thumbnail((1400, 1400))
    w, h = img.size
    ink, mode = ink_mask(img, opt.get('mode', 'auto'), float(opt.get('detail', 1.0)))
    pbm = tmp / 'ink.pbm'
    svg = tmp / 'ink.svg'
    write_pbm(ink, pbm)
    turd = str(int(max(8, (w * h) / 40000)))
    subprocess.run(['potrace', str(pbm), '-s', '-o', str(svg), '--turdsize', turd, '--alphamax', '1.0', '--opttolerance', '0.4'], check=True)
    text = svg.read_text()
    transform = re.search(r'<g transform="([^"]+)"', text).group(1)
    paths = re.findall(r'<path d="([^"]+)"', text, re.S)
    paths = [re.sub(r'\s+', ' ', d).strip() for d in paths]
    print(json.dumps({'width': w, 'height': h, 'mode': mode, 'transform': transform, 'inkRatio': round(float(ink.mean()), 4),
                      'paths': order_paths(paths)}))


if __name__ == '__main__':
    main()
