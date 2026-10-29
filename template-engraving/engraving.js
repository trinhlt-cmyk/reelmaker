// engraving.js — kiểu tranh khắc cổ: máy quay lia trên tranh, hạt phim, chữ hiện dần như mực thấm.
//
//   <div class="plate" data-img="../assets/ke-cho.jpg" data-cam="0:0.5,0.5,1; 4.5:0.3,0.34,1.8"></div>
//     data-cam = các mốc "giây:x,y,zoom" (x,y = điểm nằm giữa khung, theo tỉ lệ ảnh 0..1; zoom 1 = ảnh vừa phủ khung)
//     máy quay đi mượt giữa các mốc và không bao giờ lộ mép ảnh
//   <h1 data-ink="0.6">…</h1>        chữ hiện từ trái sang phải bắt đầu 0.6s (data-ink="0.6-1.5" = trong 1.5s)
//   <script src="../engraving.js"></script>   (cuối <body>; data-grain="none" trên thẻ script để tắt hạt phim)
(() => {
  const script = document.currentScript;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smooth = (x) => x * x * (3 - 2 * x);
  // số ngẫu nhiên cố định theo khung hình: render lại ra đúng hình cũ
  const rand = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  for (const plate of document.querySelectorAll('.plate[data-img]')) {
    const img = document.createElement('img');
    img.src = plate.dataset.img;
    plate.appendChild(img);
    const keys = (plate.dataset.cam || '0:0.5,0.5,1').split(';').map((k) => {
      const [t, rest] = k.split(':');
      const [x, y, z] = rest.split(',').map(Number);
      return { t: Number(t), x, y, z: z || 1 };
    }).sort((a, b) => a.t - b.t);
    reel.on((t) => {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      if (!iw) return;
      let i = keys.findIndex((k) => k.t > t);
      if (i === -1) i = keys.length;
      const a = keys[Math.max(0, i - 1)];
      const b = keys[Math.min(keys.length - 1, i)];
      const k = a === b ? 0 : smooth(clamp01((t - a.t) / (b.t - a.t)));
      const x = a.x + (b.x - a.x) * k;
      const y = a.y + (b.y - a.y) * k;
      const z = Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * k);
      const W = plate.clientWidth;
      const H = plate.clientHeight;
      const s = Math.max(W / iw, H / ih) * z;
      const tx = Math.min(0, Math.max(W - iw * s, W / 2 - x * iw * s));
      const ty = Math.min(0, Math.max(H - ih * s, H / 2 - y * ih * s));
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    });
  }

  for (const el of document.querySelectorAll('[data-ink]')) {
    const [start, dur] = el.dataset.ink.split('-').map(Number);
    const d = dur || Math.max(0.8, el.textContent.length * 0.035);
    reel.on((t) => {
      const p = clamp01((t - start) / d) * 120 - 10;
      el.style.webkitMaskImage = el.style.maskImage = `linear-gradient(90deg, #000 ${p}%, transparent ${p + 10}%)`;
    });
  }

  if (script?.dataset.grain === 'none') return;
  // hạt phim + vệt xước + ánh sáng chập chờn, đổi theo từng khung
  const fps = reel.fps || 30;
  const grain = document.createElement('div');
  grain.className = 'eng-grain';
  grain.setAttribute('data-reel-overlay', '');
  grain.innerHTML = `<svg width="100%" height="100%"><filter id="eng-noise"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="1"/>
    <feColorMatrix values="0 0 0 0 .2  0 0 0 0 .14  0 0 0 0 .07  0 0 0 .55 0"/></filter><rect width="100%" height="100%" filter="url(#eng-noise)"/></svg>`;
  const scratch = document.createElement('div');
  scratch.className = 'eng-scratch';
  scratch.setAttribute('data-reel-overlay', '');
  document.body.append(grain, scratch);
  const turb = grain.querySelector('feTurbulence');
  reel.on((t) => {
    const f = Math.round(t * fps);
    turb.setAttribute('seed', String(f % 97));
    document.body.style.filter = `brightness(${(0.97 + rand(f) * 0.05).toFixed(3)})`;
    // thỉnh thoảng một vệt xước dọc thoáng qua
    const on = rand(f * 3.7) > 0.86;
    scratch.style.opacity = on ? String(0.25 + rand(f) * 0.35) : '0';
    scratch.style.left = `${(rand(f * 1.3) * 100).toFixed(1)}%`;
  });
})();
