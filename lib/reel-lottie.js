// reel-lottie.js — hoạt hình Lottie chạy theo thời gian của cảnh (reelmaker tua từng khung, không tự phát).
//
//   <script src="../lib/lottie.min.js"></script>
//   <script src="../assets/lottie/con-meo.js"></script>        (reelmaker lottie tạo file này)
//   <div data-lottie="con-meo" data-start="0.5" style="position:absolute; left:100px; top:200px; width:500px; height:500px"></div>
//   <script src="../lib/reel-lottie.js"></script>               (cuối <body>)
//
//   data-start  giây bắt đầu chạy (trước đó đứng ở khung đầu; data-hide-before để ẩn hẳn)
//   data-speed  tốc độ (mặc định 1), data-loop lặp lại (không có: chạy hết rồi đứng ở khung cuối)
//   data-from / data-to  chỉ chạy đoạn khung này (vd một động tác trong file nhiều động tác)
(() => {
  for (const el of document.querySelectorAll('[data-lottie]')) {
    const data = window.LOTTIE?.[el.dataset.lottie];
    if (!data) throw new Error(`chưa có hoạt hình "${el.dataset.lottie}": thiếu <script src="../assets/lottie/${el.dataset.lottie}.js">`);
    const anim = lottie.loadAnimation({
      container: el, renderer: 'svg', loop: false, autoplay: false,
      // bản sao: lottie sửa dữ liệu khi dựng, hai phần tử cùng một hoạt hình không được dùng chung
      animationData: JSON.parse(JSON.stringify(data)),
      rendererSettings: { preserveAspectRatio: el.dataset.fit ?? 'xMidYMid meet' },
    });
    const start = Number(el.dataset.start ?? 0);
    const speed = Number(el.dataset.speed ?? 1);
    const from = Number(el.dataset.from ?? data.ip);
    const to = Number(el.dataset.to ?? data.op - 1);
    const loop = el.hasAttribute('data-loop');
    const hideBefore = el.hasAttribute('data-hide-before');
    reel.on((t) => {
      const frames = Math.max(0, (t - start) * data.fr * speed);
      const len = to - from;
      const f = loop ? from + (frames % (len + 1)) : from + Math.min(frames, len);
      anim.goToAndStop(f, true);
      if (hideBefore) el.style.visibility = t < start ? 'hidden' : 'visible';
    });
  }
})();
