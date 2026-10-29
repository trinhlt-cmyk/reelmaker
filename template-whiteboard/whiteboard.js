// whiteboard.js — bàn tay vẽ tranh nét SVG theo thời gian của reelmaker.
//
// Trong cảnh:
//   <svg class="wb" viewBox="0 0 1920 1080">
//     <g data-draw="0.4-3.2"> …path, line, circle, rect, polyline, polygon, ellipse, text… </g>  vẽ lần lượt từ 0.4s đến 3.2s
//     <g data-fill="3.4"> …hình tô màu… </g>                                                      hiện màu từ 3.4s (0.6s)
//   </svg>
//   <script src="../whiteboard.js"></script>   (đặt cuối <body>)
//
// - Các nét trong một nhóm data-draw được vẽ theo thứ tự trong file, thời gian chia theo độ dài nét.
// - Hình có màu tô (fill) trong nhóm vẽ: vẽ viền trước, màu hiện sau khi viền xong.
// - <text> được "viết" từ trái sang phải.
// - data-draw="1.2" (một số) = bắt đầu ở 1.2s, tốc độ mặc định (data-speed px/giây, mặc định 900).
// - data-fill="3.4-1.0" = hiện màu từ 3.4s trong 1.0s.
// - Tay tự đi theo ngòi bút, nhấc bút giữa hai nét, rút ra ngoài khung khi nghỉ lâu.
// - Mỗi nét dài có tiếng bút sột soạt (tắt: data-sfx="none" trên nhóm).
(() => {
  const script = document.currentScript;
  // ảnh bàn tay (PNG nền trong suốt): cỡ gốc, đầu ngòi bút (px trong ảnh), mép cánh tay đi ra; reelmaker hand ghi dòng này
  const HAND_CFG = { src: '../assets/hand.png', width: 1024, height: 559, tip: [251, 484], armSide: 'right', rotate: 45 }; // reelmaker hand
  const SCALE = Number(script?.dataset.handScale ?? 0.85) * (window.innerHeight / 1080);
  const HAND_W = HAND_CFG.width * SCALE;
  const HAND_H = HAND_CFG.height * SCALE;
  const TIP = { x: HAND_CFG.tip[0] * SCALE, y: HAND_CFG.tip[1] * SCALE };
  // xoay bàn tay quanh đầu ngòi (độ, chiều kim đồng hồ); data-hand-rotate trên thẻ script để đổi
  const ROT = (Number(script?.dataset.handRotate ?? HAND_CFG.rotate ?? 0) * Math.PI) / 180;
  const LIFT = 0.09; // giây nhấc bút giữa hai nét
  const SPEED = 900; // px (khung 1920) mỗi giây khi không ghi thời điểm kết thúc
  const W = window.innerWidth;
  const H = window.innerHeight;
  // khung ảnh tay sau khi xoay, tính từ đầu ngòi
  const box = [[-TIP.x, -TIP.y], [HAND_W - TIP.x, -TIP.y], [-TIP.x, HAND_H - TIP.y], [HAND_W - TIP.x, HAND_H - TIP.y]]
    .map(([x, y]) => [x * Math.cos(ROT) - y * Math.sin(ROT), x * Math.sin(ROT) + y * Math.cos(ROT)]);
  const minX = Math.min(...box.map((p) => p[0]));
  const maxX = Math.max(...box.map((p) => p[0]));
  const minY = Math.min(...box.map((p) => p[1]));
  const maxY = Math.max(...box.map((p) => p[1]));
  // chỗ đầu ngòi khi tay nghỉ: cả bàn tay nằm ngoài khung, về phía cánh tay đi ra
  const REST = {
    right: { x: W - minX + 20, y: H * 0.6 },
    left: { x: -maxX - 20, y: H * 0.6 },
    bottom: { x: W * 0.6, y: H - minY + 20 },
    top: { x: W * 0.6, y: -maxY - 20 },
  }[HAND_CFG.armSide];

  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const SHAPES = 'path, line, polyline, polygon, circle, ellipse, rect, text';

  // ---- dựng danh sách nét
  const strokes = [];
  const toScreen = (el, x, y) => {
    const m = el.getScreenCTM();
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
  };
  const scaleOf = (el) => Math.hypot(el.getScreenCTM().a, el.getScreenCTM().b);

  let maskId = 0;
  const svgEl = (svg, tag) => document.createElementNS(svg.namespaceURI, tag);
  const defsOf = (svg) => svg.querySelector('defs') ?? svg.insertBefore(svgEl(svg, 'defs'), svg.firstChild);

  // Nhóm data-reveal: các vùng mực đặc (tranh nét từ ảnh, qua reelmaker lineart). Không vẽ viền được, nên dùng
  // mặt nạ: một nét bút to chạy dọc từng đường "mở" vùng mực ra dần, chạy xong thì lấp đầy cả vùng.
  function addRevealGroup(group, from, to, silent) {
    const svg = group.ownerSVGElement;
    const paths = [...group.querySelectorAll('path')];
    if (!paths.length) return;
    const scale = scaleOf(paths[0]);
    const width = Number(group.dataset.revealWidth ?? 18) / scale; // px trên màn hình → đơn vị trong nhóm
    const mask = svgEl(svg, 'mask');
    mask.id = `wb-mask-${maskId++}`;
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    for (const [k, v] of [['x', -1e4], ['y', -1e4], ['width', 3e4], ['height', 3e4]]) mask.setAttribute(k, v);
    const copy = group.cloneNode(true);
    for (const a of ['data-draw', 'data-reveal', 'data-reveal-width', 'data-sfx', 'id']) copy.removeAttribute(a);
    mask.appendChild(copy);
    defsOf(svg).appendChild(mask);
    // bọc nhóm trong một lớp không biến đổi toạ độ để mặt nạ dùng cùng hệ toạ độ với bản sao
    const wrap = svgEl(svg, 'g');
    group.parentNode.insertBefore(wrap, group);
    wrap.appendChild(group);
    wrap.setAttribute('mask', `url(#${mask.id})`);

    const masks = [...copy.querySelectorAll('path')];
    const measured = paths.map((el, i) => {
      const len = el.getTotalLength();
      const m = masks[i];
      Object.assign(m.style, {
        fill: '#fff', fillOpacity: '0', stroke: '#fff', strokeWidth: String(width),
        strokeLinecap: 'round', strokeLinejoin: 'round', strokeDasharray: `${len} ${len}`, strokeDashoffset: String(len),
      });
      return { el, maskEl: m, kind: 'reveal', len: len * scale, path: len };
    });
    const total = measured.reduce((s, m) => s + m.len, 0) || 1;
    const lift = Math.min(LIFT, (0.15 * (to - from)) / measured.length);
    const span = Math.max(0.1, to - from - lift * (measured.length - 1));
    let t = from;
    for (const m of measured) {
      const d = (m.len / total) * span;
      strokes.push({ ...m, start: t, end: t + d, silent: true });
      t += d + lift;
    }
    // tiếng bút cho cả nhóm (từng đường thường quá ngắn để có tiếng riêng)
    if (!silent) {
      for (let at = from; at < to - 0.2; at += 0.9) {
        const cue = document.createElement('i');
        cue.hidden = true;
        cue.dataset.sfx = 'scribble';
        cue.dataset.sfxAt = at.toFixed(3);
        document.body.appendChild(cue);
      }
    }
  }

  for (const group of document.querySelectorAll('[data-draw]')) {
    const [from, to] = group.dataset.draw.split('-').map(Number);
    const speed = Number(group.dataset.speed ?? SPEED) * (W / 1920);
    const silent = group.dataset.sfx === 'none';
    if (group.hasAttribute('data-reveal')) {
      addRevealGroup(group, from, Number.isFinite(to) ? to : from + 4, silent);
      continue;
    }
    const items = [...group.querySelectorAll(SHAPES)].filter((el) => !el.closest('[data-fill]') && !el.closest('defs, clipPath, mask'));
    const measured = items.map((el) => {
      if (el.tagName === 'text') {
        const b = el.getBBox();
        return { el, kind: 'text', len: b.width * scaleOf(el) * 1.15, box: b };
      }
      return { el, kind: 'shape', len: el.getTotalLength() * scaleOf(el), path: el.getTotalLength() };
    });
    const total = measured.reduce((s, m) => s + m.len, 0) || 1;
    const lifts = LIFT * Math.max(0, measured.length - 1);
    const span = Number.isFinite(to) ? Math.max(0.1, to - from - lifts) : total / speed;
    let t = from;
    for (const m of measured) {
      const d = (m.len / total) * span;
      strokes.push({ ...m, start: t, end: t + d, silent });
      t += d + LIFT;
    }
  }
  strokes.sort((a, b) => a.start - b.start);

  // ---- trạng thái ban đầu: nét ẩn, chữ bị che, màu tô ẩn
  let clipId = 0;
  for (const s of strokes) {
    if (s.kind === 'reveal') continue; // đã dựng trong addRevealGroup
    const el = s.el;
    const fill = getComputedStyle(el).fill;
    s.fillOpacity = fill && fill !== 'none' && s.kind === 'shape' ? Number(getComputedStyle(el).fillOpacity || 1) : 0;
    if (s.kind === 'shape') {
      el.style.strokeDasharray = `${s.path} ${s.path}`;
      el.style.strokeDashoffset = String(s.path);
      if (s.fillOpacity) el.style.fillOpacity = '0';
    } else {
      // chữ: che bằng hình chữ nhật mở dần từ trái sang phải
      const svg = el.ownerSVGElement;
      let defs = svg.querySelector('defs');
      if (!defs) defs = svg.insertBefore(document.createElementNS(svg.namespaceURI, 'defs'), svg.firstChild);
      const clip = document.createElementNS(svg.namespaceURI, 'clipPath');
      clip.id = `wb-clip-${clipId++}`;
      clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
      const rect = document.createElementNS(svg.namespaceURI, 'rect');
      const pad = s.box.height;
      rect.setAttribute('x', s.box.x - pad);
      rect.setAttribute('y', s.box.y - pad);
      rect.setAttribute('height', s.box.height + 2 * pad);
      rect.setAttribute('width', 0);
      clip.appendChild(rect);
      defs.appendChild(clip);
      el.setAttribute('clip-path', `url(#${clip.id})`);
      s.clipRect = rect;
    }
  }
  const fills = [...document.querySelectorAll('[data-fill]')].map((el) => {
    const [at, dur = 0.6] = el.dataset.fill.split('-').map(Number);
    el.style.opacity = '0';
    return { el, at, dur };
  });

  // ---- tiếng bút: một tiếng mỗi ~1 giây vẽ của các nét dài
  for (const s of strokes) {
    if (s.silent || s.end - s.start < 0.25) continue;
    for (let t = s.start; t < s.end - 0.15; t += 1.0) {
      const cue = document.createElement('i');
      cue.hidden = true;
      cue.dataset.sfx = 'scribble';
      cue.dataset.sfxAt = t.toFixed(3);
      document.body.appendChild(cue);
    }
  }

  // ---- bàn tay
  const hand = document.createElement('img');
  hand.dataset.reelOverlay = ''; // lớp phủ: reelmaker check bỏ qua khi đo nền dưới chữ
  hand.src = script?.dataset.hand ?? HAND_CFG.src;
  Object.assign(hand.style, {
    position: 'fixed', left: '0', top: '0', width: `${HAND_W}px`, height: `${HAND_H}px`, transformOrigin: `${TIP.x}px ${TIP.y}px`,
    pointerEvents: 'none', zIndex: '2147483000', willChange: 'transform', filter: 'drop-shadow(10px 14px 10px rgba(0,0,0,.18))',
  });
  document.body.appendChild(hand);

  const penAt = (s, p) => {
    if (s.kind === 'text') {
      const b = s.box;
      const x = b.x + b.width * p;
      const wiggle = Math.sin(p * b.width * 0.12) * b.height * 0.18;
      return toScreen(s.el, x, b.y + b.height * 0.7 + wiggle);
    }
    const pt = s.el.getPointAtLength(s.path * p);
    return toScreen(s.el, pt.x, pt.y);
  };

  function handPosition(t) {
    if (!strokes.length) return REST;
    const i = strokes.findIndex((s) => t < s.end);
    if (i === -1) {
      // vẽ xong hết: rút tay ra
      const last = strokes.at(-1);
      return mix(penAt(last, 1), REST, ease(clamp01((t - last.end) / 0.6)));
    }
    const s = strokes[i];
    if (t >= s.start) return penAt(s, clamp01((t - s.start) / (s.end - s.start)));
    // chưa tới nét s: đang nhấc bút từ nét trước, hoặc đang đưa tay vào
    const prev = strokes[i - 1];
    const target = penAt(s, 0);
    if (!prev) return mix(REST, target, ease(clamp01(1 - (s.start - t) / 0.5)));
    const gap = s.start - prev.end;
    if (gap <= 0.8) return mix(penAt(prev, 1), target, ease(clamp01((t - prev.end) / gap)));
    // nghỉ lâu giữa hai nhóm: rút ra rồi đưa vào lại
    const away = mix(penAt(prev, 1), REST, ease(clamp01((t - prev.end) / 0.5)));
    return mix(away, target, ease(clamp01(1 - (s.start - t) / 0.5)));
  }
  const mix = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

  // ---- mỗi khung hình
  reel.on((t) => {
    for (const s of strokes) {
      const p = clamp01((t - s.start) / (s.end - s.start));
      if (s.kind === 'shape') {
        s.el.style.strokeDashoffset = String(s.path * (1 - p));
        if (s.fillOpacity) s.el.style.fillOpacity = String(s.fillOpacity * clamp01((t - s.end) / 0.35));
      } else if (s.kind === 'reveal') {
        s.maskEl.style.strokeDashoffset = String(s.path * (1 - p));
        s.maskEl.style.fillOpacity = String(clamp01((t - s.end) / 0.25)); // vùng mực lớn: lấp đầy sau khi nét chạy qua
      } else {
        s.clipRect.setAttribute('width', (s.box.width + 2 * s.box.height) * p + (p > 0 ? s.box.height : 0));
        // chưa viết thì ẩn hẳn (để reelmaker check không coi là chữ đang hiện)
        s.el.style.visibility = p > 0 ? 'visible' : 'hidden';
      }
    }
    for (const f of fills) f.el.style.opacity = String(ease(clamp01((t - f.at) / f.dur)));
    const pos = handPosition(t);
    hand.style.transform = `translate(${pos.x - TIP.x}px, ${pos.y - TIP.y}px) rotate(${ROT}rad)`;
  });
})();
