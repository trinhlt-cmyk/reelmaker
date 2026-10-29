// map.js — bản đồ lộ trình chuyển động theo thời gian của reelmaker (dùng với `reelmaker map`).
//
//   ReelMap.create({ data: MAP, img: '../assets/map/01.png', from: 0.6, to: 6.2,
//                    vehicle: 'car' | 'plane' | 'none', follow: 2.0, chip: 'Hà Nội → Sầm Sơn · 208 km' });
//
// - Máy quay: bắt đầu gần điểm xuất phát, bám theo đầu đường đang vẽ, hết đường thì lùi ra toàn cảnh.
// - Đường đi vẽ dần từ `from` tới `to` (giây); mỗi điểm dừng bật ghim + tên khi đường tới (có tiếng pop).
// - mode "flight": các chặng là đường cong (máy bay), "line": đường thẳng, "drive": đường bộ thật.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const W = window.innerWidth;
  const H = window.innerHeight;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smooth = (x) => x * x * (3 - 2 * x);
  const ease = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

  function create({ data, img, from = 0.5, to = 5, vehicle = 'car', follow = 2.0, chip = '', outro = 1.1 }) {
    // đường đi (toạ độ ảnh)
    let d;
    if (data.mode === 'flight') {
      const s = data.stops.map((p) => p.xy);
      d = `M${s[0][0]} ${s[0][1]}`;
      for (let i = 1; i < s.length; i++) {
        const [x0, y0] = s[i - 1];
        const [x1, y1] = s[i];
        const len = Math.hypot(x1 - x0, y1 - y0);
        // đỉnh cung lệch vuông góc 22% chiều dài, về phía trên
        let nx = -(y1 - y0) / len;
        let ny = (x1 - x0) / len;
        if (ny > 0) [nx, ny] = [-nx, -ny];
        d += ` Q${(x0 + x1) / 2 + nx * len * 0.22} ${(y0 + y1) / 2 + ny * len * 0.22} ${x1} ${y1}`;
      }
    } else {
      d = data.route.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
    }

    const cam = document.createElement('div');
    cam.className = 'map-cam';
    Object.assign(cam.style, { width: `${data.width}px`, height: `${data.height}px` });
    cam.innerHTML = `<img class="map-img" src="${img}" width="${data.width}" height="${data.height}">
      <svg class="map-svg" viewBox="0 0 ${data.width} ${data.height}" width="${data.width}" height="${data.height}">
        <path class="route-bg" d="${d}"/><path class="route" d="${d}"/></svg>`;
    document.body.prepend(cam);
    const routeBg = cam.querySelector('.route-bg');
    const route = cam.querySelector('.route');
    const L = route.getTotalLength();

    // vị trí điểm dừng dọc theo đường (0..1)
    const samples = Array.from({ length: 400 }, (_, i) => {
      const pt = route.getPointAtLength((L * i) / 399);
      return { f: i / 399, x: pt.x, y: pt.y };
    });
    const fracOf = ([x, y]) => samples.reduce((b, s) => ((s.x - x) ** 2 + (s.y - y) ** 2 < (b.x - x) ** 2 + (b.y - y) ** 2 ? s : b)).f;
    // tiến độ đường theo thời gian (chậm lúc đầu và cuối)
    const progress = (t) => smooth(clamp01((t - from) / (to - from)));
    const timeOf = (f) => { // ngược của progress: lúc đường tới phần f
      let lo = from;
      let hi = to;
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (progress(m) < f) lo = m; else hi = m; }
      return hi;
    };

    const pins = data.stops.map((s, i) => {
      const f = i === 0 ? 0 : i === data.stops.length - 1 ? 1 : fracOf(s.xy);
      const el = document.createElement('div');
      el.className = `map-pin${i === 0 ? ' start' : i === data.stops.length - 1 ? ' end' : ''}`;
      el.innerHTML = `<i></i><span>${s.name}</span>`;
      const at = i === 0 ? Math.max(0.15, from - 0.35) : timeOf(f);
      el.dataset.sfx = 'pop';
      el.dataset.sfxAt = at.toFixed(3);
      document.body.appendChild(el);
      return { el, xy: s.xy, at };
    });

    const car = document.createElement('div');
    car.className = `map-vehicle ${vehicle}`;
    car.textContent = { car: '🚗', plane: '✈️', none: '' }[vehicle] ?? '';
    if (vehicle !== 'none') document.body.appendChild(car);

    const chipEl = document.createElement('div');
    chipEl.className = 'map-chip';
    chipEl.textContent = chip;
    if (chip) {
      chipEl.dataset.sfx = 'chime';
      chipEl.dataset.sfxAt = (to + 0.2).toFixed(3);
      document.body.appendChild(chipEl);
    }

    // toàn cảnh: khung bao quanh đường + điểm dừng, chừa lề
    const xs = [...samples.map((s) => s.x), ...data.stops.map((s) => s.xy[0])];
    const ys = [...samples.map((s) => s.y), ...data.stops.map((s) => s.xy[1])];
    const bx0 = Math.min(...xs); const bx1 = Math.max(...xs);
    const by0 = Math.min(...ys); const by1 = Math.max(...ys);
    // toàn cảnh: chừa dải trên cho nhãn quãng đường (chip) — vùng hiển thị từ 22% tới 92% chiều cao
    const sOver = Math.min((W * 0.74) / Math.max(1, bx1 - bx0), (H * 0.6) / Math.max(1, by1 - by0));
    const over = { s: sOver, x: (bx0 + bx1) / 2, y: (by0 + by1) / 2 - (H * 0.07) / sOver };
    const sFollow = Math.min(sOver * follow, 1.6);
    const lerp = (a, b, k) => ({ s: a.s + (b.s - a.s) * k, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

    reel.on((t) => {
      const p = progress(t);
      const head = route.getPointAtLength(L * p);
      const ahead = route.getPointAtLength(Math.min(L, L * p + L * 0.04));
      // máy quay: bám đầu đường (hơi nhìn trước), hết đường thì lùi ra toàn cảnh
      const followCam = { s: sFollow, x: (head.x + ahead.x) / 2, y: (head.y + ahead.y) / 2 };
      const k = ease(clamp01((t - to) / outro));
      const camNow = lerp(followCam, over, k);
      // giữ khung hình trong ảnh bản đồ (không lộ mép xám); ảnh nhỏ hơn khung thì đặt giữa
      const fit = (pos, size, frame) => (size <= frame ? (frame - size) / 2 : Math.min(0, Math.max(frame - size, pos)));
      const tx = fit(W / 2 - camNow.x * camNow.s, data.width * camNow.s, W);
      const ty = fit(H / 2 - camNow.y * camNow.s, data.height * camNow.s, H);
      cam.style.transform = `translate(${tx}px, ${ty}px) scale(${camNow.s})`;
      const screen = ([x, y]) => [x * camNow.s + tx, y * camNow.s + ty];

      // nét đường dày đều trên màn hình dù máy quay phóng to/nhỏ
      route.style.strokeWidth = String(9 / camNow.s);
      routeBg.style.strokeWidth = String(17 / camNow.s);
      route.style.strokeDasharray = `${L} ${L}`;
      route.style.strokeDashoffset = String(L * (1 - p));
      routeBg.style.strokeDasharray = `${L} ${L}`;
      routeBg.style.strokeDashoffset = String(L * (1 - p));

      for (const pin of pins) {
        const [x, y] = screen(pin.xy);
        const k2 = clamp01((t - pin.at) / 0.3);
        // ghim (cả nhãn tên) phải nằm trọn trong khung; máy quay đi qua rồi thì ẩn
        const half = pin.el.lastChild.offsetWidth / 2 + 8;
        const inside = x - half >= 0 && x + half <= W && y - 130 >= 0 && y + 10 <= H;
        pin.el.style.transform = `translate(${x}px, ${y}px) scale(${k2 ? 0.6 + 0.4 * ease(k2) : 0})`;
        pin.el.style.opacity = k2 > 0 && inside ? '1' : '0';
        pin.el.style.visibility = inside ? 'visible' : 'hidden';
      }
      if (vehicle !== 'none') {
        const [x, y] = screen([head.x, head.y]);
        const ang = Math.atan2(ahead.y - head.y, ahead.x - head.x);
        const on = t >= from - 0.2 && t <= to + 0.4;
        car.style.opacity = on ? '1' : '0';
        // máy bay xoay theo hướng bay; xe ô tô chỉ lật trái/phải
        car.style.transform = vehicle === 'plane'
          ? `translate(${x}px, ${y}px) rotate(${ang + Math.PI / 4}rad)`
          : `translate(${x}px, ${y}px) scaleX(${Math.cos(ang) < 0 ? 1 : -1})`;
      }
      if (chip) {
        const k3 = clamp01((t - to - 0.2) / 0.35);
        chipEl.style.opacity = String(k3);
        chipEl.style.transform = `translateX(-50%) translateY(${(1 - ease(k3)) * 30}px)`;
      }
    });
  }

  window.ReelMap = { create };
})();
