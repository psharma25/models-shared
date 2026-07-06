/* BitSense AI addon — universal client
 * Works on ANY BitSense tool. Adds a floating "✦ AI" button in the bottom-right
 * corner. No CDN, no build, no code changes required in the host tool.
 *
 * Two ways to use:
 *
 *   1. Bookmarklet (zero code changes):
 *        javascript:(function(){var s=document.createElement('script');
 *        s.src='https://YOUR-USERNAME.github.io/bitsense-shared/ai-addon.js';
 *        document.body.appendChild(s);})();
 *
 *   2. Permanent — add ONE line before </body> in any tool's HTML:
 *        <script src="https://YOUR-USERNAME.github.io/bitsense-shared/ai-addon.js"></script>
 *
 * First run on any domain: click ⚙ in the AI panel, paste your Worker URL,
 * pick a model. Preferences persist per-domain in localStorage.
 */
(function () {
  'use strict';
  if (window.__bitsenseAI) return; // idempotent — safe to double-load
  window.__bitsenseAI = true;

  const LS_URL = 'bitsense.ai.workerUrl';
  const LS_MODEL = 'bitsense.ai.modelId';

  const state = {
    workerUrl: localStorage.getItem(LS_URL) || '',
    modelId: localStorage.getItem(LS_MODEL) || '',
    models: [],
    loading: false
  };

  // ---------- STYLES (namespaced, no host-page collisions) ----------
  const css = `
  .bai-fab{position:fixed;bottom:20px;right:20px;z-index:2147483000;
    background:#0E7C86;color:#fff;border:none;border-radius:999px;padding:12px 18px;
    font:600 13px/1 Inter,system-ui,-apple-system,sans-serif;cursor:pointer;
    box-shadow:0 6px 20px rgba(14,124,134,.35);transition:transform .15s}
  .bai-fab:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(14,124,134,.45)}
  .bai-scrim{position:fixed;inset:0;background:rgba(14,23,38,.55);z-index:2147483001;display:none}
  .bai-scrim.on{display:block}
  .bai-panel{position:fixed;bottom:80px;right:20px;z-index:2147483002;
    background:#fff;border:1px solid #E3E8EF;border-radius:12px;
    width:min(440px,calc(100vw - 40px));max-height:calc(100vh - 120px);
    display:none;flex-direction:column;box-shadow:0 20px 60px rgba(14,23,38,.35);
    font-family:Inter,system-ui,-apple-system,sans-serif;color:#172234}
  .bai-panel.on{display:flex}
  .bai-panel header{padding:14px 16px;border-bottom:1px solid #E3E8EF;
    display:flex;align-items:center;justify-content:space-between;gap:8px}
  .bai-panel header h3{margin:0;font:600 14px/1.2 'Space Grotesk',Inter,sans-serif}
  .bai-panel .hbtn{background:none;border:1px solid #E3E8EF;color:#172234;
    border-radius:6px;padding:5px 9px;font:500 11px/1 Inter,sans-serif;cursor:pointer}
  .bai-panel .hbtn:hover{background:#F4F6FA}
  .bai-panel .close{background:none;border:none;font-size:22px;color:#647087;
    cursor:pointer;line-height:1;padding:0 4px}
  .bai-panel .body{padding:12px 16px;overflow:auto;flex:1;
    display:flex;flex-direction:column;gap:10px}
  .bai-panel footer{padding:10px 16px;border-top:1px solid #E3E8EF;
    display:flex;gap:8px;justify-content:space-between;align-items:center}
  .bai-field{display:flex;flex-direction:column;gap:4px}
  .bai-field label{font:600 10px/1.2 Inter,sans-serif;color:#647087;
    text-transform:uppercase;letter-spacing:.05em}
  .bai-field input, .bai-field select, .bai-field textarea{
    width:100%;padding:8px 10px;border:1px solid #E3E8EF;border-radius:8px;
    font:400 13px/1.4 Inter,sans-serif;color:#172234;background:#fff;
    box-sizing:border-box}
  .bai-field textarea{min-height:70px;resize:vertical;
    font-family:'JetBrains Mono',monospace;font-size:12px}
  .bai-primary{background:#3A56C5;color:#fff;border:none;border-radius:8px;
    padding:8px 14px;font:600 13px/1 Inter,sans-serif;cursor:pointer}
  .bai-primary:hover{background:#2E45A6}
  .bai-primary[disabled]{opacity:.5;cursor:not-allowed}
  .bai-out{background:#F4F6FA;border:1px solid #E3E8EF;border-radius:8px;
    padding:10px 12px;font:400 13px/1.55 Inter,sans-serif;white-space:pre-wrap;
    color:#172234;min-height:50px;max-height:280px;overflow:auto}
  .bai-out .err{color:#a1272e}
  .bai-hint{font:400 11px/1.4 Inter,sans-serif;color:#647087}
  .bai-ctx-toggle{display:flex;align-items:center;gap:6px;
    font:500 11px/1 Inter,sans-serif;color:#647087;cursor:pointer;user-select:none}
  .bai-ctx-toggle input{margin:0}
  .bai-model-label{font:500 12px/1.4 Inter,sans-serif;color:#172234}
  .bai-tag{display:inline-block;font:600 9px/1 Inter,sans-serif;padding:3px 5px;
    border-radius:4px;text-transform:uppercase;letter-spacing:.05em;margin-left:4px;
    vertical-align:middle}
  .bai-tag.free{background:#E2F4EC;color:#1E8A63}
  .bai-tag.paid{background:#FBEFD9;color:#B5731B}
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ---------- DOM ----------
  const fab = el('button', { class: 'bai-fab', title: 'BitSense AI' });
  fab.innerHTML = '✦ AI';
  document.body.appendChild(fab);

  const scrim = el('div', { class: 'bai-scrim' });
  document.body.appendChild(scrim);

  const panel = el('div', { class: 'bai-panel' });
  panel.innerHTML = `
    <header>
      <h3>BitSense AI</h3>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="hbtn" data-view="ask">Ask</button>
        <button class="hbtn" data-view="settings">⚙</button>
        <button class="close" data-close aria-label="Close">×</button>
      </div>
    </header>

    <div class="body" data-panel="ask">
      <div class="bai-field">
        <label>Model</label>
        <div class="bai-model-label" id="bai-current-model">
          <span class="bai-hint">Open ⚙ to set Worker URL and pick a model</span>
        </div>
      </div>
      <div class="bai-field">
        <label for="bai-q">Your question</label>
        <textarea id="bai-q" placeholder="Ask about this page, or anything else…"></textarea>
        <label class="bai-ctx-toggle">
          <input type="checkbox" id="bai-use-ctx" checked>
          Send visible page text as context
        </label>
      </div>
      <div class="bai-field">
        <label>Answer</label>
        <div class="bai-out" id="bai-answer">—</div>
      </div>
    </div>

    <div class="body" data-panel="settings" style="display:none">
      <div class="bai-field">
        <label for="bai-worker-url">Worker URL</label>
        <input id="bai-worker-url" type="url"
          placeholder="https://llm-proxy.YOUR-ACCOUNT.workers.dev" />
        <div class="bai-hint">Root URL of your Cloudflare Worker (no trailing slash).</div>
      </div>
      <div class="bai-field">
        <label for="bai-model-select">Model</label>
        <select id="bai-model-select">
          <option value="">— enter Worker URL first —</option>
        </select>
        <div class="bai-hint" id="bai-model-hint"></div>
      </div>
    </div>

    <footer>
      <div class="bai-hint" id="bai-footer-hint">Ctrl+Enter to send</div>
      <div style="display:flex;gap:8px">
        <button class="bai-primary" id="bai-action">Ask</button>
      </div>
    </footer>
  `;
  document.body.appendChild(panel);

  // ---------- EVENT WIRING ----------
  fab.addEventListener('click', togglePanel);
  scrim.addEventListener('click', closePanel);
  panel.querySelector('[data-close]').addEventListener('click', closePanel);

  panel.querySelectorAll('[data-view]').forEach(b =>
    b.addEventListener('click', () => switchView(b.dataset.view))
  );

  document.getElementById('bai-worker-url').addEventListener('change', async (e) => {
    state.workerUrl = e.target.value.trim().replace(/\/+$/, '');
    await loadModels();
    populateModelSelect();
  });

  document.getElementById('bai-action').addEventListener('click', () => {
    const view = currentView();
    if (view === 'settings') saveSettings();
    else runAsk();
  });

  document.getElementById('bai-q').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runAsk();
  });

  // Warm the model list on load if we already have a URL
  if (state.workerUrl) loadModels().then(() => updateCurrentModelLabel());

  // ---------- ACTIONS ----------
  function togglePanel() {
    if (panel.classList.contains('on')) closePanel();
    else openPanel();
  }
  function openPanel() {
    scrim.classList.add('on');
    panel.classList.add('on');
    switchView(state.workerUrl && state.modelId ? 'ask' : 'settings');
    updateCurrentModelLabel();
  }
  function closePanel() {
    scrim.classList.remove('on');
    panel.classList.remove('on');
  }

  function currentView() {
    return panel.querySelector('[data-panel="settings"]').style.display === 'none' ? 'ask' : 'settings';
  }
  function switchView(view) {
    panel.querySelector('[data-panel="ask"]').style.display = view === 'ask' ? '' : 'none';
    panel.querySelector('[data-panel="settings"]').style.display = view === 'settings' ? '' : 'none';
    document.getElementById('bai-action').textContent = view === 'settings' ? 'Save' : 'Ask';
    document.getElementById('bai-footer-hint').textContent =
      view === 'settings' ? 'Saved to this browser only' : 'Ctrl+Enter to send';
    if (view === 'settings') {
      document.getElementById('bai-worker-url').value = state.workerUrl;
      populateModelSelect();
    }
  }

  async function loadModels() {
    if (!state.workerUrl) { state.models = []; return; }
    state.loading = true;
    try {
      const r = await fetch(state.workerUrl + '/models');
      const j = await r.json();
      state.models = Array.isArray(j.models) ? j.models : [];
    } catch { state.models = []; }
    state.loading = false;
  }

  function populateModelSelect() {
    const sel = document.getElementById('bai-model-select');
    const hint = document.getElementById('bai-model-hint');
    if (!state.workerUrl) {
      sel.innerHTML = '<option value="">— enter Worker URL first —</option>';
      hint.textContent = '';
      return;
    }
    if (state.loading) {
      sel.innerHTML = '<option>Loading…</option>';
      return;
    }
    if (!state.models.length) {
      sel.innerHTML = '<option value="">No models — check Worker URL</option>';
      hint.textContent = 'The Worker returned no models. Verify the URL and provider keys.';
      return;
    }
    sel.innerHTML = state.models.map(m =>
      `<option value="${m.id}">${escapeHtml(m.displayName)}${m.tier === 'free' ? ' — free' : ''}</option>`
    ).join('');
    if (state.modelId && state.models.find(m => m.id === state.modelId)) {
      sel.value = state.modelId;
    } else {
      state.modelId = sel.value;
    }
    updateHint();
    sel.onchange = () => { state.modelId = sel.value; updateHint(); };
    function updateHint() {
      const m = state.models.find(x => x.id === sel.value);
      hint.textContent = m ? m.notes : '';
    }
  }

  function saveSettings() {
    state.workerUrl = document.getElementById('bai-worker-url').value.trim().replace(/\/+$/, '');
    state.modelId = document.getElementById('bai-model-select').value;
    localStorage.setItem(LS_URL, state.workerUrl);
    localStorage.setItem(LS_MODEL, state.modelId);
    updateCurrentModelLabel();
    switchView('ask');
  }

  function updateCurrentModelLabel() {
    const el = document.getElementById('bai-current-model');
    if (!state.workerUrl || !state.modelId) {
      el.innerHTML = '<span class="bai-hint">Open ⚙ to set Worker URL and pick a model</span>';
      return;
    }
    const m = state.models.find(x => x.id === state.modelId);
    if (m) {
      el.innerHTML = `${escapeHtml(m.displayName)} <span class="bai-tag ${m.tier}">${m.tier}</span>`;
    } else {
      el.textContent = state.modelId;
    }
  }

  async function runAsk() {
    const action = document.getElementById('bai-action');
    const out = document.getElementById('bai-answer');
    const q = document.getElementById('bai-q').value.trim();
    if (!state.workerUrl) { switchView('settings'); return; }
    if (!state.modelId) { switchView('settings'); return; }
    if (!q) { out.textContent = 'Type a question first.'; return; }

    const useCtx = document.getElementById('bai-use-ctx').checked;
    const ctx = useCtx ? extractPageContext() : '';

    const system = [
      'You are a senior GRC / product-security assistant helping a professional',
      'review or draft technical documents. Be concrete, cite exact clauses when',
      'referencing provided context, and flag ambiguity. Keep answers under 400',
      'words unless the user asks for more.'
    ].join(' ');

    const userMsg = ctx
      ? `--- PAGE CONTEXT (truncated) ---\n${ctx}\n--- END CONTEXT ---\n\nQuestion: ${q}`
      : q;

    action.disabled = true;
    out.textContent = 'Thinking…';

    try {
      const r = await fetch(state.workerUrl + '/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: state.modelId,
          system,
          messages: [{ role: 'user', content: userMsg }],
          max_tokens: 1500,
          temperature: 0.4
        })
      });
      const j = await r.json();
      if (!r.ok) {
        out.innerHTML = `<span class="err">Error ${r.status}: ${escapeHtml(j.error || 'unknown')}</span>${
          j.detail ? `<div class="bai-hint" style="margin-top:6px">${escapeHtml(String(j.detail).slice(0, 400))}</div>` : ''
        }`;
      } else {
        out.textContent = j.text || '(empty response)';
      }
    } catch (e) {
      out.innerHTML = `<span class="err">Network error: ${escapeHtml(String(e))}</span>`;
    } finally {
      action.disabled = false;
    }
  }

  // ---------- CONTEXT EXTRACTION ----------
  // Grab the "main" content of the page: prefers an open sheet/dialog, then
  // <main>, then the largest visible text container. Works across all tools.
  function extractPageContext() {
    const MAX = 60_000;
    const candidates = [
      document.querySelector('.sheet.on'),           // BitSense document sheet
      document.querySelector('[role="dialog"]:not([aria-hidden="true"])'),
      document.querySelector('main'),
      document.querySelector('#app'),
      document.querySelector('.content'),
      document.body
    ].filter(Boolean);

    let best = candidates[0];
    let bestLen = 0;
    for (const c of candidates) {
      const t = (c.innerText || '').trim();
      if (t.length > bestLen) { bestLen = t.length; best = c; }
    }
    const text = (best?.innerText || '').trim();
    if (!text) return '';
    return text.length > MAX ? text.slice(0, MAX) + '\n\n[...truncated...]' : text;
  }

  // ---------- UTIL ----------
  function el(tag, attrs) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
})();
