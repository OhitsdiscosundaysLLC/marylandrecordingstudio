// AI studio assistant: text chat + optional voice (OpenAI Realtime over WebRTC).
// The API key never reaches the browser: chat goes through /api/ai/chat and voice uses a
// 2-minute client secret minted by /api/ai/realtime.
(() => {
  if (window.mrsAI) return;
  const V = window.mrsVisitor || {};
  const track = (e, p) => window.mrsTrack && window.mrsTrack(e, p);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let state = { messages: [], conversation: null, interest: '', settings: {}, busy: false };
  try { const s = JSON.parse(sessionStorage.getItem('mrs_ai') || 'null'); if (s) state = { ...state, ...s }; } catch {}
  const save = () => { try { sessionStorage.setItem('mrs_ai', JSON.stringify({ messages: state.messages.slice(-30), conversation: state.conversation })); } catch {} };

  const panel = document.createElement('div');
  panel.className = 'ai-panel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-labelledby', 'ai-title');
  panel.innerHTML = `
  <div class="ai-panel__head">
    <span class="ai-orb" aria-hidden="true"></span>
    <div><h2 id="ai-title">AI studio assistant</h2><p>An AI, not a person · <button type="button" class="ai-link" data-ai-human>Talk to the team</button></p></div>
    <button type="button" class="ai-x" data-ai-close aria-label="Close assistant">×</button>
  </div>
  <div class="ai-log" data-ai-log aria-live="polite"></div>
  <div class="ai-suggest" data-ai-suggest></div>
  <div class="ai-voice" data-ai-voicebar hidden>
    <div class="ai-voice__viz" aria-hidden="true">${'<i></i>'.repeat(18)}</div>
    <p data-ai-voicestatus>Connecting…</p>
    <button type="button" class="btn btn--ghost btn--sm" data-ai-hang>End voice</button>
  </div>
  <form class="ai-form" data-ai-form>
    <label class="sr-only" for="ai-input">Message the AI studio assistant</label>
    <input id="ai-input" name="q" autocomplete="off" maxlength="800" placeholder="Ask about recording, mixing, membership…">
    <button type="button" class="ai-mic" data-ai-voicebtn aria-label="Talk to our AI studio assistant (voice)"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg></button>
    <button class="ai-send" aria-label="Send"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3 20.5 21 12 3 3.5l2.6 7.1L14 12l-8.4 1.4L3 20.5Z"/></svg></button>
  </form>
  <p class="ai-fine">Chats are saved so our team can help you. Don't share card details or passwords. Prices and bookings are confirmed in Square.</p>`;
  document.body.append(panel);
  const $ = (s) => panel.querySelector(s);
  const log = $('[data-ai-log]');

  function cardHTML(c) {
    const ext = c.external ? ' target="_blank" rel="noopener"' : '';
    const tr = c.type === 'purchase' ? 'membership_checkout_click' : 'book_cta_click';
    return `<div class="ai-card"><div><strong>${esc(c.name)}</strong><span>${esc(c.price || '')}${c.duration ? ` · ${c.duration >= 60 ? c.duration / 60 + ' hr' : c.duration + ' min'}` : ''}${c.type === 'purchase' ? ' · no booking needed' : ''}</span></div>
      <a class="btn btn--primary btn--sm" href="${esc(c.url)}"${ext} data-track="${tr}" data-via="ai" data-label="ai_${esc(c.slug)}">${esc(c.label)}</a></div>`;
  }
  function uiHTML(u) {
    if (u.type === 'booking') return `<div class="ai-cards">${u.reason ? `<p>${esc(u.reason)}</p>` : ''}${u.cards.map(cardHTML).join('')}</div>`;
    if (u.type === 'handoff') return `<div class="ai-cards"><p>Reach the studio team directly:</p><div class="ai-card"><div><strong>Call or text</strong><span>${esc(u.phone)}</span></div><a class="btn btn--ghost btn--sm" href="tel:${esc(String(u.phone).replace(/[^\d+]/g, ''))}" data-track="phone_click" data-via="ai">Call</a></div><div class="ai-card"><div><strong>Email</strong><span>${esc(u.email)}</span></div><a class="btn btn--ghost btn--sm" href="mailto:${esc(u.email)}" data-track="email_click" data-via="ai">Email</a></div></div>`;
    if (u.type === 'lead_saved') return '<p class="ai-note">✓ Saved. The team will follow up.</p>';
    return '';
  }
  function render() {
    const greet = state.settings?.ai?.greeting || "Hey! I'm the Disco Sundays AI studio assistant. What are you working on?";
    log.innerHTML = `<div class="ai-msg ai-msg--bot">${esc(greet)}</div>` + state.messages.map((m) => `<div class="ai-msg ai-msg--${m.role === 'user' ? 'me' : 'bot'}">${esc(m.content)}</div>${(m.ui || []).map(uiHTML).join('')}`).join('') + (state.busy ? '<div class="ai-msg ai-msg--bot ai-typing"><i></i><i></i><i></i></div>' : '');
    log.scrollTop = log.scrollHeight;
    const sug = $('[data-ai-suggest]');
    sug.innerHTML = state.messages.length ? '' : ['I want to record a song', 'I need my track mixed', 'Is membership worth it?', 'Can I visit first?'].map((t) => `<button type="button">${t}</button>`).join('');
  }
  $('[data-ai-suggest]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ask(b.textContent); });

  async function ask(text) {
    text = text.trim(); if (!text || state.busy) return;
    state.messages.push({ role: 'user', content: text }); state.busy = true; render();
    try {
      const r = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        messages: state.messages.map(({ role, content }) => ({ role, content })), conversation_id: state.conversation,
        visitor_id: V.vid, source: V.source, interest: state.interest, page: location.pathname,
      }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) state.messages.push({ role: 'assistant', content: j.error || 'Sorry, I could not answer just now.', ui: j.ui || [] });
      else { state.conversation = j.conversation_id || state.conversation; state.messages.push({ role: 'assistant', content: j.reply || '', ui: j.ui || [] }); }
    } catch { state.messages.push({ role: 'assistant', content: "I'm having trouble connecting. You can call or text the studio instead.", ui: [{ type: 'handoff', phone: state.settings?.contact?.phone, email: state.settings?.contact?.email }] }); }
    state.busy = false; save(); render();
  }
  $('[data-ai-form]').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#ai-input'); const v = i.value; i.value = ''; ask(v); });
  $('[data-ai-human]').addEventListener('click', () => ask('I would like to talk to a person on the team.'));

  // ---------------- Voice ----------------
  let pc = null, dc = null, mic = null, audio = null, voiceConv = null;
  const vstatus = (t) => { $('[data-ai-voicestatus]').textContent = t; };
  const relay = (body) => fetch('/api/ai/voice-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversation_id: voiceConv, ...body }) }).then((r) => r.json()).catch(() => ({}));
  async function startVoice() {
    if (pc) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) { ask('Voice is not supported in this browser, can we chat here?'); return; }
    $('[data-ai-voicebar]').hidden = false; panel.classList.add('is-voice'); vstatus('Asking for your microphone…');
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      vstatus('Connecting to the AI assistant…');
      const tok = await fetch('/api/ai/realtime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor_id: V.vid, source: V.source, interest: state.interest, page: location.pathname }) });
      const t = await tok.json();
      if (!tok.ok) throw new Error(t.error || 'Voice unavailable');
      voiceConv = t.conversation_id;
      track('voice_start', { page: location.pathname });
      pc = new RTCPeerConnection();
      audio = new Audio(); audio.autoplay = true;
      pc.ontrack = (e) => { audio.srcObject = e.streams[0]; };
      pc.addTrack(mic.getTracks()[0], mic);
      dc = pc.createDataChannel('oai-events');
      dc.onopen = () => { vstatus('Listening. Just talk. (You are speaking with an AI.)'); dc.send(JSON.stringify({ type: 'response.create' })); };
      dc.onmessage = onEvent;
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const sdp = await fetch('https://api.openai.com/v1/realtime/calls?model=' + encodeURIComponent(t.model), { method: 'POST', body: offer.sdp, headers: { Authorization: 'Bearer ' + t.client_secret, 'Content-Type': 'application/sdp' } });
      if (!sdp.ok) throw new Error('Voice connection failed');
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdp.text() });
      panel.classList.add('is-live');
    } catch (err) {
      stopVoice(); $('[data-ai-voicebar]').hidden = false;
      vstatus(err.name === 'NotAllowedError' ? 'Microphone permission was blocked. You can type instead.' : (err.message || 'Voice is unavailable right now.') + ' You can type instead.');
    }
  }
  async function onEvent(e) {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === 'input_audio_buffer.speech_started') panel.classList.add('is-hearing');
    if (m.type === 'input_audio_buffer.speech_stopped') panel.classList.remove('is-hearing');
    if (m.type === 'conversation.item.input_audio_transcription.completed' && m.transcript) {
      state.messages.push({ role: 'user', content: m.transcript.trim() }); save(); render(); relay({ kind: 'transcript', role: 'user', text: m.transcript });
    }
    if (m.type === 'response.output_audio_transcript.done' && m.transcript) {
      state.messages.push({ role: 'assistant', content: m.transcript.trim() }); save(); render(); relay({ kind: 'transcript', role: 'assistant', text: m.transcript });
    }
    if (m.type === 'response.done') {
      const calls = (m.response?.output || []).filter((o) => o.type === 'function_call');
      if (!calls.length) return;
      for (const c of calls) {
        let args = {}; try { args = JSON.parse(c.arguments || '{}'); } catch {}
        const out = await relay({ kind: 'tool', name: c.name, args });
        if (out.ui?.length) { state.messages.push({ role: 'assistant', content: '', ui: out.ui }); save(); render(); }
        dc?.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: c.call_id, output: JSON.stringify(out.result || {}) } }));
      }
      dc?.send(JSON.stringify({ type: 'response.create' }));
    }
  }
  function stopVoice() {
    try { dc?.close(); pc?.close(); mic?.getTracks().forEach((t) => t.stop()); if (audio) audio.srcObject = null; } catch {}
    pc = dc = mic = null; panel.classList.remove('is-voice', 'is-live', 'is-hearing'); $('[data-ai-voicebar]').hidden = true;
  }
  $('[data-ai-voicebtn]').addEventListener('click', () => (pc ? stopVoice() : startVoice()));
  $('[data-ai-hang]').addEventListener('click', stopVoice);

  // ---------------- Open / close ----------------
  let opener = null;
  function close() { stopVoice(); panel.hidden = true; document.documentElement.classList.remove('ai-open'); opener?.focus(); }
  $('[data-ai-close]').addEventListener('click', close);
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  window.mrsAI = {
    open({ mode = 'chat', topic = '', interest = '', settings = {} } = {}) {
      opener = document.activeElement; state.interest = interest; state.settings = settings;
      $('[data-ai-voicebtn]').hidden = !settings?.ai?.voiceEnabled;
      panel.hidden = false; document.documentElement.classList.add('ai-open'); render();
      track('ai_open', { label: mode + (topic ? ':' + topic : ''), page: location.pathname });
      if (mode === 'voice' && settings?.ai?.voiceEnabled) startVoice();
      else { $('#ai-input').focus(); if (topic && !state.messages.length) ask(topic); }
    },
    close,
  };
})();
