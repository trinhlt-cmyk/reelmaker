// transit.js — bản đồ tuyến metro / tàu (reelmaker map --transit): nền tối, tuyến vẽ dần qua từng ga, đoạn đi bộ
// nét chấm, chấm ga sáng lên khi tuyến tới, nhãn ga, máy quay theo mốc hoặc bám đầu tuyến.
// Dữ liệu: assets/map/<tên>.js (window.TRANSIT[tên]) + ảnh nền assets/map/<tên>.jpg.
//
//   <link rel="stylesheet" href="../lib/transit.css">  …  <script src="../assets/map/metro.js"></script>
//   <script src="../lib/transit.js"></script>
//   const m = Transit.create({
//     data: 'metro',                 // tên bản đồ (mặc định: bản đồ duy nhất đã nạp)
//     walkFrom: [0.4, 2.2],          // đoạn điểm đi → ga đầu vẽ trong 0.4–2.2s ('done' = có sẵn, bỏ trống = ẩn)
//     line: [0.5, 8],                // tuyến vẽ trong 0.5–8s (đi đều theo chiều dài), 'done' = có sẵn
//     walkTo: 'done' | [t0, t1],     // đoạn ga cuối → điểm đến
//     cam: [[0, 'from', 1.2], [2.5, 'st0', 1.0]] | { follow: 1.0 },   // mốc: giây, điểm, độ phóng
//     labels: [{ at: 1, xy: 'from', text: 'Căn hộ', sub: 'minh hoạ', side: 'left' }, { at: 'reach', xy: 'st3', text: 'Láng' }],
//     safe: { top: 360, bottom: 1150 },   // nhãn chỉ hiện khi nằm gọn trong vùng này
//   });
//   m.stationTime(i) = giây tuyến tới ga i (để hẹn giờ chữ, bảng tên ga)
//   điểm: 'from', 'to', 'st<i>' (ga thứ i, 0 = ga đầu), hoặc [x, y] (px trong ảnh bản đồ)
(() => {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const NS = 'http://www.w3.org/2000/svg';
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smooth = (x) => x * x * (3 - 2 * x);

  // đường cong mượt qua các ga (Catmull-Rom → Bézier)
  const curve = (ps) => {
    let d = `M${ps[0][0]} ${ps[0][1]}`;
    for (let i = 0; i < ps.length - 1; i++) {
      const p0 = ps[i - 1] ?? ps[i];
      const p1 = ps[i];
      const p2 = ps[i + 1];
      const p3 = ps[i + 2] ?? p2;
      d += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
    }
    return d;
  };
  const poly = (ps) => ps.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');

  function create(opt = {}) {
    const all = window.TRANSIT ?? {};
    const name = typeof opt.data === 'string' ? opt.data : Object.keys(all)[0];
    const M = typeof opt.data === 'object' ? opt.data : all[name];
    if (!M) throw new Error(`chưa nạp bản đồ "${name ?? ''}": thiếu <script src="../assets/map/<tên>.js">`);
    const pt = (p) => {
      if (Array.isArray(p)) return p;
      if (p === 'from' || p === 'to') return M[p];
      return M.stations[Number(String(p).slice(2))].xy;
    };
    const none = [[0, 0], [0, 0]];
    const cam = document.createElement('div');
    cam.className = 'm-cam';
    Object.assign(cam.style, { width: `${M.width}px`, height: `${M.height}px` });
    cam.innerHTML = `<img class="m-img" src="${opt.img ?? `../assets/map/${name}.jpg`}" width="${M.width}" height="${M.height}">
      <svg class="m-svg" viewBox="0 0 ${M.width} ${M.height}" width="${M.width}" height="${M.height}">
        <path class="m-walk w1" d="${poly(M.walkFrom ?? none)}"/><path class="m-walk w2" d="${poly(M.walkTo ?? none)}"/>
        <path class="m-line-glow" d="${curve(M.stations.map((s) => s.xy))}"/><path class="m-line" d="${curve(M.stations.map((s) => s.xy))}"/>
      </svg>`;
    document.body.prepend(cam);
    const svg = cam.querySelector('svg');
    const line = cam.querySelector('.m-line');
    const glow = cam.querySelector('.m-line-glow');
    const L = line.getTotalLength();
    const walks = [cam.querySelector('.w1'), cam.querySelector('.w2')];

    // chấm ga + vị trí mỗi ga dọc đường (để biết lúc nào tuyến tới ga)
    const samples = Array.from({ length: 600 }, (_, i) => ({ f: i / 599, p: line.getPointAtLength((L * i) / 599) }));
    const fracOf = ([x, y]) => samples.reduce((b, s) => ((s.p.x - x) ** 2 + (s.p.y - y) ** 2 < (b.p.x - x) ** 2 + (b.p.y - y) ** 2 ? s : b)).f;
    const dots = M.stations.map((s, i) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', s.xy[0]);
      c.setAttribute('cy', s.xy[1]);
      c.setAttribute('class', 'm-dot');
      svg.appendChild(c);
      return { c, f: i === 0 ? 0 : i === M.stations.length - 1 ? 1 : fracOf(s.xy) };
    });
    const ends = [M.from, M.to].filter(Boolean).map((xy) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', xy[0]);
      c.setAttribute('cy', xy[1]);
      c.setAttribute('class', 'm-end');
      svg.appendChild(c);
      return c;
    });

    const span = (v) => (v === 'done' ? [-2, -1] : v ?? [1e9, 1e9 + 1]);
    const [l0, l1] = span(opt.line);
    const progress = (t) => clamp01((t - l0) / (l1 - l0));
    // giây tuyến tới ga i (để cảnh hẹn giờ bảng tên ga, tiếng "pop")
    const stationTime = (i) => l0 + (l1 - l0) * dots[i].f;

    const labels = (opt.labels ?? []).map((l) => {
      const el = document.createElement('div');
      el.className = `m-label ${l.side ?? 'right'}`;
      el.innerHTML = `<b>${l.text}</b>${l.sub ? `<small>${l.sub}</small>` : ''}`;
      el.dataset.sfx = 'pop';
      document.body.appendChild(el);
      // at: 'reach' = đúng lúc tuyến tới ga đó (xy: 'st<i>')
      const at = l.at === 'reach' ? stationTime(Number(String(l.xy).slice(2))) : l.at;
      el.dataset.sfxAt = String(at);
      return { ...l, at, el, xy: pt(l.xy) };
    });

    const keys = Array.isArray(opt.cam) ? opt.cam.map(([t, p, z]) => ({ t, xy: pt(p), z })) : null;
    reel.on((t) => {
      const p = progress(t);
      const head = line.getPointAtLength(L * p);
      // máy quay: theo mốc, hoặc bám đầu tuyến
      let cx;
      let cy;
      let s;
      if (keys) {
        let i = keys.findIndex((k) => k.t > t);
        if (i === -1) i = keys.length;
        const a = keys[Math.max(0, i - 1)];
        const b = keys[Math.min(keys.length - 1, i)];
        const k = a === b ? 0 : smooth(clamp01((t - a.t) / (b.t - a.t)));
        cx = a.xy[0] + (b.xy[0] - a.xy[0]) * k;
        cy = a.xy[1] + (b.xy[1] - a.xy[1]) * k;
        s = Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * k);
      } else {
        ({ x: cx, y: cy } = head);
        s = opt.cam.follow;
      }
      const fit = (pos, size, frame) => (size <= frame ? (frame - size) / 2 : Math.min(0, Math.max(frame - size, pos)));
      const tx = fit(W / 2 - cx * s, M.width * s, W);
      const ty = fit(H / 2 - cy * s, M.height * s, H);
      cam.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      const screen = ([x, y]) => [x * s + tx, y * s + ty];

      // nét dày đều trên màn hình dù phóng to/nhỏ
      line.style.strokeWidth = String(9 / s);
      glow.style.strokeWidth = String(26 / s);
      for (const el of [line, glow]) {
        el.style.strokeDasharray = `${L} ${L}`;
        el.style.strokeDashoffset = String(L * (1 - p));
      }
      [opt.walkFrom, opt.walkTo].forEach((v, i) => {
        const path = i === 0 ? M.walkFrom : M.walkTo;
        if (!path) return;
        const [w0, w1] = span(v);
        const k = clamp01((t - w0) / (w1 - w0));
        // nét chấm mọc dần: vẽ lại phần đầu đường dài bằng tỉ lệ k
        walks[i].setAttribute('d', poly(cut(path, k)));
        walks[i].style.strokeWidth = String(8 / s);
        walks[i].style.strokeDasharray = `${0.1 / s} ${18 / s}`;
        walks[i].style.visibility = k > 0 ? 'visible' : 'hidden';
      });
      dots.forEach((d, i) => {
        d.c.setAttribute('r', String(9 / s));
        d.c.style.strokeWidth = String(4 / s);
        d.c.classList.toggle('on', p >= d.f - 1e-3 && (opt.line !== undefined));
        d.c.style.opacity = opt.hideDots ? '0' : '1';
      });
      ends.forEach((c) => {
        c.setAttribute('r', String(12 / s));
        c.style.strokeWidth = String(5 / s);
      });
      // nhãn chỉ hiện khi nằm gọn trong vùng an toàn (dưới tiêu đề, trên bảng ga, tránh nút của app)
      const safe = { top: 360, bottom: 1150, left: 70, right: W - 150, ...opt.safe };
      for (const l of labels) {
        const [x, y] = screen(l.xy);
        const k = clamp01((t - l.at) / 0.25);
        l.el.style.left = `${x}px`;
        l.el.style.top = `${y}px`;
        l.el.style.transform = `translate(${l.side === 'left' ? '-100%' : '0'}, -50%) scale(${0.85 + 0.15 * k})`;
        const w = l.el.offsetWidth + 26;
        const h = l.el.offsetHeight / 2;
        const x0 = l.side === 'left' ? x - w : x;
        const inside = x0 >= safe.left && x0 + w <= safe.right && y - h >= safe.top && y + h <= safe.bottom;
        l.el.style.opacity = String(k);
        l.el.style.visibility = inside ? 'visible' : 'hidden';
      }
    });
    return { stationTime };
  }

  // phần đầu của đường gấp khúc, dài bằng tỉ lệ k
  function cut(ps, k) {
    const seg = ps.slice(1).map((p, i) => Math.hypot(p[0] - ps[i][0], p[1] - ps[i][1]));
    let left = seg.reduce((a, b) => a + b, 0) * k;
    const out = [ps[0]];
    for (let i = 0; i < seg.length; i++) {
      if (left >= seg[i]) {
        out.push(ps[i + 1]);
        left -= seg[i];
      } else {
        const f = left / seg[i];
        out.push([ps[i][0] + (ps[i + 1][0] - ps[i][0]) * f, ps[i][1] + (ps[i + 1][1] - ps[i][1]) * f]);
        break;
      }
    }
    return out.length > 1 ? out : [ps[0], ps[0]];
  }

  // số liệu trong chữ: <b data-transit="totalMin"></b>, "walkMin.0", "metroKm", "stations.length", "toName"…
  // (km viết dấu phẩy như tiếng Việt: 7,7)
  for (const el of document.querySelectorAll('[data-transit]')) {
    const [name, ...keys] = el.dataset.transit.includes(':') ? el.dataset.transit.split(/[:.]/) : [null, ...el.dataset.transit.split('.')];
    const all = window.TRANSIT ?? {};
    let v = all[name ?? Object.keys(all)[0]];
    for (const k of keys) v = v?.[k];
    if (v !== undefined && v !== null) el.textContent = typeof v === 'number' ? String(v).replace('.', ',') : v;
  }

  window.Transit = { create };
})();
