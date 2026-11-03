/*
 * حركة الـ Dock لكل القوائم: المحدد أكبر شي، وجيرانه يكبرون بتدرج ويبتعدون عنه، والبعيدين مكانهم.
 * بدل تغيير العرض (يعيد تخطيط القائمة كلها في كل إطار) نحسب التكبير والإزاحة بـ transform بس،
 * ونكتب في العنصر اللي تغيّرت قيمته. والحركة نفسها transition في الـ CSS: تنقطع وترجع من مكانها.
 */
(function () {
  const set = (e, v) => { if (e.__t !== v) { e.style.transform = v; e.__t = v; } };

  // الإزاحة عند البعد d = نص زيادة المحدد + زيادات اللي بينهم كاملة + نص زيادة هذا العنصر
  function shiftAt(d, size, scale) {
    const s = (k) => scale[k] || 1;
    let out = (s(0) - 1) * size / 2;
    for (let k = 1; k < d; k++) out += (s(k) - 1) * size;
    return out + (s(d) - 1) * size / 2;
  }

  window.Dock = {
    // kids: العناصر، idx: المحدد، size: مقاس العنصر باتجاه القائمة، scale: التكبير حسب البعد،
    // dir: اتجاه اللي بعد المحدد (-1 يسار أو فوق، 1 يمين أو تحت)، axis: x أو y، lift: يرتفع المحدد (وقت التحريك)
    apply(kids, idx, o) {
      const axis = o.axis === "y" ? "Y" : "X", dir = o.dir || -1;
      for (let i = 0; i < kids.length; i++) {
        const d = Math.abs(i - idx), side = i > idx ? dir : -dir;
        const shift = d ? Math.round(side * shiftAt(d, o.size, o.scale)) : 0;
        set(kids[i], `translate${axis}(${shift}px) scale(${o.scale[d] || 1})` + (d === 0 && o.lift ? ` translateY(${-o.lift}px)` : ""));
        kids[i].classList.toggle("near", d === 1);
      }
    },
    clear(kids) {
      for (let i = 0; i < kids.length; i++) { set(kids[i], ""); kids[i].classList.remove("near"); }
    }
  };
})();
