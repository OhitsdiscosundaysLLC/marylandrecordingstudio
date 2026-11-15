"""Responsive layout audit for the Maryland Recording Studio site.

Measures real rendered layouts with Playwright (Chromium) at many viewport sizes and
records, per route and width:
  - innerWidth / clientWidth / scrollWidth (with any overflow-x concealment disabled)
  - elements whose right/left edge leaves the viewport and are NOT clipped by an ancestor
  - elements wider than their parent's content box (the usual root cause of overflow)
  - text that overflows its own box (long words / no-wrap)
  - tap targets smaller than 44x44 on touch widths, and text smaller than 13px
  - fixed/sticky elements that cover the last content on the page

Usage:
  npm run build && npm start            # serves dist/ on :3000
  python3 scripts/audit/responsive_audit.py [base_url] [out_dir]

Requires: pip install playwright && playwright install chromium
"""
import asyncio, json, sys, os
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'audit-output'
CHROME = os.environ.get('CHROME_PATH')  # optional system Chrome

ROUTES = ['/', '/studio', '/services', '/services/crash-test-artist-evaluation', '/services/creator-membership-200',
          '/book', '/book?service=unlimited-membership', '/gallery', '/radio', '/explore', '/about', '/contact', '/faq', '/missing-page']
WIDTHS = [320, 344, 360, 375, 390, 393, 414, 430, 480, 540, 640, 768, 820, 912, 1024, 1100, 1280, 1366, 1440, 1600, 1920]
LANDSCAPE = [(667, 375), (844, 390), (932, 430), (1180, 820)]

MEASURE = r"""
(touch) => {
  const cw = document.documentElement.clientWidth;
  const path = (el) => { const p = []; let e = el; while (e && e !== document.body && p.length < 4) { let s = e.tagName.toLowerCase(); if (e.id) s += '#' + e.id; else if (typeof e.className === 'string' && e.className.trim()) s += '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.'); p.unshift(s); e = e.parentElement; } return p.join(' > '); };
  const visible = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; if (el.closest('[hidden], dialog:not([open]), .sr-only, .skip-link, .hp')) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // Is the part of `el` outside the viewport actually visible, i.e. not clipped by an ancestor?
  const clippedBy = (el) => { let a = el.parentElement; while (a && a !== document.documentElement) { const cs = getComputedStyle(a); if (/(hidden|clip|auto|scroll)/.test(cs.overflowX) || /(hidden|clip)/.test(cs.overflow)) { const r = a.getBoundingClientRect(); if (r.right <= cw + 1 && r.left >= -1) return a; } if (cs.position === 'fixed') break; a = a.parentElement; } return null; };
  const out = { innerWidth: innerWidth, clientWidth: cw, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth, overflow: [], widerThanParent: [], textOverflow: [], smallTargets: [], smallText: [] };
  const all = [...document.querySelectorAll('body *')].filter(visible);
  const reported = new Set();
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if ((r.right > cw + 1 || r.left < -1) && !clippedBy(el)) {
      if ([...reported].some((p) => p.contains(el))) continue;
      reported.add(el);
      out.overflow.push({ el: path(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), parentWidth: Math.round(el.parentElement.getBoundingClientRect().width), position: getComputedStyle(el).position });
    }
    const p = el.parentElement; if (p && p !== document.body) {
      const pcs = getComputedStyle(p); const pr = p.getBoundingClientRect();
      const inner = pr.width - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight) - parseFloat(pcs.borderLeftWidth) - parseFloat(pcs.borderRightWidth);
      const pos = getComputedStyle(el).position;
      if (r.width > inner + 1.5 && pos !== 'absolute' && pos !== 'fixed' && !/(hidden|clip|auto|scroll)/.test(pcs.overflowX) && !clippedBy(el) && el.tagName !== 'svg' && !el.closest('svg')) {
        out.widerThanParent.push({ el: path(el), width: Math.round(r.width), parentInner: Math.round(inner) });
      }
    }
    const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX === 'visible' && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && el.clientWidth > 0 && cs.display !== 'inline') {
      out.textOverflow.push({ el: path(el), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, text: el.textContent.trim().slice(0, 40) });
    }
    if (touch && el.matches('a[href], button, input:not([type=hidden]), select, textarea, summary') && !el.closest('.sr-only')) {
      if ((r.height < 44 || r.width < 44) && cs.display !== 'inline' && !el.closest('p, li > p, .footer-contact, .prose, .lead, .faq__a, .booking-panel__note, .breadcrumbs, .tile__fine, .muted, .svc-card__title, .site-footer__legal')) out.smallTargets.push({ el: path(el), w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30) });
    }
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(cs.fontSize) < 13 && !el.closest('.browser__bar, svg')) out.smallText.push({ el: path(el), size: cs.fontSize, text: el.textContent.trim().slice(0, 30) });
  }
  // Fixed/sticky bars must not hide the end of the page.
  const fixed = [...document.querySelectorAll('.sticky-cta.is-visible, .mini-player:not([hidden])')].filter(visible);
  out.fixedBars = fixed.map((f) => ({ el: path(f), height: Math.round(f.getBoundingClientRect().height) }));
  out.footerPaddingBottom = parseFloat(getComputedStyle(document.querySelector('.site-footer') || document.body).paddingBottom);
  out.smallTargets = out.smallTargets.slice(0, 15); out.smallText = out.smallText.slice(0, 15); out.widerThanParent = out.widerThanParent.slice(0, 15); out.textOverflow = out.textOverflow.slice(0, 15);
  return out;
}
"""

