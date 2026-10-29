"""Bản đồ cho video: tìm toạ độ địa danh, lấy đường đi, ghép ảnh bản đồ OpenStreetMap.

Dùng: maptool.py <spec.json> <ảnh ra.png> <dữ liệu ra.json>
spec: {"stops": ["Hà Nội", "Ninh Bình", …] | [{"name", "lat", "lon"}], "mode": "drive|line|flight",
       "width": 1920, "height": 1080, "cache": "<thư mục>", "maxTiles": 120}

Nguồn (miễn phí, dữ liệu OpenStreetMap; ghi nguồn trên hình):
- toạ độ: Photon (photon.komoot.io), dự phòng Nominatim; ≤ 1 yêu cầu/giây, có lưu tạm
- đường bộ: OSRM (router.project-osrm.org), một yêu cầu mỗi bản đồ
- nền: ô bản đồ OpenStreetMap France (tile.openstreetmap.fr, kiểu "hot" humanitarian màu dịu hoặc "osmfr"),
  lưu tạm trên máy, mỗi bản đồ ≤ maxTiles ô. ("tiles": "osm" dùng tile.openstreetmap.org — bị chặn trên một số mạng)
"""
import io
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image

UA = 'reelmaker/0.1 (personal video tool; contact via OpenStreetMap user policy)'
TILE = 256


def get(url, accept='application/json'):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': accept, 'Accept-Language': 'vi,en'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def geocode(name, cache):
    path = os.path.join(cache, 'geocode.json')
    db = json.load(open(path)) if os.path.exists(path) else {}
    if name in db:
        return db[name]
    time.sleep(1.1)  # tối đa 1 yêu cầu/giây
    hit = None
    try:
        q = urllib.parse.urlencode({'q': name, 'limit': 1})
        feats = json.loads(get(f'https://photon.komoot.io/api/?{q}')).get('features', [])
        if feats:
            lon, lat = feats[0]['geometry']['coordinates']
            pr = feats[0]['properties']
            hit = {'lat': lat, 'lon': lon, 'full': ', '.join(x for x in (pr.get('name'), pr.get('state'), pr.get('country')) if x)}
    except Exception:
        hit = None
    if not hit:
        try:
            q = urllib.parse.urlencode({'q': name, 'format': 'json', 'limit': 1})
            res = json.loads(get(f'https://nominatim.openstreetmap.org/search?{q}'))
            if res:
                hit = {'lat': float(res[0]['lat']), 'lon': float(res[0]['lon']), 'full': res[0].get('display_name', name)}
        except Exception:
            pass
    if not hit:
        raise SystemExit(f'không tìm thấy địa điểm "{name}" (thử thêm tỉnh/nước: "Sầm Sơn, Thanh Hoá, Việt Nam")')
    db[name] = hit
    json.dump(db, open(path, 'w'), ensure_ascii=False, indent=1)
    return db[name]


def drive_route(stops):
    coords = ';'.join(f"{s['lon']},{s['lat']}" for s in stops)
    res = json.loads(get(f'https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson'))
    if res.get('code') != 'Ok':
        raise SystemExit(f"không tìm được đường bộ: {res.get('message', res.get('code'))} (thử --mode line)")
    r = res['routes'][0]
    return [(lat, lon) for lon, lat in r['geometry']['coordinates']], r['distance'] / 1000, r['duration'] / 60


def tile_url(style, z, x, y):
    if style == 'osm':
        return f'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
    sub = 'abc'[(x + y) % 3]
    return f'https://{sub}.tile.openstreetmap.fr/{style}/{z}/{x}/{y}.png'


def haversine(a, b):
    R = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def world_px(lat, lon, z):
    n = TILE * 2 ** z
    x = (lon + 180) / 360 * n
    s = math.sin(math.radians(max(min(lat, 85), -85)))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y


def simplify(pts, max_points=700):
    if len(pts) <= max_points:
        return pts
    step = len(pts) / max_points
    out = [pts[int(i * step)] for i in range(max_points)]
    out.append(pts[-1])
    return out


