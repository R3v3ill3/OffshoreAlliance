// Injected into every page so the recorded video shows a visible cursor + click ripples.
// Playwright's native video does not render the OS pointer; this draws a synthetic one
// that follows mousemove events (use page.mouse.move with steps to animate it).
export const cursorInitScript = `
(() => {
  if (window.__oaCursor) return;
  window.__oaCursor = true;
  const add = () => {
    if (!document.body) return setTimeout(add, 30);
    const style = document.createElement('style');
    style.textContent = [
      '#oa-cursor{position:fixed;left:0;top:0;z-index:2147483647;width:24px;height:24px;',
      'margin:-2px 0 0 -2px;pointer-events:none;will-change:transform;}',
      '#oa-cursor svg{filter:drop-shadow(0 1px 2px rgba(0,0,0,.55));}',
      '.oa-ripple{position:fixed;z-index:2147483646;border:3px solid #38bdf8;border-radius:50%;',
      'pointer-events:none;width:12px;height:12px;margin:-6px 0 0 -6px;opacity:.95;',
      'animation:oaRip .55s ease-out forwards;}',
      '@keyframes oaRip{to{width:54px;height:54px;margin:-27px 0 0 -27px;opacity:0;}}'
    ].join('');
    document.documentElement.appendChild(style);
    const c = document.createElement('div');
    c.id = 'oa-cursor';
    c.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M3 2 L3 19 L8 14 L11 21 L14 20 L11 13 L18 13 Z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    let x = window.innerWidth / 2, y = window.innerHeight / 2;
    const place = () => { c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
    place();
    addEventListener('mousemove', e => { x = e.clientX; y = e.clientY; place(); }, true);
    addEventListener('mousedown', e => {
      const r = document.createElement('div');
      r.className = 'oa-ripple';
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      document.documentElement.appendChild(r);
      setTimeout(() => r.remove(), 580);
    }, true);
  };
  add();
})();
`;

/** Smoothly move the synthetic pointer to an element's centre, then optionally click. */
export async function moveTo(page, locator, { steps = 25 } = {}) {
  const box = await locator.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
}