async def main():
    os.makedirs(OUT, exist_ok=True)
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        sizes = [(w, 900 if w > 900 else 800) for w in WIDTHS] + LANDSCAPE
        for (w, h) in sizes:
            touch = w <= 1180
            ctx = await browser.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 820, has_touch=touch)
            page = await ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
            for route in ROUTES:
                errors.clear()
                await page.goto(BASE + route, wait_until='load')
                # Disable any overflow-x concealment so real overflow is measured; reveal animated content.
                await page.add_style_tag(content='html,body{overflow-x:visible!important}.reveal{opacity:1!important;transform:none!important}')
                await page.wait_for_timeout(150)
                m = await page.evaluate(MEASURE, touch and w <= 480)
                m.update(route=route, width=w, height=h, errors=list(errors))
                results.append(m)
            await ctx.close()
        await browser.close()
    with open(os.path.join(OUT, 'results.json'), 'w') as f:
        json.dump(results, f, indent=1)
    # Summary
    lines = []
    for r in results:
        issues = []
        if r['scrollWidth'] > r['clientWidth']: issues.append(f"HORIZONTAL SCROLL {r['scrollWidth']}>{r['clientWidth']}")
        if r['overflow']: issues.append('overflow: ' + '; '.join(f"{o['el']} [{o['left']}..{o['right']}]" for o in r['overflow'][:4]))
        if r['widerThanParent']: issues.append('wider-than-parent: ' + '; '.join(f"{o['el']} {o['width']}>{o['parentInner']}" for o in r['widerThanParent'][:4]))
        if r['textOverflow']: issues.append('text-overflow: ' + '; '.join(f"{o['el']} '{o['text']}'" for o in r['textOverflow'][:3]))
        if r['smallTargets']: issues.append(f"small-targets({len(r['smallTargets'])}): " + '; '.join(f"{o['el']} {o['w']}x{o['h']}" for o in r['smallTargets'][:4]))
        if r['smallText']: issues.append(f"small-text({len(r['smallText'])}): " + '; '.join(f"{o['el']} {o['size']}" for o in r['smallText'][:3]))
        if r['errors']: issues.append('console: ' + ' | '.join(r['errors'][:2]))
        if issues: lines.append(f"{r['width']}x{r['height']} {r['route']}\n  - " + '\n  - '.join(issues))
    total = len(results)
    with open(os.path.join(OUT, 'summary.txt'), 'w') as f:
        f.write(f"{total} route x viewport checks, {len(lines)} with findings\n\n" + '\n'.join(lines))
    print(f"{total} checks, {len(lines)} with findings -> {OUT}/summary.txt")

asyncio.run(main())
