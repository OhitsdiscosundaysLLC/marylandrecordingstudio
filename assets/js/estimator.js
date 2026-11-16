// Membership vs pay-as-you-go estimator. Prices come from the Square catalogue at build time.
(() => {
  document.querySelectorAll('[data-estimator]:not([data-ready])').forEach((root) => {
    root.dataset.ready = '';
    const P = JSON.parse(root.dataset.prices);
    const $in = (k) => root.querySelector(`[data-in="${k}"]`);
    const $out = (k) => root.querySelector(`[data-out="${k}"]`);
    const money = (n) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
    let tracked = false;
    function calc() {
      const h = +$in('hours').value, mx = +$in('mix').value, ms = +$in('master').value;
      $out('hours').textContent = h; $out('mix').textContent = mx; $out('master').textContent = ms;
      const extras = mx * P.mix + ms * P.master;
      const payg = h * P.hour + extras;
      const memFee = P.member * (1 + P.tax);
      const mem = memFee + extras;
      $out('payg').textContent = money(payg);
      $out('payg-note').textContent = `${h} hr × ${money(P.hour)}${extras ? ` + ${money(extras)} mixing/mastering` : ''}`;
      $out('mem').textContent = money(mem);
      $out('mem-note').textContent = `${money(P.member)} + ${money(P.member * P.tax)} MD tax${extras ? ` + ${money(extras)} mixing/mastering` : ''}`;
      const diff = payg - mem;
      root.classList.toggle('is-member-better', diff > 0);
      $out('verdict').textContent = diff > 0 ? `Membership saves you about ${money(diff)} a month.` : diff === 0 ? 'Both cost about the same.' : `Pay as you go is about ${money(-diff)} cheaper at this pace. Membership pays off from about ${Math.ceil(memFee / P.hour)} studio hours a month.`;
      if (!tracked && window.mrsTrack) { tracked = true; }
    }
    root.addEventListener('input', calc);
    root.addEventListener('change', () => window.mrsTrack && window.mrsTrack('estimator_use', { label: `${$in('hours').value}h`, page: location.pathname }));
    calc();
  });
})();
