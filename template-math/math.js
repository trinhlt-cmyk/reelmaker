// math.js — toán kiểu 3Blue1Brown: hình vẽ dần nét rồi tô màu, công thức "viết" ra, nhấn mạnh bằng nhịp phóng.
//
//   <svg class="scene" viewBox="0 0 1920 1080">
//     <g data-create="0.5-2.0"> …path, polygon, rect, circle, line… </g>   vẽ viền lần lượt trong 0.5–2.0s, rồi tô màu (nếu có fill)
//   </svg>
//   <div class="tex" data-tex="a^2+b^2=c^2" data-write="3-4.2" style="left:1400px; top:540px"></div>
//       công thức KaTeX (đặt tâm ở left/top), viết từ trái sang phải trong 3–4.2s
//   <div data-fade="1.2">…</div>          hiện dần + trồi lên nhẹ tại 1.2s
//   <div data-indicate="5.1">…</div>      nhấn mạnh tại 5.1s: phóng to rồi về, ánh vàng
//   <script src="../math.js"></script>   (cuối <body>, sau katex.min.js)
(() => {
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smooth = (x) => x * x * (3 - 2 * x);
  const range = (s, fallback) => {
    const [a, b] = String(s).split('-').map(Number);
    return [a, Number.isFinite(b) ? b : a + fallback];
  };

  // công thức: KaTeX vẽ sẵn, ẩn đi chờ được viết
  for (const el of document.querySelectorAll('[data-tex]')) {
    katex.render(el.dataset.tex, el, { displayMode: false, throwOnError: true, output: 'html' });
  }

  for (const g of document.querySelectorAll('[data-create]')) {
    const [start, end] = range(g.dataset.create, 1.2);
    const shapes = [...g.querySelectorAll('path, polygon, polyline, rect, circle, ellipse, line')];
    const lens = shapes.map((s) => s.getTotalLength());
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    let at = start;
    const plan = shapes.map((s, i) => {
      const d = ((end - start) * lens[i]) / total;
      const p = { s, len: lens[i], from: at, to: at + d, fill: Number(getComputedStyle(s).fillOpacity) };
      at += d;
      return p;
    });
    g.dataset.sfx ??= 'scribble';
    g.dataset.sfxAt ??= String(start);
    reel.on((t) => {
      for (const p of plan) {
        const k = smooth(clamp01((t - p.from) / (p.to - p.from || 1e-3)));
        p.s.style.strokeDasharray = `${p.len} ${p.len}`;
        p.s.style.strokeDashoffset = String(p.len * (1 - k));
        // tô màu sau khi nhóm vẽ xong viền (0.5s)
        p.s.style.fillOpacity = String(p.fill * smooth(clamp01((t - end) / 0.5)));
      }
    });
  }

  for (const el of document.querySelectorAll('[data-write]')) {
    const [start, end] = range(el.dataset.write, 1);
    reel.on((t) => {
      const p = clamp01((t - start) / (end - start)) * 115 - 8;
      el.style.webkitMaskImage = el.style.maskImage = `linear-gradient(90deg, #000 ${p}%, transparent ${p + 8}%)`;
    });
  }

  for (const el of document.querySelectorAll('[data-fade]')) {
    const at = Number(el.dataset.fade);
    const base = el.style.transform;
    reel.on((t) => {
      const k = smooth(clamp01((t - at) / 0.6));
      el.style.opacity = String(k);
      el.style.transform = `${base} translateY(${(1 - k) * 24}px)`;
    });
  }

  for (const el of document.querySelectorAll('[data-indicate]')) {
    const at = Number(el.dataset.indicate);
    const base = el.style.transform;
    reel.on((t) => {
      const k = clamp01((t - at) / 0.8);
      const bump = Math.sin(k * Math.PI);
      el.style.transform = `${base} scale(${1 + 0.18 * bump})`;
      el.style.filter = bump > 0.01 ? `drop-shadow(0 0 ${18 * bump}px rgba(244, 211, 69, ${0.9 * bump}))` : '';
    });
  }
})();
