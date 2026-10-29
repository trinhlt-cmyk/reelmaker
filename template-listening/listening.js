// listening.js — luyện nghe tiếng Anh: câu tiếng Anh sáng từng từ theo giọng đọc, hoặc che thành ô trống để chép chính tả.
//
//   <p class="en" data-mode="karaoke">Can I get a large iced latte?</p>   từ đang đọc sáng lên
//   <p class="en" data-mode="blank" data-reveal="end">…</p>               mỗi từ là một ô trống; data-reveal = giây hiện đáp án
//                                                                          ("end" = đọc xong + 0.3s)
//   <div class="wave"></div>   sóng âm nhấp nhô trong lúc giọng đang đọc
//   <script src="../listening.js"></script>   (cuối <body>)
(() => {
  const words = reel.lines.flatMap((l) => l.words ?? []);
  const voiceEnd = reel.lines.length ? Math.max(...reel.lines.map((l) => l.end)) : 0;
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

  for (const el of document.querySelectorAll('.en[data-mode]')) {
    const tokens = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    // ghép từng từ hiển thị với mốc thời gian của giọng đọc (bỏ qua dấu câu, lệch thì lấy từ kế tiếp)
    let j = 0;
    const spans = tokens.map((tok, i) => {
      let k = j;
      while (k < words.length && k < j + 3 && norm(words[k].text) !== norm(tok)) k++;
      const w = words[k < words.length && norm(words[k].text) === norm(tok) ? k : Math.min(j, words.length - 1)];
      if (w && norm(w.text) === norm(tok)) j = k + 1;
      const span = document.createElement('span');
      span.className = 'w';
      span.textContent = tok;
      el.append(span, i < tokens.length - 1 ? ' ' : '');
      return { span, start: w?.start ?? 0, end: w?.end ?? 0 };
    });
    const mode = el.dataset.mode;
    const reveal = el.dataset.reveal === 'end' || !el.dataset.reveal ? voiceEnd + 0.3 : Number(el.dataset.reveal);
    reel.on((t) => {
      for (const s of spans) {
        if (mode === 'blank') s.span.classList.toggle('hidden', t < reveal);
        s.span.classList.toggle('on', t >= s.start && t < s.end + 0.05);
        s.span.classList.toggle('said', t >= s.end + 0.05);
      }
    });
  }

  for (const el of document.querySelectorAll('.wave')) {
    const bars = Array.from({ length: 9 }, () => el.appendChild(document.createElement('i')));
    reel.on((t) => {
      const speaking = reel.lines.some((l) => t >= l.start && t <= l.end);
      bars.forEach((b, i) => {
        const h = speaking ? 0.35 + 0.65 * Math.abs(Math.sin(t * 7 + i * 1.3) * Math.cos(t * 3.1 + i)) : 0.18;
        b.style.transform = `scaleY(${h.toFixed(3)})`;
      });
    });
  }
})();