def main():
    spec = json.load(open(sys.argv[1]))
    out_png, out_json = sys.argv[2], sys.argv[3]
    cache = spec.get('cache') or os.path.expanduser('~/.reelmaker/maps')
    os.makedirs(cache, exist_ok=True)
    W, H = spec.get('width', 1920), spec.get('height', 1080)
    mode = spec.get('mode', 'drive')
    style = spec.get('tiles', 'hot')

    stops = []
    for s in spec['stops']:
        if isinstance(s, dict) and 'lat' in s:
            stops.append({'name': s['name'], 'lat': s['lat'], 'lon': s['lon']})
        else:
            name = s['name'] if isinstance(s, dict) else s
            label = s.get('label', name) if isinstance(s, dict) else name.split(',')[0].strip()
            g = geocode(name, cache)
            stops.append({'name': label, 'lat': g['lat'], 'lon': g['lon']})
    if len(stops) < 2:
        raise SystemExit('cần ít nhất 2 địa điểm')

    duration = None
    if mode == 'drive':
        path, km, duration = drive_route(stops)
    else:
        path = [(s['lat'], s['lon']) for s in stops]
        km = sum(haversine(path[i], path[i + 1]) for i in range(len(path) - 1))

    lats = [p[0] for p in path]
    lons = [p[1] for p in path]
    # chọn mức phóng: lớn nhất mà số ô bản đồ vẫn ≤ maxTiles (ảnh đủ nét khi máy quay phóng gần)
    max_tiles = spec.get('maxTiles', 120)
    best = None
    for z in range(3, 17):
        x0, y0 = world_px(max(lats), min(lons), z)
        x1, y1 = world_px(min(lats), max(lons), z)
        bw, bh = x1 - x0, y1 - y0
        # khung ảnh: vừa tỉ lệ khung hình, chừa lề 35% để máy quay lùi ra / lia
        span_w = max(bw, bh * W / H) * 1.6 + 400
        span_h = span_w * H / W
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        ax0, ay0 = cx - span_w / 2, cy - span_h / 2
        tiles = (math.floor((ax0 + span_w) / TILE) - math.floor(ax0 / TILE) + 1) * (math.floor((ay0 + span_h) / TILE) - math.floor(ay0 / TILE) + 1)
        if tiles <= max_tiles:
            best = (z, ax0, ay0, span_w, span_h)
        elif best:
            break
    z, ax0, ay0, span_w, span_h = best

    tx0, ty0 = math.floor(ax0 / TILE), math.floor(ay0 / TILE)
    tx1, ty1 = math.floor((ax0 + span_w) / TILE), math.floor((ay0 + span_h) / TILE)
    canvas = Image.new('RGB', ((tx1 - tx0 + 1) * TILE, (ty1 - ty0 + 1) * TILE), (230, 230, 225))
    fetched = 0
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            n = 2 ** z
            if ty < 0 or ty >= n:
                continue
            f = os.path.join(cache, 'tiles', style, str(z), str(tx % n), f'{ty}.png')
            if not os.path.exists(f):
                os.makedirs(os.path.dirname(f), exist_ok=True)
                data = get(tile_url(style, z, tx % n, ty), 'image/png')
                open(f, 'wb').write(data)
                fetched += 1
                time.sleep(0.05)
            canvas.paste(Image.open(f).convert('RGB'), ((tx - tx0) * TILE, (ty - ty0) * TILE))
    ox, oy = ax0 - tx0 * TILE, ay0 - ty0 * TILE
    img = canvas.crop((round(ox), round(oy), round(ox + span_w), round(oy + span_h)))
    img.save(out_png, optimize=True)

    def px(lat, lon):
        x, y = world_px(lat, lon, z)
        return [round(x - ax0, 1), round(y - ay0, 1)]

    route = [px(lat, lon) for lat, lon in simplify(path)]
    json.dump({
        'width': img.width, 'height': img.height, 'zoom': z, 'mode': mode, 'tilesFetched': fetched,
        'stops': [{'name': s['name'], 'xy': px(s['lat'], s['lon'])} for s in stops],
        'route': route, 'km': round(km), 'minutes': round(duration) if duration else None,
        'attribution': '© OpenStreetMap contributors' + ('' if style == 'osm' else ' · OSM France'),
    }, open(out_json, 'w'), ensure_ascii=False)
    print(json.dumps({'zoom': z, 'size': [img.width, img.height], 'km': round(km), 'tilesFetched': fetched}))


if __name__ == '__main__':
    main()
