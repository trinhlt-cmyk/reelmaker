// news.js — tách chữ trong [data-words] thành từng từ bật lên lần lượt.
//   <h1 class="headline" data-words="0.3" data-step="0.12">Toà thành <b>600 năm</b></h1>
//   data-words = giây bắt đầu, data-step = giây giữa hai từ (mặc định 0.12). <b> giữ nguyên (tô vàng).
(() => {
  for (const el of document.querySelectorAll('[data-words]')) {
    let t = Number(el.dataset.words || 0);
    const step = Number(el.dataset.step || 0.12);
    const wrap = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE) {
          const parts = child.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          for (const p of parts) {
            if (!p) continue;
            if (/^\s+$/.test(p)) {
              frag.appendChild(document.createTextNode(p));
              continue;
            }
            const span = document.createElement('span');
            span.className = 'word';
            span.textContent = p;
            span.style.animationDelay = `${t.toFixed(2)}s`;
            t += step;
            frag.appendChild(span);
          }
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          wrap(child);
        }
      }
    };
    wrap(el);
  }
})();
