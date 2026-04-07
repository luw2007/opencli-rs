/**
 * AutoCLI Selector Tool — Content Script
 * Right-side panel with entries-based rule management.
 * Design language: AutoCLI EON Systems (sharp corners, Satoshi + JetBrains Mono)
 */

(() => {
  const _PANEL_WIDTH = 320;

  // Toggle if already active
  if (window.__autocliSelectorActive) {
    const p = document.getElementById('__osp-root');
    const o = document.getElementById('__autocli-selector-overlay');
    if (p) {
      const showing = p.style.display !== 'none';
      p.style.display = showing ? 'none' : 'block';
      if (o) o.style.display = showing ? 'none' : 'block';
      if (showing) {
        document.body.style.marginRight = window.__ospOrigMarginRight || '';
        document.body.style.overflowX = window.__ospOrigOverflowX || '';
      } else {
        window.__ospOrigMarginRight = document.body.style.marginRight;
        window.__ospOrigOverflowX = document.body.style.overflowX;
        document.body.style.marginRight = _PANEL_WIDTH + 'px';
        document.body.style.overflowX = 'hidden';
      }
    }
    return;
  }
  window.__autocliSelectorActive = true;

  const SE = window.__autocliSelectorEngine;
  if (!SE) { console.error('[autocli-selector] Engine not loaded'); return; }
  const PANEL_WIDTH = _PANEL_WIDTH;

  // ─── State ────────────────────────────────────────────────────
  let mode = 'idle';
  let hoverEl = null;
  let activeEntryId = null;
  let entries = [];
  let entryIdCounter = 0;
  const COLORS = ['#ff571a','#4ecdc4','#45b7d1','#ffd93d','#a29bfe','#fd79a8','#96ceb4','#ff8a5c','#88d8b0','#c9b1ff'];

  // ─── Shrink page ──────────────────────────────────────────────
  window.__ospOrigMarginRight = document.body.style.marginRight;
  window.__ospOrigOverflowX = document.body.style.overflowX;
  document.body.style.marginRight = PANEL_WIDTH + 'px';
  document.body.style.overflowX = 'hidden';

  // ─── Shadow DOM ───────────────────────────────────────────────
  const root = document.createElement('div');
  root.id = '__osp-root';
  root.style.cssText = `position:fixed;top:0;right:0;width:${PANEL_WIDTH}px;height:100vh;z-index:2147483647;`;
  document.documentElement.appendChild(root);

  const shadow = root.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&f[]=jet-brains-mono@400,500&display=swap');
      :host { all:initial; }
      * { margin:0; padding:0; box-sizing:border-box; }

      .panel {
        width:${PANEL_WIDTH}px; height:100vh; background:#fbfbfb;
        border-left:1px solid #e2e2e2; display:flex; flex-direction:column;
        font-family:'Satoshi',-apple-system,sans-serif; font-size:13px; color:#0f1112;
        -webkit-font-smoothing:antialiased;
      }

      /* Header */
      .header {
        display:flex; align-items:center; gap:8px; padding:12px 16px;
        border-bottom:1px solid #e2e2e2; background:#ffffff; flex-shrink:0;
      }
      .logo {
        font-family:'JetBrains Mono',monospace; font-size:14px; font-weight:700;
        color:#0f1112; letter-spacing:-0.04em; display:flex; align-items:baseline; gap:1px;
      }
      .logo-mark {
        display:inline-flex; align-items:center; justify-content:center;
        width:10px; height:12px; background:#0f1112; flex-shrink:0; align-self:center;
      }
      .logo-mark::after {
        content:''; display:block; width:2px; height:7px; background:#ff571a;
        animation:cursor-blink 1s step-end infinite;
      }
      @keyframes cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }
      .logo-cli { color:#ff571a; margin-left:-1px; }
      .logo-s { color:#aaabab; font-weight:500; margin-left:-1px; }
      .header-sep { color:#e2e2e2; font-size:14px; font-weight:300; }
      .header-sub { color:#5d5f5f; font-size:12px; font-weight:500; flex:1; }
      .icon-btn {
        background:none; border:1px solid #e2e2e2; width:28px; height:28px;
        display:flex; align-items:center; justify-content:center;
        cursor:pointer; color:#5d5f5f; font-size:13px; transition:border-color 0.2s;
      }
      .icon-btn:hover { border-color:#ff571a; color:#0f1112; }

      /* Body */
      .body { padding:12px 16px; flex:1; overflow-y:auto; }

      /* Top bar */
      .top-bar { display:flex; gap:6px; margin-bottom:12px; }
      .btn {
        display:inline-flex; align-items:center; justify-content:center; gap:5px;
        padding:7px 14px; font-family:inherit; font-size:12px; font-weight:500;
        color:#0f1112; background:#ffffff; border:1px solid #e2e2e2;
        cursor:pointer; transition:border-color 0.2s, background 0.2s; white-space:nowrap;
      }
      .btn:hover { border-color:#ff571a; background:#f0f1f1; }
      .btn-accent { color:#ffffff; background:#ff571a; border-color:#ff571a; }
      .btn-accent:hover { opacity:0.88; background:#ff571a; border-color:#ff571a; }
      .btn-sm { padding:3px 8px; font-size:10px; }
      .btn-save { color:#fff; background:#00cc66; border-color:#00cc66; }
      .btn-save:hover { opacity:0.88; }
      .btn-edit { color:#0f1112; background:#ffd93d; border-color:#ffd93d; }
      .btn-edit:hover { opacity:0.88; }
      .btn-danger { color:#ff571a; border-color:#ff571a; background:transparent; }
      .btn-danger:hover { background:rgba(255,87,26,0.06); }

      /* Status */
      .status {
        padding:8px 12px; border:1px solid #e2e2e2; background:#ffffff;
        font-size:11px; color:#5d5f5f; margin-bottom:12px; line-height:1.5;
      }
      .status b { color:#0f1112; }
      .status.success { border-color:rgba(0,204,102,0.3); background:rgba(0,204,102,0.04); color:#0f1112; }

      /* Entry card */
      .entry {
        border:1px solid #e2e2e2; margin-bottom:8px; background:#ffffff;
        transition:border-color 0.2s;
      }
      .entry.active { border-color:#ff571a; }
      .entry.saved { border-color:rgba(0,204,102,0.4); }

      .entry-head { padding:10px 12px; }
      /* Row 1: dot + name */
      .entry-top {
        display:flex; align-items:center; gap:8px;
      }
      .entry-dot { width:10px; height:10px; flex-shrink:0; }
      .entry-name-display { font-weight:700; font-size:13px; flex:1; letter-spacing:-0.3px; }
      .entry-name-input {
        border:1px solid #e2e2e2; background:#fbfbfb; font-family:inherit;
        font-size:13px; font-weight:700; padding:2px 6px; flex:1; outline:none;
        min-width:0; letter-spacing:-0.3px;
      }
      .entry-name-input:focus { border-color:#ff571a; }

      /* Row 2: tags left + buttons right */
      .entry-bar {
        display:flex; align-items:center; margin-top:8px; gap:6px;
      }
      .entry-tags { display:flex; gap:4px; flex:1; }
      .tag {
        display:inline-flex; align-items:center; padding:2px 7px; flex-shrink:0;
        font-size:10px; font-weight:500; font-family:'JetBrains Mono',monospace;
        border:1px solid #f2f2f2; color:#aaabab; background:#f0f1f1;
      }
      .tag-picking { color:#ff571a; border-color:rgba(255,87,26,0.25); background:rgba(255,87,26,0.06); }
      .tag-saved { color:#00cc66; border-color:rgba(0,204,102,0.25); background:rgba(0,204,102,0.06); }
      .entry-actions { display:flex; gap:4px; flex-shrink:0; }

      .entry-body { padding:8px 12px; border-top:1px solid #f2f2f2; }
      .entry-sel {
        background:#0f1112; color:#e0e0e0;
        font:11px/1.5 'JetBrains Mono',monospace;
        padding:6px 8px; word-break:break-all; cursor:pointer;
        transition:background 0.15s;
      }
      .entry-sel:hover { background:#1a1c1e; }
      .entry-sample {
        font-size:10px; color:#aaabab; margin-top:4px; line-height:1.3;
        font-family:'JetBrains Mono',monospace;
      }

      /* Empty state */
      .empty {
        text-align:center; color:#aaabab; padding:24px 0; font-size:12px;
        border:1px dashed #e2e2e2; margin-bottom:8px;
      }

      /* Help */
      .help {
        font-size:10px; color:#aaabab; margin-top:10px; line-height:1.5;
        font-family:'JetBrains Mono',monospace;
      }

      /* Export */
      .section { margin-top:12px; }
      .sec-title { font-size:10px; font-weight:600; text-transform:uppercase; color:#888; margin-bottom:6px; letter-spacing:0.5px; }
      .export-bar { display:flex; gap:5px; margin-bottom:6px; }
      .export-area {
        background:#0f1112; color:#e0e0e0; font:10px/1.4 'JetBrains Mono',monospace;
        padding:8px; max-height:200px; overflow-y:auto;
        white-space:pre-wrap; word-break:break-all;
      }

      /* Generate */
      .btn-generate {
        width:100%; padding:8px; margin-top:10px;
        background:#ff571a; color:#fff; border:1px solid #ff571a;
        font-size:12px; font-weight:600; cursor:pointer;
        font-family:'Satoshi',sans-serif; letter-spacing:0.3px;
      }
      .btn-generate:hover { opacity:0.88; }
      .btn-generate:disabled { opacity:0.4; cursor:not-allowed; }
      .btn-generate.loading { background:#5d5f5f; border-color:#5d5f5f; }
      .generate-result {
        background:#0f1112; color:#e0e0e0; font:11px/1.5 'JetBrains Mono',monospace;
        padding:10px; margin-top:8px; max-height:300px; overflow-y:auto;
        white-space:pre-wrap; word-break:break-all;
        border:1px solid #333;
      }
      .generate-result.streaming { border-color:#ff571a; }
      .generate-error { color:#ff571a; font-size:11px; margin-top:6px; }

      /* Toast */
      .toast {
        position:fixed; bottom:16px; left:50%; transform:translateX(-50%);
        background:#0f1112; color:#fff; padding:5px 16px;
        font-size:11px; font-family:'JetBrains Mono',monospace;
        display:none; z-index:2;
      }
    </style>

    <div class="panel">
      <div class="header">
        <span class="logo"><span class="logo-mark"></span>Auto<span class="logo-cli">CLI</span><span class="logo-s">.ai</span></span>
        <span class="header-sep">/</span>
        <span class="header-sub">Selector</span>
        <button class="icon-btn" id="s-close" title="Close">✕</button>
      </div>
      <div class="body">
        <div class="top-bar">
          <button class="btn btn-accent" id="s-add">+ New Entry</button>
        </div>
        <div class="status" id="s-status">Create entries and pick elements to build selectors.</div>
        <div id="s-entries">
          <div class="empty" id="s-empty">No entries yet</div>
        </div>
        <div class="section" id="s-sec-export" style="display:none;">
          <div class="sec-title">Export</div>
          <div class="export-bar">
            <button class="btn btn-sm" id="s-json">JSON</button>
            <button class="btn btn-sm" id="s-yaml">YAML</button>
          </div>
          <div class="export-area" id="s-export"></div>
        </div>
        <div class="section" id="s-sec-generate" style="display:none;">
          <button class="btn-generate" id="s-generate">Generate Adapter with AI</button>
          <div class="generate-result" id="s-gen-result" style="display:none;"></div>
          <div class="generate-error" id="s-gen-error" style="display:none;"></div>
        </div>
        <div class="help"><b>ESC</b> stop picking · click selector to copy</div>
      </div>
      <div class="toast" id="s-toast">copied</div>
    </div>
  `;

  const q = id => shadow.getElementById(id);
  const statusEl = q('s-status');
  const entriesEl = q('s-entries');
  const emptyEl = q('s-empty');
  const toastEl = q('s-toast');
  const exportSection = q('s-sec-export');
  const exportEl = q('s-export');
  const genSection = q('s-sec-generate');
  const genBtn = q('s-generate');
  const genResult = q('s-gen-result');
  const genError = q('s-gen-error');
  console.log('[autocli-selector] genBtn:', genBtn, 'genResult:', genResult, 'genSection:', genSection);

  function setStatus(h, t) { statusEl.innerHTML = h; statusEl.className = 'status'+(t?' '+t:''); }
  function showToast(t) { toastEl.textContent=t||'copied'; toastEl.style.display='block'; setTimeout(()=>toastEl.style.display='none',1000); }
  function copyText(t) { navigator.clipboard.writeText(t); showToast(); }
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ─── Overlay ──────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = '__autocli-selector-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483645;pointer-events:none;';
  document.documentElement.appendChild(overlay);

  const highlights = new Map();
  function addHighlight(el, color, label, eid) {
    removeHighlight(el);
    const r = el.getBoundingClientRect();
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;border:2px solid ${color};background:${color}18;pointer-events:none;z-index:2147483644;top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px;transition:all 0.15s;`;
    if (label) { const t=document.createElement('span'); t.style.cssText=`position:absolute;top:-15px;left:0;background:${color};color:#fff;font:600 9px/1 'Satoshi',sans-serif;padding:2px 5px;white-space:nowrap;`; t.textContent=label; d.appendChild(t); }
    overlay.appendChild(d); highlights.set(el, {div:d,eid});
  }
  function removeHighlight(el) { const h=highlights.get(el); if(h){h.div.remove();highlights.delete(el);} }
  function clearForEntry(eid) { for(const[el,h]of highlights){if(h.eid===eid){h.div.remove();highlights.delete(el);}} }
  function clearAllHighlights() { highlights.forEach(h=>h.div.remove()); highlights.clear(); }
  function updatePos() { highlights.forEach((h,el)=>{ const r=el.getBoundingClientRect(); Object.assign(h.div.style,{top:r.top+'px',left:r.left+'px',width:r.width+'px',height:r.height+'px'}); }); }

  const hoverDiv = document.createElement('div');
  hoverDiv.style.cssText = 'position:fixed;border:1px solid #ff571a;background:rgba(255,87,26,0.06);pointer-events:none;z-index:2147483644;display:none;';
  overlay.appendChild(hoverDiv);
  function showHover(el) { const r=el.getBoundingClientRect(); Object.assign(hoverDiv.style,{top:r.top+'px',left:r.left+'px',width:r.width+'px',height:r.height+'px',display:'block'}); }
  function hideHover() { hoverDiv.style.display='none'; }

  // ─── Events ───────────────────────────────────────────────────
  function isPanel(el) { return el && (root.contains(el) || el===root); }
  document.addEventListener('mousemove', e => { if(mode!=='picking')return; const el=e.target; if(!el||isPanel(el)||el.closest('#__autocli-selector-overlay'))return; if(el===hoverEl)return; hoverEl=el; showHover(el); }, true);
  document.addEventListener('mousedown', e => { if(mode!=='picking'||!activeEntryId)return; const el=e.target; if(!el||isPanel(el)||el.closest('#__autocli-selector-overlay'))return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation(); pickForEntry(el); }, true);
  document.addEventListener('mouseup', e => { if(mode==='picking'&&!isPanel(e.target)){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();} }, true);
  document.addEventListener('click', e => { if(mode==='picking'&&!isPanel(e.target)){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();} }, true);
  document.addEventListener('scroll', updatePos, true);
  window.addEventListener('resize', updatePos);
  document.addEventListener('keydown', e => { if(e.key==='Escape') stopPicking(); }, true);

  // ─── Entry CRUD ───────────────────────────────────────────────
  function getEntry(id) { return entries.find(e=>e.id===id); }

  function createEntry(name) {
    const id = ++entryIdCounter;
    const color = COLORS[(id-1)%COLORS.length];
    entries.push({ id, name:name||`entry_${id}`, elements:[], selector:'', matchCount:0, color, saved:false, sample:'' });
    activateEntry(id);
    render(); return id;
  }

  function deleteEntry(id) {
    clearForEntry(id);
    entries = entries.filter(e=>e.id!==id);
    if (activeEntryId===id) { activeEntryId=null; mode='idle'; hideHover(); }
    render(); updateExport();
  }

  function saveEntry(id) {
    const e = getEntry(id);
    if (!e) return;
    e.saved = true;
    if (activeEntryId===id) { activeEntryId=null; mode='idle'; hideHover(); }
    setStatus(`<b>${esc(e.name)}</b> saved`, 'success');
    render(); updateExport();
  }

  // Snapshot storage for discard
  const snapshots = new Map(); // entryId -> { name, elements[], selector, matchCount, sample }

  function editEntry(id) {
    const e = getEntry(id);
    if (!e) return;
    // Save snapshot before editing
    snapshots.set(id, { name:e.name, elements:[...e.elements], selector:e.selector, matchCount:e.matchCount, sample:e.sample });
    e.saved = false;
    activateEntry(id);
    render();
  }

  function discardEntry(id) {
    const e = getEntry(id);
    const snap = snapshots.get(id);
    if (!e || !snap) return;
    // Restore snapshot
    clearForEntry(id);
    e.name = snap.name;
    e.elements = snap.elements;
    e.selector = snap.selector;
    e.matchCount = snap.matchCount;
    e.sample = snap.sample;
    e.saved = true;
    snapshots.delete(id);
    if (activeEntryId===id) { activeEntryId=null; mode='idle'; hideHover(); }
    // Re-highlight restored elements
    e.elements.forEach(el => addHighlight(el, e.color, e.name, e.id));
    setStatus(`<b>${esc(e.name)}</b> changes discarded`, '');
    render(); updateExport();
  }

  function activateEntry(id) {
    const e = getEntry(id);
    if (!e || e.saved) return;
    activeEntryId = id;
    mode = 'picking';
    setStatus(`Picking for <b>${esc(e.name)}</b>`, '');
    render();
  }

  function pickForEntry(el) {
    const entry = getEntry(activeEntryId);
    if (!entry || entry.saved) return;
    const idx = entry.elements.indexOf(el);
    if (idx >= 0) { entry.elements.splice(idx,1); removeHighlight(el); }
    else { entry.elements.push(el); addHighlight(el, entry.color, entry.name, entry.id); }

    if (entry.elements.length === 1) {
      entry.selector = SE.cssSelector(entry.elements[0]);
      entry.matchCount = document.querySelectorAll(entry.selector).length;
    } else if (entry.elements.length >= 2) {
      const result = SE.computeListSelector(entry.elements);
      if (result) {
        entry.selector = result.full; entry.matchCount = result.matchCount;
        clearForEntry(entry.id);
        entry.elements.forEach(e => addHighlight(e, entry.color, entry.name, entry.id));
        result.itemElements.forEach(item => { if(!entry.elements.includes(item)) addHighlight(item, entry.color, '', entry.id); });
      } else {
        entry.selector = entry.elements.map(e=>SE.cssSelector(e)).join(', ');
        entry.matchCount = entry.elements.length;
      }
    } else { entry.selector=''; entry.matchCount=0; }

    entry.sample = entry.elements[0] ? entry.elements[0].textContent.trim().substring(0,50) : '';
    setStatus(`<b>${esc(entry.name)}</b> — ${entry.matchCount} matched`, 'success');
    render(); updateExport();
  }

  function stopPicking() { mode='idle'; activeEntryId=null; hideHover(); setStatus('Stopped',''); render(); }

  // ─── Render ───────────────────────────────────────────────────
  function render() {
    emptyEl.style.display = entries.length===0 ? 'block' : 'none';
    entriesEl.querySelectorAll('.entry').forEach(el=>el.remove());

    entries.forEach(entry => {
      const isActive = activeEntryId===entry.id;
      const card = document.createElement('div');
      card.className = 'entry' + (isActive?' active':'') + (entry.saved?' saved':'');

      const head = document.createElement('div');
      head.className = 'entry-head';

      // Row 1: dot + name + tags
      const topRow = document.createElement('div');
      topRow.className = 'entry-top';

      const dot = document.createElement('span');
      dot.className = 'entry-dot';
      dot.style.background = entry.color;
      topRow.appendChild(dot);

      if (entry.saved) {
        const nm = document.createElement('span');
        nm.className = 'entry-name-display';
        nm.textContent = entry.name;
        topRow.appendChild(nm);
      } else {
        const inp = document.createElement('input');
        inp.className = 'entry-name-input';
        inp.value = entry.name;
        inp.addEventListener('change', () => { entry.name = inp.value.trim()||entry.name; updateExport(); });
        inp.addEventListener('click', e => e.stopPropagation());
        topRow.appendChild(inp);
      }

      head.appendChild(topRow);

      // Row 2: tags (left) + buttons (right)
      const bar = document.createElement('div');
      bar.className = 'entry-bar';

      const tagsDiv = document.createElement('div');
      tagsDiv.className = 'entry-tags';

      if (isActive) {
        const tag = document.createElement('span');
        tag.className = 'tag tag-picking'; tag.textContent = 'picking';
        tagsDiv.appendChild(tag);
      } else if (entry.saved) {
        const tag = document.createElement('span');
        tag.className = 'tag tag-saved'; tag.textContent = 'saved';
        tagsDiv.appendChild(tag);
      }
      if (entry.matchCount > 0) {
        const tag = document.createElement('span');
        tag.className = 'tag'; tag.textContent = entry.matchCount + ' matched';
        tagsDiv.appendChild(tag);
      }

      bar.appendChild(tagsDiv);

      const actions = document.createElement('div');
      actions.className = 'entry-actions';

      if (entry.saved) {
        const b = document.createElement('button');
        b.className = 'btn btn-sm btn-edit'; b.textContent = 'Edit';
        b.addEventListener('click', e => { e.stopPropagation(); editEntry(entry.id); });
        actions.appendChild(b);
      } else {
        if (!isActive) {
          const b = document.createElement('button');
          b.className = 'btn btn-sm'; b.textContent = 'Pick';
          b.addEventListener('click', e => { e.stopPropagation(); activateEntry(entry.id); });
          actions.appendChild(b);
        }
        if (entry.selector) {
          const b = document.createElement('button');
          b.className = 'btn btn-sm btn-save'; b.textContent = 'Save';
          b.addEventListener('click', e => { e.stopPropagation(); saveEntry(entry.id); });
          actions.appendChild(b);
        }
        if (snapshots.has(entry.id)) {
          const b = document.createElement('button');
          b.className = 'btn btn-sm btn-danger'; b.textContent = 'Discard';
          b.addEventListener('click', e => { e.stopPropagation(); discardEntry(entry.id); });
          actions.appendChild(b);
        }
      }
      const del = document.createElement('button');
      del.className = 'btn btn-sm btn-danger'; del.textContent = '✕';
      del.addEventListener('click', e => { e.stopPropagation(); deleteEntry(entry.id); });
      actions.appendChild(del);

      bar.appendChild(actions);
      head.appendChild(bar);
      card.appendChild(head);

      // Body
      if (entry.selector) {
        const body = document.createElement('div');
        body.className = 'entry-body';
        const sel = document.createElement('div');
        sel.className = 'entry-sel';
        sel.textContent = entry.selector;
        sel.title = 'Click to copy';
        sel.addEventListener('click', () => copyText(entry.selector));
        body.appendChild(sel);
        if (entry.sample) {
          const s = document.createElement('div');
          s.className = 'entry-sample';
          s.textContent = entry.sample;
          body.appendChild(s);
        }
        card.appendChild(body);
      }
      entriesEl.appendChild(card);
    });
  }

  // ─── Export ────────────────────────────────────────────────────
  function updateExport() {
    const saved = entries.filter(e=>e.selector);
    if (!saved.length) {
      window.__autocliSelectorExport = null;
      exportSection.style.display = 'none';
      genSection.style.display = 'none';
      return;
    }
    const data = {
      url: location.href,
      title: document.title,
      entries: saved.map(e=>({ name:e.name, selector:e.selector, matchCount:e.matchCount, saved:e.saved, sample:e.sample||'' })),
    };
    window.__autocliSelectorExport = data;
    exportSection.style.display = 'block';
    genSection.style.display = 'block';
    exportEl.textContent = JSON.stringify(data, null, 2);
  }

  // ─── Panel buttons ────────────────────────────────────────────
  q('s-add').addEventListener('click', () => {
    const name = prompt('Entry name:');
    if (name===null) return;
    createEntry(name.trim());
  });

  // Blocks button removed from UI

  q('s-json').addEventListener('click', () => {
    if (window.__autocliSelectorExport) {
      copyText(JSON.stringify(window.__autocliSelectorExport, null, 2));
    }
  });

  q('s-yaml').addEventListener('click', () => {
    const d = window.__autocliSelectorExport;
    if (!d) return;
    let y = `# AutoCLI Selector\n# ${d.url}\ntitle: "${d.title || ''}"\n\nentries:\n`;
    d.entries.forEach(e => {
      y += `  ${e.name}:\n    selector: "${e.selector}"\n    match_count: ${e.matchCount}\n`;
    });
    copyText(y);
  });

  // ─── Generate with AI ──────────────────────────────────────────
  genBtn.addEventListener('click', () => {
    console.log('[autocli-selector] Generate button clicked');
    const exportData = window.__autocliSelectorExport;
    if (!exportData) { console.log('[autocli-selector] No export data'); return; }

    // Disable button, show loading
    genBtn.disabled = true;
    genBtn.textContent = 'Cleaning DOM...';
    genBtn.classList.add('loading');
    genResult.style.display = 'block';
    genResult.textContent = '';
    genResult.classList.add('streaming');
    genError.style.display = 'none';

    (async () => {
    try {
      // Step 1: Clean DOM
      console.log('[autocli-selector] Starting DOM clean...');
      let domTree = '';
      try {
        const DC = window.__autocliDomClean;
        if (DC) {
          const jsCode = DC.fullCleanPipelineJs({ scrollPages: 2 });
          domTree = await eval(jsCode);
          console.log('[autocli-selector] DOM cleaned, length:', domTree.length);
        } else {
          console.log('[autocli-selector] DomClean not available, using fallback');
          domTree = document.documentElement.outerHTML.substring(0, 30000);
        }
      } catch(cleanErr) {
        console.error('[autocli-selector] DOM clean error:', cleanErr);
        domTree = document.documentElement.outerHTML.substring(0, 30000);
      }

      genBtn.textContent = 'Generating...';

      // Step 2: Build request body
      const capturedData = {
        url: exportData.url,
        title: exportData.title || document.title,
        entries: exportData.entries,
        dom_tree: domTree,
      };

      // Step 3: Call daemon proxy (daemon adds token and forwards to autocli.ai)
      const DAEMON_PORT = 19825;
      const resp = await fetch(`http://localhost:${DAEMON_PORT}/ai-generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          captured_data: capturedData,
          stream: true,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`${resp.status}: ${errText.substring(0, 200)}`);
      }

      // Step 4: Read SSE stream
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              genResult.textContent = fullContent;
              genResult.scrollTop = genResult.scrollHeight;
            }
          } catch(e) { /* skip unparseable chunks */ }
        }
      }

      genResult.classList.remove('streaming');
      if (!fullContent) {
        genError.textContent = 'AI returned empty response';
        genError.style.display = 'block';
      }

    } catch(e) {
      console.error('[autocli-selector] Generate error:', e);
      genResult.classList.remove('streaming');
      genError.textContent = e.message;
      genError.style.display = 'block';
    } finally {
      genBtn.disabled = false;
      genBtn.textContent = 'Generate Adapter with AI';
      genBtn.classList.remove('loading');
    }
    })();
  });

  q('s-close').addEventListener('click', () => {
    stopPicking(); clearAllHighlights();
    root.style.display='none'; overlay.style.display='none';
    document.body.style.marginRight = window.__ospOrigMarginRight||'';
    document.body.style.overflowX = window.__ospOrigOverflowX||'';
  });

  console.log('[autocli-selector] Loaded');
})();
