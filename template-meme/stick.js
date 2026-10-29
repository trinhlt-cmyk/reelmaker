// stick.js — nhân vật người que vẽ bằng SVG, cử động theo thời gian của reelmaker.
//
//   const a = Stick.create('#stage', { x: 380, y: 860, size: 1.3 });   // x, y = điểm giữa hai bàn chân
//   a.pose([[0, 'stand'], [1.2, 'wave'], [2.4, 'shrug', 0.25], [6.5, 'stand']]); // [giây, tư thế, giây chuyển (0.3)]
//   a.face([[0, 'neutral'], [2.4, 'shock']]);                                 // nét mặt đổi ngay tại giây đó
//   a.say('Ủa?', 2.5, 4.0);                                                     // bong bóng thoại từ 2.5 đến 4.0s
//   a.move([[0, 380], [3, 600, 1.2]]);                                          // đi ngang tới x=600 trong 1.2s
//
// Tư thế có sẵn: stand, wave, cheer, shrug, facepalm, point, think, shock, jump, type, run1, run2, sad, dance1,
// dance2. Hoặc một đối tượng: { armL:[vai, khuỷu], armR, legL:[hông, gối], legR, lean, head, y, crouch, look }
// (góc theo độ, 0 = chỉ thẳng xuống, + về phía phải màn hình; khuỷu/gối là góc gập thêm so với đoạn trên).
// Nét mặt: neutral, happy, shock, sad, smug, angry, sleepy.
// Muốn video lặp liền mạch: tư thế, nét mặt và vị trí ở cuối giống hệt lúc đầu.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const POSES = {
    stand: { armL: [-14, 4], armR: [14, -4], legL: [-7, 0], legR: [7, 0] },
    wave: { armL: [-14, 4], armR: [145, 35], legL: [-7, 0], legR: [7, 0], head: 6 },
    cheer: { armL: [-150, -15], armR: [150, 15], legL: [-14, 0], legR: [14, 0], y: -18 },
    shrug: { armL: [-55, -100], armR: [55, 100], legL: [-7, 0], legR: [7, 0], head: 12, crouch: 4 },
    facepalm: { armL: [-12, 4], armR: [104, 128], legL: [-7, 0], legR: [7, 0], head: -14, lean: -4, crouch: 6 },
    point: { armL: [-14, 4], armR: [92, 0], legL: [-9, 0], legR: [9, 0], lean: 4, look: 1 },
    think: { armL: [20, -110], armR: [35, -160], legL: [-7, 0], legR: [7, 0], head: 14, look: -0.5 },
    shock: { armL: [-135, -30], armR: [135, 30], legL: [-16, 0], legR: [16, 0], y: -26, lean: -4 },
    jump: { armL: [-160, 0], armR: [160, 0], legL: [-35, 70], legR: [35, -70], y: -80 },
    type: { armL: [55, 45], armR: [70, 35], legL: [40, -95], legR: [55, -95], lean: 8, crouch: 34, look: 1, head: 8 },
    run1: { armL: [40, 60], armR: [-45, 60], legL: [35, -30], legR: [-40, 80], lean: 10, look: 1 },
    run2: { armL: [-45, 60], armR: [40, 60], legL: [-40, 80], legR: [35, -30], lean: 10, look: 1 },
    sad: { armL: [-6, 0], armR: [6, 0], legL: [-5, 0], legR: [5, 0], lean: 0, head: 25, crouch: 6 },
    dance1: { armL: [-120, -40], armR: [40, 90], legL: [-20, 0], legR: [25, -40], lean: -8, y: -6 },
    dance2: { armL: [-40, -90], armR: [120, 40], legL: [-25, 40], legR: [20, 0], lean: 8, y: -6 },
  };
  const BASE = { armL: [-14, 4], armR: [14, -4], legL: [-7, 0], legR: [7, 0], lean: 0, head: 0, y: 0, crouch: 0, look: 0 };
  const ease = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
  const rad = (d) => (d * Math.PI) / 180;
  const along = (p, deg, len) => ({ x: p.x + Math.sin(rad(deg)) * len, y: p.y + Math.cos(rad(deg)) * len });
  const full = (p) => ({ ...BASE, ...(typeof p === 'string' ? POSES[p] : p) });
  const mix = (a, b, k) => {
    const out = {};
    for (const key of Object.keys(BASE)) {
      out[key] = Array.isArray(a[key]) ? a[key].map((v, i) => v + (b[key][i] - v) * k) : a[key] + (b[key] - a[key]) * k;
    }
    return out;
  };

  // giá trị tại t của danh sách khoá [[giây, giá trị, giây chuyển]]
  function track(keys, t, blendDefault, mixFn) {
    let cur = keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [at, val, dur = blendDefault] = keys[i];
      if (t < at) break;
      const k = dur > 0 ? Math.min(1, (t - at) / dur) : 1;
      cur = k >= 1 ? val : mixFn(cur, val, ease(k));
    }
    return cur;
  }

  function create(target, { x = 540, y = 860, size = 1, color = '#16161a', width = 10 } = {}) {
    const svg = typeof target === 'string' ? document.querySelector(target) : target;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'stick');
    const mk = (tag, attrs) => {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      g.appendChild(el);
      return el;
    };
    const line = { fill: 'none', stroke: color, 'stroke-width': width * size, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    const parts = {
      legL: mk('polyline', line), legR: mk('polyline', line), body: mk('line', line),
      armL: mk('polyline', line), armR: mk('polyline', line),
      head: mk('circle', { ...line, fill: '#fff', r: 26 * size }),
      eyeL: mk('ellipse', { fill: color }), eyeR: mk('ellipse', { fill: color }),
      mouth: mk('path', { ...line, 'stroke-width': width * 0.7 * size, fill: 'none' }),
      brows: mk('path', { ...line, 'stroke-width': width * 0.55 * size }),
    };
    svg.appendChild(g);

    const state = { poses: [[0, 'stand']], faces: [[0, 'neutral']], moves: [[0, x]], bubbles: [] };
    const api = {
      el: g,
      pose(keys) { state.poses = keys; return api; },
      face(keys) { state.faces = keys; return api; },
      move(keys) { state.moves = keys; return api; },
      say(text, from, to, { side = 'right' } = {}) {
        const b = document.createElementNS(NS, 'g');
        b.setAttribute('class', 'bubble');
        b.dataset.sfx = 'pop';
        b.dataset.sfxAt = String(from);
        const rect = document.createElementNS(NS, 'path');
        const label = document.createElementNS(NS, 'text');
        label.textContent = text;
        label.setAttribute('class', 'bubble-text');
        b.append(rect, label);
        svg.appendChild(b);
        const box = label.getBBox();
        const w = box.width + 56;
        const h = box.height + 36;
        const r = 26;
        // khung bo tròn + đuôi chỉ về phía đầu nhân vật (gốc toạ độ = mũi đuôi)
        const tail = side === 'right' ? 1 : -1;
        const left = tail > 0 ? 10 : -w - 10;
        rect.setAttribute('d', `M${left + r} ${-h - 40} h${w - 2 * r} a${r} ${r} 0 0 1 ${r} ${r} v${h - 2 * r} a${r} ${r} 0 0 1 ${-r} ${r}
          H${tail > 0 ? left + 70 : left + w - 40} L0 0 L${tail > 0 ? left + 40 : left + w - 70} -40 H${left + r} a${r} ${r} 0 0 1 ${-r} ${-r}
          v${-(h - 2 * r)} a${r} ${r} 0 0 1 ${r} ${-r} Z`);
        label.setAttribute('x', left + w / 2);
        label.setAttribute('y', -40 - h / 2);
        state.bubbles.push({ b, from, to, tail });
        return api;
      },
    };

    function draw(t) {
      const p = track(state.poses.map(([a, v, d]) => [a, full(v), d]), t, 0.3, mix);
      const face = track(state.faces, t, 0, (a, b) => b);
      const fx = track(state.moves, t, 0.6, (a, b, k) => a + (b - a) * k);
      const s = size;
      const foot = { x: fx, y: y + p.y * s };
      const hip = { x: fx, y: foot.y - (86 - p.crouch) * s };
      const neck = along(hip, 180 + p.lean, 72 * s);
      const shoulder = along(hip, 180 + p.lean, 62 * s);
      const headC = along(neck, 180 + p.lean + p.head, 28 * s);
      const limb = (from, [a1, a2], l1, l2) => {
        const mid = along(from, a1, l1 * s);
        const end = along(mid, a1 + a2, l2 * s);
        return `${from.x},${from.y} ${mid.x},${mid.y} ${end.x},${end.y}`;
      };
      parts.body.setAttribute('x1', hip.x); parts.body.setAttribute('y1', hip.y);
      parts.body.setAttribute('x2', neck.x); parts.body.setAttribute('y2', neck.y);
      parts.armL.setAttribute('points', limb(shoulder, p.armL, 40, 38));
      parts.armR.setAttribute('points', limb(shoulder, p.armR, 40, 38));
      parts.legL.setAttribute('points', limb(hip, p.legL, 44, 42));
      parts.legR.setAttribute('points', limb(hip, p.legR, 44, 42));
      parts.head.setAttribute('cx', headC.x); parts.head.setAttribute('cy', headC.y);

      // mặt: lệch theo hướng nhìn
      const fxo = headC.x + p.look * 9 * s;
      const ey = headC.y - 4 * s;
      const open = face === 'shock' ? 1.6 : face === 'sleepy' ? 0.25 : 1;
      for (const [eye, dx] of [[parts.eyeL, -9], [parts.eyeR, 9]]) {
        eye.setAttribute('cx', fxo + dx * s); eye.setAttribute('cy', ey);
        eye.setAttribute('rx', 3.6 * s * (face === 'shock' ? 1.3 : 1)); eye.setAttribute('ry', 4.2 * s * open);
      }
      const my = headC.y + 11 * s;
      const mouths = {
        neutral: `M${fxo - 8 * s} ${my} L${fxo + 8 * s} ${my}`,
        happy: `M${fxo - 10 * s} ${my - 3 * s} Q${fxo} ${my + 9 * s} ${fxo + 10 * s} ${my - 3 * s}`,
        smug: `M${fxo - 9 * s} ${my} Q${fxo + 4 * s} ${my + 5 * s} ${fxo + 11 * s} ${my - 5 * s}`,
        sad: `M${fxo - 9 * s} ${my + 4 * s} Q${fxo} ${my - 5 * s} ${fxo + 9 * s} ${my + 4 * s}`,
        angry: `M${fxo - 9 * s} ${my + 3 * s} Q${fxo} ${my - 3 * s} ${fxo + 9 * s} ${my + 3 * s}`,
        sleepy: `M${fxo - 6 * s} ${my} L${fxo + 6 * s} ${my}`,
        shock: `M${fxo} ${my - 5 * s} a${5 * s} ${7 * s} 0 1 0 0.1 0 Z`,
      };
      parts.mouth.setAttribute('d', mouths[face] ?? mouths.neutral);
      const by = ey - 9 * s;
      const brows = {
        angry: `M${fxo - 14 * s} ${by - 3 * s} L${fxo - 4 * s} ${by + 2 * s} M${fxo + 14 * s} ${by - 3 * s} L${fxo + 4 * s} ${by + 2 * s}`,
        sad: `M${fxo - 14 * s} ${by + 2 * s} L${fxo - 4 * s} ${by - 3 * s} M${fxo + 14 * s} ${by + 2 * s} L${fxo + 4 * s} ${by - 3 * s}`,
        shock: `M${fxo - 14 * s} ${by - 6 * s} L${fxo - 4 * s} ${by - 8 * s} M${fxo + 14 * s} ${by - 6 * s} L${fxo + 4 * s} ${by - 8 * s}`,
        smug: `M${fxo - 14 * s} ${by} L${fxo - 4 * s} ${by} M${fxo + 14 * s} ${by - 5 * s} L${fxo + 4 * s} ${by - 2 * s}`,
      };
      parts.brows.setAttribute('d', brows[face] ?? '');

      for (const { b, from, to, tail } of state.bubbles) {
        const on = t >= from && t < to;
        const k = on ? Math.min(1, (t - from) / 0.18) : 0;
        b.style.opacity = on ? '1' : '0';
        const tip = { x: headC.x + tail * 30 * s, y: headC.y - 30 * s };
        b.setAttribute('transform', `translate(${tip.x} ${tip.y}) scale(${0.6 + 0.4 * ease(k)})`);
      }
    }
    reel.on(draw);
    return api;
  }

  window.Stick = { create, POSES };
})();
