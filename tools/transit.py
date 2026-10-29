"""Bản đồ tuyến metro / tàu cho video: toạ độ các ga, đoạn đi bộ tới ga đầu và từ ga cuối, ảnh nền OpenStreetMap,
km và số phút tới từng ga.

Dùng: transit.py <spec.json> <ảnh ra.jpg> <dữ liệu ra.js>
spec: {"name": "metro", "stations": ["Văn Quán", "Phùng Khoang", "Vành Đai 3@20.9932,105.8008", …],
       "city": "Hà Nội", "from": "<địa chỉ | lat,lon>", "to": "<địa điểm | lat,lon>",
       "minPerKm": 1.77, "walkKmh": 5, "maxTiles": 450, "cache": "<thư mục>"}
- tên ga tìm theo "Ga <tên>, <city>" rồi "<tên>, <city>"; "tên@lat,lon" = tự đặt toạ độ khi tìm ra sai chỗ
- đi bộ: đường chim bay × 1.25 (đường phố vòng hơn), ước tính
- dữ liệu ra: window.TRANSIT[name] = {width, height, zoom, stations: [{name, xy, km, min}], from, to,
  walkFrom, walkTo (đường gấp khúc px), walkKm, walkMin, metroKm, metroMin, totalMin, attribution}
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from maptool import geocode, haversine, world_px, get, tile_url, TILE  # noqa: E402
from PIL import Image  # noqa: E402

STREET = 1.25  # đường đi bộ thật dài hơn đường chim bay chừng này


def place(text, city, cache, station=False):
    """'tên', 'tên@lat,lon' hoặc 'lat,lon' → {'name', 'lat', 'lon'}"""
    text = text.strip()
    if '@' in text:
        name, ll = text.split('@', 1)
        lat, lon = (float(v) for v in ll.split(','))
        return {'name': name.strip(), 'lat': lat, 'lon': lon}
    parts = text.split(',')
    if len(parts) == 2 and all(p.strip().replace('.', '', 1).lstrip('-').isdigit() for p in parts):
        return {'name': '', 'lat': float(parts[0]), 'lon': float(parts[1])}
    label = text.split(',')[0].strip()
    tries = ([f'Ga {label}, {city}'] if station else []) + [f'{text}, {city}' if city and city not in text else text]
    for q in tries:
        try:
            g = geocode(q, cache)
            return {'name': label, 'lat': g['lat'], 'lon': g['lon']}
        except SystemExit:
            continue
    raise SystemExit(f'không tìm thấy "{text}": ghi rõ hơn, hoặc tự đặt toạ độ "{label}@lat,lon"')


def main():
    spec = json.load(open(sys.argv[1]))
    out_img, out_js = sys.argv[2], sys.argv[3]
    cache = spec.get('cache') or os.path.expanduser('~/.reelmaker/maps')
    city = spec.get('city', '')
    st = [place(s, city, cache, station=True) for s in spec['stations']]
    if len(st) < 2:
        raise SystemExit('cần ít nhất 2 ga')
    a = place(spec['from'], city, cache) if spec.get('from') else None
    b = place(spec['to'], city, cache) if spec.get('to') else None

    pts = [(p['lat'], p['lon']) for p in [*([a] if a else []), *st, *([b] if b else [])]]
    lats, lons = [p[0] for p in pts], [p[1] for p in pts]
    # mức phóng lớn nhất (≤ 16) mà ảnh (khung bao + lề cho máy quay lùi ra) vẫn ≤ maxTiles ô
    max_tiles = spec.get('maxTiles', 450)
    best = None
    for z in range(10, 17):
        x0, y0 = world_px(max(lats), min(lons), z)
        x1, y1 = world_px(min(lats), max(lons), z)
        pad = max(x1 - x0, y1 - y0) * 0.15 + 700 * 2 ** (z - 16)
        ax0, ay0, sw, sh = x0 - pad, y0 - pad, (x1 - x0) + 2 * pad, (y1 - y0) + 2 * pad
        n = (math.floor((ax0 + sw) / TILE) - math.floor(ax0 / TILE) + 1) * (math.floor((ay0 + sh) / TILE) - math.floor(ay0 / TILE) + 1)
        if n <= max_tiles:
            best = (z, ax0, ay0, sw, sh)
    z, ax0, ay0, sw, sh = best

    style = spec.get('tiles', 'hot')
    tx0, ty0 = math.floor(ax0 / TILE), math.floor(ay0 / TILE)
    tx1, ty1 = math.floor((ax0 + sw) / TILE), math.floor((ay0 + sh) / TILE)
    canvas = Image.new('RGB', ((tx1 - tx0 + 1) * TILE, (ty1 - ty0 + 1) * TILE), (230, 230, 225))
    fetched = 0
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            f = os.path.join(cache, 'tiles', style, str(z), str(tx), f'{ty}.png')
            if not os.path.exists(f):
                os.makedirs(os.path.dirname(f), exist_ok=True)
                open(f, 'wb').write(get(tile_url(style, z, tx, ty), 'image/png'))
                fetched += 1
            canvas.paste(Image.open(f).convert('RGB'), ((tx - tx0) * TILE, (ty - ty0) * TILE))
    ox, oy = ax0 - tx0 * TILE, ay0 - ty0 * TILE
    img = canvas.crop((round(ox), round(oy), round(ox + sw), round(oy + sh)))
    img.save(out_img, quality=88)

    def px(p):
        x, y = world_px(p['lat'], p['lon'], z)
        return [round(x - ax0, 1), round(y - ay0, 1)]

    per_km = spec.get('minPerKm', 1.77)  # metro Hà Nội: tuyến 2A ~13 km / ~23 phút
    acc, stations = 0.0, []
    for i, s in enumerate(st):
        if i:
            acc += haversine((st[i - 1]['lat'], st[i - 1]['lon']), (s['lat'], s['lon']))
        stations.append({'name': s['name'], 'xy': px(s), 'km': round(acc, 1), 'min': round(acc * per_km)})
    kmh = spec.get('walkKmh', 5)
    walk_km = [round(haversine((a['lat'], a['lon']), (st[0]['lat'], st[0]['lon'])) * STREET, 2) if a else 0,
               round(haversine((st[-1]['lat'], st[-1]['lon']), (b['lat'], b['lon'])) * STREET, 2) if b else 0]
    walk_min = [round(k / kmh * 60) for k in walk_km]
    data = {
        'width': img.width, 'height': img.height, 'zoom': z, 'stations': stations,
        'from': px(a) if a else None, 'to': px(b) if b else None,
        'fromName': a['name'] if a else None, 'toName': b['name'] if b else None,
        'walkFrom': [px(a), stations[0]['xy']] if a else None, 'walkTo': [stations[-1]['xy'], px(b)] if b else None,
        'walkKm': walk_km, 'walkMin': walk_min, 'metroKm': stations[-1]['km'], 'metroMin': stations[-1]['min'],
        'totalMin': walk_min[0] + stations[-1]['min'] + walk_min[1],
        'attribution': '© OpenStreetMap contributors',
    }
    name = spec.get('name', 'metro')
    open(out_js, 'w').write(f'(window.TRANSIT = window.TRANSIT || {{}})[{json.dumps(name)}] = ' + json.dumps(data, ensure_ascii=False) + ';\n')
    print(json.dumps({'zoom': z, 'size': [img.width, img.height], 'tilesFetched': fetched,
                      'stations': [(s['name'], s['km'], s['min']) for s in stations], 'walkKm': walk_km, 'walkMin': walk_min,
                      'metroKm': data['metroKm'], 'metroMin': data['metroMin'], 'totalMin': data['totalMin']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
