// vox.js — phóng sự kiểu Vox: vòng tròn / mũi tên vẽ tay, mép giấy xé.
//
//   <div class="ring" data-at="2.2" style="left:900px; top:520px; width:520px; height:300px"></div>
//       vòng tròn đỏ vẽ tay quanh vùng đó, bắt đầu 2.2s (data-dur, mặc định 0.7s)
//   <div class="arrow" data-at="3" data-from="400,700" data-to="860,610"></div>
//       mũi tên vẽ tay từ điểm này tới điểm kia (px trong khung 1920×1080)
//   <figure class="cutout torn">…</figure>   mép dưới xé răng cưa
//   <div class="board">…</div>   bọc cả cảnh, đẩy vào chậm suốt cảnh
//   <script src="../vox.js"></script>   (cuối <body>)
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  // số ngẫu nhiên cố định theo hạt giống: cùng cảnh luôn ra cùng nét
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const svgBox = (el, w, h) => {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.style.overflow = 'visible';
    el.appendChild(svg);
    return svg;
  };
  const stroke = (svg, d, at, dur) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('pathLength', '1');
    p.setAttribute('class', 'ink');
    p.style.animationDelay = `${at}s`;
    p.style.animationDuration = `${dur}s`;
    svg.appendChild(p);
    return p;
  };

  for (const el of document.querySelectorAll('.ring')) {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const at = Number(el.dataset.at || 0);
    const svg = svgBox(el, w, h);
    // hơn một vòng, bán kính lệch nhẹ, đầu và cuối không khép kín: như khoanh bằng bút dạ
    const pts = [];
    const turns = 1.12;
    const start = -2.2 + rnd() * 0.4;
    for (let i = 0; i <= 64; i++) {
      const a = start + (i / 64) * turns * Math.PI * 2;
      const wob = 1 + (rnd() - 0.5) * 0.035 + (i / 64) * 0.06;
      pts.push([w / 2 + Math.cos(a) * (w / 2) * wob, h / 2 + Math.sin(a) * (h / 2) * wob]);
    }
    stroke(svg, `M${pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join(' L')}`, at, Number(el.dataset.dur || 0.7));
    el.dataset.sfx ??= 'scribble';
    el.dataset.sfxAt ??= String(at);
  }

  for (const el of document.querySelectorAll('.arrow')) {
    const [x0, y0] = el.dataset.from.split(',').map(Number);
    const [x1, y1] = el.dataset.to.split(',').map(Number);
    const at = Number(el.dataset.at || 0);
    const svg = svgBox(el, 1, 1);
    // thân cong nhẹ + hai nét đầu mũi tên
    const mx = (x0 + x1) / 2 - (y1 - y0) * 0.18;
    const my = (y0 + y1) / 2 + (x1 - x0) * 0.18;
    const body = 0.5;
    stroke(svg, `M${x0} ${y0} Q${mx} ${my} ${x1} ${y1}`, at, body);
    const ang = Math.atan2(y1 - my, x1 - mx);
    const head = (da) => `M${x1} ${y1} L${x1 - Math.cos(ang + da) * 46} ${y1 - Math.sin(ang + da) * 46}`;
    stroke(svg, head(0.5), at + body, 0.15);
    stroke(svg, head(-0.5), at + body + 0.1, 0.15);
    el.dataset.sfx ??= 'scribble';
    el.dataset.sfxAt ??= String(at);
  }

  // bảng đẩy vào đúng bằng độ dài cảnh
  for (const el of document.querySelectorAll('.board')) el.style.animationDuration = `${reel.duration}s`;

  // mép giấy xé: răng cưa ngẫu nhiên ở cạnh dưới
  for (const el of document.querySelectorAll('.torn')) {
    const pts = ['0% 0%', '100% 0%'];
    for (let x = 100; x >= 0; x -= 2.5) pts.push(`${x}% ${(96 + rnd() * 4).toFixed(1)}%`);
    el.style.clipPath = `polygon(${pts.join(', ')})`;
  }
})();
