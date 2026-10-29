"""Biến ảnh bàn tay cầm bút trên phông trơn (xanh lá, xanh dương, trắng…) thành ảnh PNG nền trong suốt cho
kiểu video bảng trắng, và tìm đầu ngòi bút.

Dùng: make_hand.py <ảnh vào> <ảnh PNG ra> [--tip x,y] [--fade 220] [--erase "x1,y1,x2,y2;…"] [--preview xem.png]
In ra JSON: {"width", "height", "tip": [x, y], "armSide": "right|bottom|left|top"}

- Màu phông lấy từ 4 góc ảnh; độ trong suốt mềm theo khoảng cách màu tới phông (giữ bóng đổ nhẹ).
- Khử viền màu phông ở mép bàn tay (despill).
- Chỉ giữ khối lớn nhất (bàn tay + bút): bỏ vết mực, chữ, biểu tượng nằm rời trên phông.
- Cánh tay chạm mép ảnh nào thì mờ dần về mép đó, để trong video không thấy chỗ cắt.
- Đầu ngòi bút: điểm của khối xa mép cánh tay nhất (hoặc chỉ định bằng --tip).
"""
import json
import sys
from collections import deque

import numpy as np
from PIL import Image


def background_color(rgb):
    h, w, _ = rgb.shape
    k = max(4, min(h, w) // 25)
    corners = np.concatenate([rgb[:k, :k], rgb[:k, -k:], rgb[-k:, :k], rgb[-k:, -k:]]).reshape(-1, 3)
    return np.median(corners, axis=0)


def alpha_from_key(rgb, key):
    # theo sắc màu chứ không theo độ sáng: phông và bóng đổ trên phông (cùng sắc, tối hơn) đều thành trong suốt
    dominant = int(np.argmax(key))
    others = [c for c in range(3) if c != dominant]
    main = rgb[:, :, dominant]
    lead = main - rgb[:, :, others].max(axis=2)  # màu phông trội hơn các màu khác bao nhiêu
    ratio = lead / (main + 1)
    key_lead = key[dominant] - key[others].max()
    key_ratio = key_lead / (key[dominant] + 1)
    by_ratio = (ratio - key_ratio * 0.25) / (key_ratio * 0.35)
    # vật tối (bút đen) chỉ hơi ánh màu phông: tỉ lệ thì cao nhưng chênh lệch tuyệt đối nhỏ → vẫn giữ
    by_lead = (lead - key_lead * 0.18) / (key_lead * 0.25)
    return 1 - np.clip(np.minimum(by_ratio, by_lead), 0, 1)


def despill(rgb, key, alpha):
    # phông xanh lá: kéo kênh G về không quá trung bình R,B ở vùng mép (alpha chưa đầy)
    out = rgb.copy()
    dominant = int(np.argmax(key))
    others = [c for c in range(3) if c != dominant]
    limit = out[:, :, others].mean(axis=2) + 12
    edge = alpha < 0.98
    ch = out[:, :, dominant]
    ch[edge] = np.minimum(ch[edge], limit[edge])
    return out


def largest_component(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    best = None
    best_size = 0
    for y0, x0 in zip(*np.nonzero(mask[::4, ::4])):
        y0, x0 = y0 * 4, x0 * 4
        if seen[y0, x0] or not mask[y0, x0]:
            continue
        comp = []
        q = deque([(y0, x0)])
        seen[y0, x0] = True
        while q:
            y, x = q.popleft()
            comp.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if len(comp) > best_size:
            best, best_size = comp, len(comp)
    keep = np.zeros_like(mask, dtype=bool)
    if best:
        ys, xs = zip(*best)
        keep[list(ys), list(xs)] = True
    return keep


def grow(mask, r):
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    args = sys.argv[3:]
    opt = {args[i].lstrip('-'): args[i + 1] for i in range(0, len(args) - 1, 2)}
    img = Image.open(src).convert('RGB')
    rgb = np.asarray(img).astype(np.float32)
    h, w, _ = rgb.shape

    key = background_color(rgb)
    alpha = alpha_from_key(rgb, key)
    # --erase "x1,y1,x2,y2;…": xoá vùng (vết mực, chữ dính vào ngòi bút…)
    for box in filter(None, opt.get('erase', '').split(';')):
        x1, y1, x2, y2 = (int(v) for v in box.split(','))
        alpha[y1:y2, x1:x2] = 0
    # bỏ mọi thứ không dính vào khối bàn tay (giữ thêm viền mềm 3px quanh khối)
    solid = largest_component(alpha > 0.5)
    alpha = np.where(grow(solid, 3), alpha, 0)

    # cánh tay chạm mép nào: mép có nhiều điểm đặc nhất
    edges = {'right': solid[:, -1].sum(), 'left': solid[:, 0].sum(), 'bottom': solid[-1, :].sum(), 'top': solid[0, :].sum()}
    arm = max(edges, key=edges.get)
    fade = float(opt.get('fade', 220))
    yy, xx = np.mgrid[0:h, 0:w]
    dist_to_edge = {'right': w - 1 - xx, 'left': xx, 'bottom': h - 1 - yy, 'top': yy}[arm]
    if edges[arm] > 0:
        alpha = alpha * np.clip(dist_to_edge / fade, 0, 1)

    if 'tip' in opt:
        tip = [int(v) for v in opt['tip'].split(',')]
    else:
        # đầu ngòi: điểm đặc xa mép cánh tay nhất; cánh tay ở phải/trái thì xét theo x, kèm ưu tiên thấp nhất
        ys, xs = np.nonzero(solid)
        # giá trị nhỏ nhất = xa mép cánh tay nhất (cánh tay ở phải → điểm có x nhỏ nhất)
        far = {'right': xs, 'left': -xs, 'bottom': ys, 'top': -ys}[arm]
        i = int(np.argmin(far * 1000 - ys))  # xa nhất; hoà thì lấy điểm thấp hơn
        tip = [int(xs[i]), int(ys[i])]

    out = despill(rgb, key, alpha)
    rgba = np.dstack([out, alpha * 255]).clip(0, 255).astype(np.uint8)
    result = Image.fromarray(rgba, 'RGBA')
    result.save(dst, optimize=True)
    if 'preview' in opt:
        # xem trước trên nền giấy, vòng đỏ ở đầu ngòi bút
        from PIL import ImageDraw
        paper = Image.new('RGBA', result.size, (247, 240, 225, 255))
        paper.alpha_composite(result)
        x, y = tip
        ImageDraw.Draw(paper).ellipse([x - 9, y - 9, x + 9, y + 9], outline=(230, 30, 30, 255), width=4)
        paper.convert('RGB').save(opt['preview'])
    print(json.dumps({'width': w, 'height': h, 'tip': tip, 'armSide': arm, 'key': [round(float(c)) for c in key]}))


if __name__ == '__main__':
    main()
