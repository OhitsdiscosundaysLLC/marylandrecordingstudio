// Contact form: client-side validation, real submission to /api/contact, honest error states.
(() => {
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;
  const status = form.querySelector('[data-form-status]');
  const btn = form.querySelector('[data-submit]');
  const started = form.querySelector('[data-started-at]');
  started.value = String(Date.now());
  const PHONE = '(443) 401-5425';
  const EMAIL = 'ohitsdiscosundays@gmail.com';

  const rules = {
    name: (v) => (v.trim().length >= 2 ? '' : 'Please enter your name.'),
    email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Please enter a valid email address.'),
    message: (v) => (v.trim().length >= 10 ? '' : 'Please write a message of at least 10 characters.'),
  };

  function validateField(name) {
    const input = form.elements[name];
    const err = rules[name](input.value);
    input.setAttribute('aria-invalid', err ? 'true' : 'false');
    form.querySelector(`#${input.id}-err`).textContent = err;
    return !err;
  }
  Object.keys(rules).forEach((n) => form.elements[n].addEventListener('blur', () => { if (form.elements[n].value) validateField(n); }));

  function show(kind, html) {
    status.className = `form__status is-${kind}`;
    status.innerHTML = html;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = Object.keys(rules).map(validateField).every(Boolean);
    if (!ok) { form.querySelector('[aria-invalid="true"]').focus(); return; }
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Sending…';
    status.className = 'form__status'; status.textContent = '';
    const payload = { ...Object.fromEntries(new FormData(form).entries()), visitor_id: (window.mrsVisitor || {}).vid };
    const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent('Studio enquiry from ' + payload.name)}&body=${encodeURIComponent(payload.message)}`;
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        show('success', `<strong>Thanks, ${payload.name.split(' ')[0].replace(/[<>&"]/g, '')}. Your message is on its way.</strong> We'll reply to ${payload.email.replace(/[<>&"]/g, '')}. Want to lock in a time now? <a href="/book">Book online</a>.`);
        window.mrsTrack && window.mrsTrack('contact_form_submit', { service: payload.service || '' });
        form.reset();
        started.value = String(Date.now());
      } else if (res.status === 400 && data.fields) {
        Object.entries(data.fields).forEach(([k, msg]) => { const i = form.elements[k]; if (i) { i.setAttribute('aria-invalid', 'true'); const el = form.querySelector(`#${i.id}-err`); if (el) el.textContent = msg; } });
        show('error', 'Please check the highlighted fields.');
      } else {
        show('error', `<strong>We couldn't send your message right now.</strong> Please <a href="${mailto}">email us</a> or call or text <a href="tel:+14434015425">${PHONE}</a>.`);
        window.mrsTrack && window.mrsTrack('contact_form_error', { status: res.status });
      }
    } catch {
      show('error', `<strong>You appear to be offline.</strong> Please <a href="${mailto}">email us</a> or call or text <a href="tel:+14434015425">${PHONE}</a>.`);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
      status.focus?.();
    }
  });
})();
