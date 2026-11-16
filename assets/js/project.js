// Project upload: each file goes straight to private storage through a one-time signed URL.
(() => {
  const form = document.querySelector('[data-project-form]');
  if (!form || form.dataset.ready) return;
  form.dataset.ready = '';
  const MAX = 50 * 1024 * 1024;
  const OK = /\.(wav|aif|aiff|mp3|m4a|flac|ogg|zip|rar|7z|pdf|txt|mid|midi|als|logicx|ptx|flp)$/i;
  const list = form.querySelector('[data-upl]');
  const input = form.querySelector('[data-files]');
  const drop = form.querySelector('[data-drop]');
  const status = form.querySelector('[data-status]');
  const btn = form.querySelector('[data-submit]');
  const err = (k, m) => { const e = form.querySelector(`[data-err="${k}"]`); if (e) e.textContent = m || ''; };
  const items = []; // {file, state, path, li}
  let batch = '';
  const size = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function add(files) {
    err('files');
    for (const f of files) {
      if (items.length >= 30) { err('files', 'Up to 30 files. Zip the rest or paste a link.'); break; }
      const li = document.createElement('li');
      const bad = !OK.test(f.name) ? 'File type not accepted' : f.size > MAX ? 'Over 50 MB: paste a link instead' : '';
      li.innerHTML = `<span class="upl__name">${esc(f.name)}</span><span class="upl__size">${size(f.size)}</span><span class="upl__bar"><i></i></span><span class="upl__st">${bad || 'Ready'}</span><button type="button" class="upl__x" aria-label="Remove ${esc(f.name)}">×</button>`;
      if (bad) li.classList.add('is-bad');
      const it = { file: f, state: bad ? 'bad' : 'ready', path: '', li };
      li.querySelector('.upl__x').onclick = () => { if (it.state === 'uploading') return; items.splice(items.indexOf(it), 1); li.remove(); };
      items.push(it); list.append(li);
    }
  }
  input.addEventListener('change', () => { add(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', (e) => add(e.dataTransfer.files));

  async function upload(it) {
    it.state = 'uploading'; it.li.querySelector('.upl__st').textContent = 'Preparing…';
    const r = await fetch('/api/projects?action=upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: it.file.name, size: it.file.size, batch }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Upload unavailable');
    batch = j.batch;
    await new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('PUT', j.uploadUrl);
      x.setRequestHeader('Content-Type', it.file.type || 'application/octet-stream');
      x.upload.onprogress = (e) => { if (e.lengthComputable) { const p = Math.round((e.loaded / e.total) * 100); it.li.querySelector('.upl__bar i').style.width = p + '%'; it.li.querySelector('.upl__st').textContent = p + '%'; } };
      x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error('Upload failed (' + x.status + ')')));
      x.onerror = () => reject(new Error('Network error'));
      x.send(it.file);
    });
    it.path = j.path; it.state = 'done'; it.li.classList.add('is-done'); it.li.querySelector('.upl__st').textContent = 'Uploaded ✓';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    ['name', 'email', 'service', 'files', 'consent_contact'].forEach((k) => err(k));
    status.className = 'form__status'; status.textContent = '';
    const fd = new FormData(form);
    const good = items.filter((i) => i.state !== 'bad');
    let invalid = false;
    if (String(fd.get('name')).trim().length < 2) { err('name', 'Please enter your name.'); invalid = true; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(fd.get('email')).trim())) { err('email', 'Please enter a valid email.'); invalid = true; }
    if (!fd.get('service')) { err('service', 'Choose what you need.'); invalid = true; }
    if (!good.length && !/^https?:\/\//.test(String(fd.get('link')))) { err('files', 'Upload at least one file or paste a link to your files.'); invalid = true; }
    if (!fd.get('consent_contact')) { err('consent_contact', 'Please agree so we can contact you about this project.'); invalid = true; }
    if (invalid) { form.querySelector('.field__err:not(:empty)')?.closest('.field, .checkline, p')?.querySelector('input, select, textarea')?.focus(); return; }
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'Uploading…';
    try {
      for (const it of good) if (it.state !== 'done') await upload(it);
      btn.textContent = 'Sending…';
      const r = await fetch('/api/projects?action=submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        ...Object.fromEntries(fd.entries()), consent_contact: !!fd.get('consent_contact'), consent_marketing: !!fd.get('consent_marketing'),
        files: good.map((i) => ({ path: i.path, name: i.file.name, size: i.file.size })), visitor_id: (window.mrsVisitor || {}).vid, source: (window.mrsVisitor || {}).source,
      }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { if (j.fields) Object.entries(j.fields).forEach(([k, m]) => err(k, m)); throw new Error(j.error && j.error !== 'validation' ? j.error : 'Please check the form.'); }
      window.mrsTrack && window.mrsTrack('contact_submit', { label: 'project_upload', page: location.pathname });
      form.reset(); items.splice(0); list.innerHTML = ''; batch = '';
      status.className = 'form__status is-success'; status.textContent = "Got it! Your project is with the studio team. We'll contact you by email soon.";
    } catch (ex) {
      items.filter((i) => i.state === 'uploading').forEach((i) => { i.state = 'ready'; i.li.querySelector('.upl__st').textContent = 'Retry'; });
      status.className = 'form__status is-error'; status.textContent = ex.message + ' You can also email us your files.';
    }
    btn.disabled = false; btn.textContent = label;
  });
})();
