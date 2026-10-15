'use strict';
/* Velaris UI — ChatGPT / Codex style. No framework, no build step.
   Conversations live in this browser's localStorage only (no account). */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const escapeHtml = (t) => String(t).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

// ───────────────────────────── Icons ─────────────────────────────
const P = {
  logo: '<path d="M4.5 5.5L12 19.5l7.5-14"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="3.5"/><path d="M9.5 4v16"/>',
  compose: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrowup: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowdown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  chevronr: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4.5A2.5 2.5 0 012 12.5v-8A2.5 2.5 0 014.5 2h8A2.5 2.5 0 0115 4.5V5"/>',
  thumbup: '<path d="M7 10v11"/><path d="M15 5.9L14 10h5.8a2 2 0 011.9 2.6l-2.3 8a2 2 0 01-1.9 1.4H4a2 2 0 01-2-2v-8a2 2 0 012-2h2.8a2 2 0 001.8-1.1L12 2a3.1 3.1 0 013 3.9z"/>',
  thumbdown: '<path d="M17 14V3"/><path d="M9 18.1L10 14H4.2a2 2 0 01-1.9-2.6l2.3-8A2 2 0 016.5 2H20a2 2 0 012 2v8a2 2 0 01-2 2h-2.8a2 2 0 00-1.8 1.1L12 22a3.1 3.1 0 01-3-3.9z"/>',
  refresh: '<path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
  code: '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  loader: '<path d="M12 3a9 9 0 019 9"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>',
  cube: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 22V12M21 7l-9 5-9-5"/>',
  doc: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  slides: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  table: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M9 5v14"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  globe2: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
};
const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
const hydrateIcons = (root = document) => $$('[data-icon]', root).forEach(n => { if (!n.firstChild) n.innerHTML = icon(n.dataset.icon); });

// ───────────────────────────── Theme ─────────────────────────────
const prefs = (() => { try { return JSON.parse(localStorage.getItem('velaris.prefs')) || {}; } catch { return {}; } })();
const savePrefs = () => { try { localStorage.setItem('velaris.prefs', JSON.stringify({ model: state.model, power: state.power, sidebarCollapsed: state.sidebarCollapsed })); } catch {} };
const themePref = () => { try { return localStorage.getItem('velaris.theme') || 'system'; } catch { return 'system'; } };
function applyTheme() {
  const pref = themePref();
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#themeBtn').innerHTML = icon(dark ? 'sun' : 'moon');
  $$('[data-theme-set]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeSet === pref)));
}
function setTheme(pref) { try { localStorage.setItem('velaris.theme', pref); } catch {} applyTheme(); }

// ───────────────────────────── File types ─────────────────────────────
const FT = {
  docx: ['#2b579a', 'DOC'], doc: ['#2b579a', 'DOC'], xlsx: ['#1d7a46', 'XLS'], csv: ['#1d7a46', 'CSV'], tsv: ['#1d7a46', 'TSV'], pptx: ['#c43e1c', 'PPT'],
  pdf: ['#d92d20', 'PDF'], stl: ['#7c3aed', '3D'], png: ['#0891b2', 'IMG'], jpg: ['#0891b2', 'IMG'], jpeg: ['#0891b2', 'IMG'], webp: ['#0891b2', 'IMG'], gif: ['#0891b2', 'GIF'],
  glb: ['#7c3aed', '3D'],
  svg: ['#d97706', 'SVG'], html: ['#e44d26', 'HTML'], htm: ['#e44d26', 'HTML'], css: ['#2563eb', 'CSS'], js: ['#a16207', 'JS'], mjs: ['#a16207', 'JS'], ts: ['#2563eb', 'TS'],
  tsx: ['#2563eb', 'TSX'], jsx: ['#a16207', 'JSX'], py: ['#3776ab', 'PY'], json: ['#52525b', 'JSON'], md: ['#475569', 'MD'], txt: ['#64748b', 'TXT'], zip: ['#6b7280', 'ZIP'],
  sh: ['#16a34a', 'SH'], sql: ['#0d9488', 'SQL'], yml: ['#a21caf', 'YML'], yaml: ['#a21caf', 'YML'], xml: ['#ea580c', 'XML'], java: ['#b45309', 'JAVA'],
  c: ['#0369a1', 'C'], cpp: ['#0369a1', 'C++'], go: ['#0891b2', 'GO'], rs: ['#9a3412', 'RS'], rb: ['#be123c', 'RB'], php: ['#6d28d9', 'PHP'],
};
const extOf = (p) => { const i = p.lastIndexOf('.'); return i < 0 ? '' : p.slice(i + 1).toLowerCase(); };
const ftype = (p) => FT[extOf(p)] || ['#64748b', (extOf(p) || 'FILE').slice(0, 4).toUpperCase()];
const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);
function formatBytes(n) { if (n < 1024) return `${n} B`; if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`; return `${(n / 1048576).toFixed(1)} MB`; }
function secs(s) { s = Math.max(1, Math.round(s)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; }
const wsUrl = (base, ws, path) => `${base}/${ws}/${path.split('/').map(encodeURIComponent).join('/')}`;

// ───────────────────────────── Syntax highlighting ─────────────────────────────
const KW = new Set(('def class return if elif else for while import from as try except finally with lambda yield async await const let var function new this null true false True False None in is not and or ' +
  'typeof void switch case break continue default export extends static public private protected int float double string bool boolean char struct enum interface type package fn pub impl use mod match loop ' +
  'self super throw throws catch do goto namespace using template typename undefined NaN Infinity pass raise global nonlocal del assert print echo then fi done esac select where val fun override abstract final readonly').split(' '));
const RE_BODY = String.raw`("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|` + '`(?:[^`\\\\]|\\\\.)*`' + String.raw`)|(\b0x[\da-fA-F]+\b|\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_$][\w$]*\b)|([\s\S])`;
const RE_GENERIC = new RegExp(String.raw`(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|` + RE_BODY, 'g');
const RE_HASH = new RegExp(String.raw`(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*)|` + RE_BODY, 'g');
const RE_MARKUP = /(<!--[\s\S]*?-->)|(<\/?[A-Za-z][\w:-]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([\s\S])/g;
const HASH_LANGS = /^(py|python|sh|bash|shell|zsh|yaml|yml|toml|ini|rb|ruby|r|dockerfile|makefile|conf|perl|ps1|env)$/;
const MARKUP_LANGS = /^(html|htm|xml|svg|xhtml|vue)$/;

function highlight(code, lang) {
  lang = (lang || '').toLowerCase();
  if (code.length > 120000) return escapeHtml(code);
  if (MARKUP_LANGS.test(lang)) {
    return code.replace(RE_MARKUP, (m, cm, tag, str) => cm ? `<span class="tok-c">${escapeHtml(cm)}</span>` : tag ? `<span class="tok-t">${escapeHtml(tag)}</span>` : str ? `<span class="tok-s">${escapeHtml(str)}</span>` : escapeHtml(m));
  }
  const re = HASH_LANGS.test(lang) ? RE_HASH : RE_GENERIC;
  return code.replace(re, (m, com, str, num, id, other, off, whole) => {
    if (com) return `<span class="tok-c">${escapeHtml(com)}</span>`;
    if (str) return `<span class="tok-s">${escapeHtml(str)}</span>`;
    if (num) return `<span class="tok-n">${num}</span>`;
    if (id) {
      if (KW.has(id)) return `<span class="tok-k">${id}</span>`;
      if (whole[off + m.length] === '(') return `<span class="tok-f">${id}</span>`;
      return id;
    }
    return escapeHtml(m);
  });
}

// ───────────────────────────── Markdown ─────────────────────────────
// Everything is HTML-escaped first, so model output can never inject markup.
function inlineMd(line) {
  let out = line.replace(/`([^`\n]+)`/g, '<code class="inline">$1</code>');
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/~~(.+?)~~/g, '<del>$1</del>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}
const codeBlockHtml = (lang, code) => `<div class="codeblock"><div class="code-head"><span>${escapeHtml(lang || 'code')}</span><button type="button" class="code-copy">${icon('copy')}<span>Copy code</span></button></div><pre><code>${highlight(code, lang)}</code></pre></div>`;

function renderMarkdown(text) {
  const blocks = [];
  let raw = String(text || '').replace(/```([\w+#.-]*)[^\S\n]*\n?([\s\S]*?)```/g, (m, lang, code) => { blocks.push([lang, code.replace(/\n$/, '')]); return `\u0000CB${blocks.length - 1}\u0000`; });
  raw = raw.replace(/```([\w+#.-]*)[^\S\n]*\n?([\s\S]*)$/, (m, lang, code) => { blocks.push([lang, code.replace(/\n$/, '')]); return `\u0000CB${blocks.length - 1}\u0000`; }); // unfinished fence while streaming
  const lines = escapeHtml(raw).split('\n');

  let html = '', para = [], stack = [];
  const flushPara = () => { if (para.length) { html += `<p>${para.join('<br>')}</p>`; para = []; } };
  const closeLists = () => { while (stack.length) html += `</li></${stack.pop().tag}>`; };
  const isSep = l => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l || '') && (l || '').includes('-');
  const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('|') && isSep(lines[i + 1])) {
      flushPara(); closeLists();
      const head = cells(line), aligns = cells(lines[i + 1]).map(c => c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left');
      let rows = ''; i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows += '<tr>' + cells(lines[i]).map((c, k) => `<td style="text-align:${aligns[k] || 'left'}">${inlineMd(c)}</td>`).join('') + '</tr>'; i++; }
      i--;
      html += `<div class="md-table-wrap"><table class="md-table"><thead><tr>${head.map((c, k) => `<th style="text-align:${aligns[k] || 'left'}">${inlineMd(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
      continue;
    }
    const cb = line.match(/^\u0000CB(\d+)\u0000$/);
    const heading = line.match(/^(#{1,4})\s+(.*)/);
    const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)/);
    const quote = line.match(/^&gt;\s?(.*)/);
    if (cb) { flushPara(); closeLists(); html += `\u0000CB${cb[1]}\u0000`; }
    else if (heading) { flushPara(); closeLists(); html += `<div class="md-h${heading[1].length}">${inlineMd(heading[2])}</div>`; }
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); closeLists(); html += '<hr>'; }
    else if (item) {
      flushPara();
      const indent = item[1].length, tag = /\d/.test(item[2]) ? 'ol' : 'ul';
      while (stack.length && indent < stack[stack.length - 1].indent) html += `</li></${stack.pop().tag}>`;
      const top = stack[stack.length - 1];
      if (!top || indent > top.indent) { stack.push({ indent, tag }); html += `<${tag}>`; }
      else if (top.tag !== tag) { html += `</li></${stack.pop().tag}>`; stack.push({ indent, tag }); html += `<${tag}>`; }
      else html += '</li>';
      html += `<li>${inlineMd(item[3])}`;
    }
    else if (quote) { flushPara(); closeLists(); html += `<blockquote>${inlineMd(quote[1])}</blockquote>`; }
    else if (line.trim() === '') { flushPara(); }
    else { closeLists(); para.push(inlineMd(line)); }
  }
  flushPara(); closeLists();
  return html.replace(/\u0000CB(\d+)\u0000/g, (m, i) => codeBlockHtml(blocks[i][0], blocks[i][1]));
}

// Server appends build notes (ℹ️ / ⚠️ / ❌ lines) to the reply; show them apart from the answer.
function splitNotes(text) {
  const lines = String(text || '').split('\n');
  let end = lines.length;
  while (end > 0 && (lines[end - 1].trim() === '' || /^(ℹ️|⚠️|❌)/.test(lines[end - 1].trim()))) end--;
  const notes = lines.slice(end).map(l => l.trim()).filter(Boolean);
  return { body: lines.slice(0, end).join('\n').trimEnd(), notes };
}

// ───────────────────────────── State ─────────────────────────────
const CONV_KEY = 'velaris.conversations.v2';
const FILE_TTL_MS = 2 * 60 * 60 * 1000; // server prunes workspaces after 2h
const state = {
  model: prefs.model || '', power: prefs.power || 'medium', models: [], webSearch: false, webSearchAvailable: false, build: false,
  conversations: {}, activeId: null, sending: false, controller: null, sidebarCollapsed: !!prefs.sidebarCollapsed,
  stick: true, filter: '', images: [], uploading: false,
};
const scroller = $('#scroller'), thread = $('#conversation'), promptEl = $('#prompt'), sendBtn = $('#send');
const mobile = () => matchMedia('(max-width: 820px)').matches;

function loadConversations() { try { return JSON.parse(localStorage.getItem(CONV_KEY)) || {}; } catch { return {}; } }
function saveConversations() {
  try { localStorage.setItem(CONV_KEY, JSON.stringify(state.conversations)); }
  catch { // storage full: drop the oldest chats and retry once
    const keep = Object.values(state.conversations).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 15);
    state.conversations = Object.fromEntries(keep.map(c => [c.id, c]));
    try { localStorage.setItem(CONV_KEY, JSON.stringify(state.conversations)); } catch {}
  }
}
const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const activeConv = () => state.conversations[state.activeId];
const titleFor = (t) => { t = t.trim().replace(/\s+/g, ' '); return t.length > 48 ? t.slice(0, 48) + '…' : (t || 'New chat'); };
function ensureConv() {
  if (activeConv()) return activeConv();
  const id = newId();
  state.conversations[id] = { id, title: null, messages: [], updatedAt: Date.now() };
  state.activeId = id;
  return state.conversations[id];
}
const historyFor = (conv) => conv.messages.filter(m => !m.error && typeof m.content === 'string' && m.content).map(m => ({ role: m.role, content: m.content + (m.photoNotes ? '\nPhoto reference observations: '+m.photoNotes : '') }));
function persist() { const c = activeConv(); if (c) { c.updatedAt = Date.now(); saveConversations(); renderSidebarList(); } }
function syncEmpty() { document.body.classList.toggle('empty', !(activeConv() && activeConv().messages.length)); }

// ───────────────────────────── Sidebar ─────────────────────────────
function groupLabel(ts) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const day = 86400000, t = d.getTime();
  if (ts >= t) return 'Today'; if (ts >= t - day) return 'Yesterday'; if (ts >= t - 7 * day) return 'Previous 7 days'; if (ts >= t - 30 * day) return 'Previous 30 days'; return 'Older';
}
function renderSidebarList() {
  const q = state.filter.trim().toLowerCase();
  const items = Object.values(state.conversations).filter(c => c.messages.length)
    .filter(c => !q || (c.title || '').toLowerCase().includes(q) || c.messages.some(m => typeof m.content === 'string' && m.content.toLowerCase().includes(q)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const box = $('#recent');
  if (!items.length) { box.innerHTML = `<div class="sb-empty">${q ? 'No chats found.' : 'Your chats will appear here.'}</div>`; return; }
  let last = '', html = '';
  for (const c of items) {
    const g = groupLabel(c.updatedAt);
    if (g !== last) { html += `<div class="sb-group">${g}</div>`; last = g; }
    html += `<div class="chat-item${c.id === state.activeId ? ' active' : ''}" role="listitem" data-id="${c.id}" tabindex="0"><span class="title">${escapeHtml(c.title || 'New chat')}</span><button class="more" type="button" aria-label="Chat options" data-more="${c.id}">${icon('more')}</button></div>`;
  }
  box.innerHTML = html;
}
function openChat(id) {
  if (state.uploading) return;
  if (!state.conversations[id]) return;
  if (state.sending) state.controller?.abort();
  state.images = []; renderAttachments(); uploadMessage('');
  state.activeId = id; redrawThread(); renderSidebarList(); closeSidebarIfMobile(); closePanel();
}
function startNewChat() {
  if (state.uploading) return;
  if (state.sending) state.controller?.abort();
  state.activeId = null; redrawThread(); renderSidebarList(); closePanel(); closeSidebarIfMobile();
  state.images = []; renderAttachments(); uploadMessage('');
  promptEl.value = ''; autoResize(); promptEl.focus();
}
function deleteChat(id) {
  delete state.conversations[id]; saveConversations();
  if (id === state.activeId) startNewChat(); else renderSidebarList();
}
function renameChat(id) {
  const item = $(`.chat-item[data-id="${id}"] .title`); if (!item) return;
  const conv = state.conversations[id], before = conv.title || '';
  item.contentEditable = 'true'; item.focus();
  const range = document.createRange(); range.selectNodeContents(item); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
  const finish = (save) => {
    item.contentEditable = 'false';
    const v = item.textContent.trim().slice(0, 80);
    if (save && v) { conv.title = v; saveConversations(); }
    renderSidebarList();
  };
  item.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') { item.textContent = before; finish(false); } };
  item.onblur = () => finish(true);
}
let ctxMenu = null;
function closeCtx() { ctxMenu?.remove(); ctxMenu = null; $$('.chat-item.menu-open').forEach(n => n.classList.remove('menu-open')); }
function openCtx(btn, id) {
  closeCtx();
  const r = btn.getBoundingClientRect();
  ctxMenu = el(`<div class="menu open" role="menu" style="position:fixed;left:${Math.min(r.left, innerWidth - 200)}px;top:${Math.min(r.bottom + 4, innerHeight - 110)}px;min-width:170px">
    <button class="menu-row" data-act="rename">${icon('edit')}Rename</button><button class="menu-row danger" data-act="delete">${icon('trash')}Delete</button></div>`);
  document.body.append(ctxMenu);
  btn.closest('.chat-item')?.classList.add('menu-open');
  ctxMenu.onclick = (e) => { const a = e.target.closest('[data-act]')?.dataset.act; closeCtx(); if (a === 'rename') renameChat(id); if (a === 'delete') deleteChat(id); };
}
function setSidebar(open) {
  const app = $('#app');
  if (mobile()) { app.classList.toggle('sidebar-open', open); }
  else { state.sidebarCollapsed = !open; app.classList.toggle('sidebar-collapsed', !open); savePrefs(); }
}
function closeSidebarIfMobile() { if (mobile()) $('#app').classList.remove('sidebar-open'); }

// ───────────────────────────── Thread rendering ─────────────────────────────
function updateJump() {
  const near = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 90;
  state.stick = near;
  $('#jump').classList.toggle('show', !near && !document.body.classList.contains('empty'));
}
function scrollToBottom(force) { if (force || state.stick) { scroller.scrollTop = scroller.scrollHeight; if (force) state.stick = true; updateJump(); } }

function toolsHtml(msg) {
  return `<button class="tool" data-tool="copy" aria-label="Copy" title="Copy">${icon('copy')}</button>
    <button class="tool${msg.rating === 1 ? ' on' : ''}" data-tool="up" aria-label="Good response" title="Good response">${icon('thumbup')}</button>
    <button class="tool${msg.rating === -1 ? ' on' : ''}" data-tool="down" aria-label="Bad response" title="Bad response">${icon('thumbdown')}</button>
    <button class="tool" data-tool="regen" aria-label="Regenerate" title="Regenerate">${icon('refresh')}</button>
    ${msg.data?.modelUsed ? `<span class="tool-meta">${escapeHtml(msg.data.modelUsed)}${msg.data.powerUsed ? ' · ' + escapeHtml(msg.data.powerUsed) : ''}</span>` : ''}`;
}
function filesHtml(msg) {
  const data = msg.data;
  if (!data || !data.workspace || !data.files?.length) return '';
  const expired = Date.now() - (msg.ts || 0) > FILE_TTL_MS;
  const imgs = data.files.filter(f => f.isImage);
  const gallery = imgs.length ? `<div class="gallery">${imgs.map(f => expired ? '' : `<button type="button" data-open="${escapeHtml(f.path)}" aria-label="Open ${escapeHtml(f.path)}"><img loading="lazy" alt="${escapeHtml(f.path)}" src="${wsUrl('/api/preview', data.workspace, f.path)}"></button>`).join('')}</div>` : '';
  const cards = data.files.filter(f => !(f.isImage && f.path.endsWith('-preview.png'))).map(f => {
    const [color, label] = ftype(f.path);
    return `<div class="file-card${expired ? ' expired' : ''}" role="button" tabindex="0" data-open="${escapeHtml(f.path)}">
      <span class="fc-ic" style="background:${color};${label === 'JS' ? 'color:#111;background:#f7df1e;' : ''}">${escapeHtml(label)}</span>
      <span class="fc-text"><span class="fc-name">${escapeHtml(f.path)}</span><span class="fc-sub">${expired ? 'Expired · files are kept for 2 hours' : formatBytes(f.bytes)}</span></span>
      ${expired ? '' : `<a class="fc-dl" href="${wsUrl('/api/download', data.workspace, f.path)}" download aria-label="Download ${escapeHtml(f.path)}" title="Download">${icon('download')}</a>`}</div>`;
  }).join('');
  const shown = data.files.filter(f => !(f.isImage && f.path.endsWith('-preview.png'))).length;
  const bar = !expired && shown > 1 ? `<div class="files-bar"><span>${shown} files</span><a href="/api/download/${data.workspace}">${icon('download')}Download all (.zip)</a></div>` : '';
  return `<div class="files">${gallery}${cards}${bar}</div>`;
}

function foldHtml(t, live) {
  let h = '';
  if (t.thinking) {
    const label = live && !t.replying ? '<span class="shimmer">Thinking…</span>' : `Thought for ${secs(t.thinkSecs || 1)}`;
    h += `<details class="fold" data-fold="think"${t.thinkOpen ? ' open' : ''}><summary>${icon('chevronr')}${label}</summary><div class="fold-body">${escapeHtml(t.thinking)}</div></details>`;
  }
  if (t.steps?.length) {
    const label = live ? '<span class="shimmer">Working…</span>' : `Worked for ${secs(t.workSecs || 1)}`;
    const lis = t.steps.map((s, i) => { const run = live && i === t.steps.length - 1; return `<li class="${run ? 'run' : ''}">${icon(run ? 'loader' : 'check')}${escapeHtml(s)}</li>`; }).join('');
    h += `<details class="fold" data-fold="steps"${t.stepsOpen ? ' open' : ''}><summary>${icon('chevronr')}${label}</summary><ul class="steps">${lis}</ul></details>`;
  }
  return h;
}

function userNode(msg, index) {
  const n = el(`<div class="msg user" data-index="${index}"><div class="bubble" title="Double-click to edit">${escapeHtml(msg.content)}</div></div>`);
  const photos = (msg.images || []).filter(p => /^[a-f0-9]{32}$/.test(p.id));
  if (photos.length) n.prepend(el(`<div class="user-photos">${photos.map(p => `<img src="/api/uploads/${p.id}" alt="${escapeHtml(p.name)}" title="${escapeHtml(p.name)}" loading="lazy">`).join('')}</div>`));
  return n;
}
function assistantNode(msg, index) {
  const { body, notes } = splitNotes(msg.content);
  const n = el(`<div class="msg assistant" data-index="${index}"><div class="a-fold"></div><div class="a-body reply-text"></div><div class="a-files"></div><div class="a-notes"></div><div class="msg-tools"></div></div>`);
  if (msg.error) {
    $('.a-body', n).className = 'a-body';
    $('.a-body', n).innerHTML = `<div class="err">${icon('alert')}<div><div>${escapeHtml(msg.content)}</div><button class="retry" type="button" data-tool="regen">Try again</button></div></div>`;
    return n;
  }
  $('.a-fold', n).innerHTML = foldHtml(msg.trace || {}, false);
  $('.a-body', n).innerHTML = renderMarkdown(body);
  $('.a-files', n).innerHTML = filesHtml(msg);
  $('.a-notes', n).innerHTML = notes.length ? `<div class="notes">${notes.map(x => `<p>${inlineMd(escapeHtml(x))}</p>`).join('')}</div>` : '';
  $('.msg-tools', n).innerHTML = toolsHtml(msg);
  return n;
}
function redrawThread() {
  thread.innerHTML = '';
  const conv = activeConv();
  if (conv) conv.messages.forEach((m, i) => thread.append(m.role === 'user' ? userNode(m, i) : assistantNode(m, i)));
  syncEmpty(); setModeUI();
  scrollToBottom(true);
  if (!activeConv()?.messages.length) $('#jump').classList.remove('show');
}

// delegated clicks inside the thread
thread.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('.code-copy');
  if (copyBtn) {
    const code = copyBtn.closest('.codeblock').querySelector('code').innerText;
    navigator.clipboard?.writeText(code); const s = copyBtn.querySelector('span'); s.textContent = 'Copied!'; setTimeout(() => { s.textContent = 'Copy code'; }, 1300); return;
  }
  const open = e.target.closest('[data-open]');
  if (open && !e.target.closest('.fc-dl')) {
    const msgEl = open.closest('.msg'); const msg = activeConv()?.messages[+msgEl.dataset.index];
    if (msg?.data && Date.now() - (msg.ts || 0) <= FILE_TTL_MS) openPanel(msg.data, open.dataset.open);
    return;
  }
  const tool = e.target.closest('[data-tool]');
  if (!tool) return;
  const msgEl = tool.closest('.msg'); const idx = +msgEl.dataset.index; const conv = activeConv(); const msg = conv?.messages[idx]; if (!msg) return;
  const kind = tool.dataset.tool;
  if (kind === 'copy') { navigator.clipboard?.writeText(splitNotes(msg.content).body); tool.innerHTML = icon('check'); setTimeout(() => { tool.innerHTML = icon('copy'); }, 1300); }
  else if (kind === 'up' || kind === 'down') {
    const v = kind === 'up' ? 1 : -1; msg.rating = msg.rating === v ? 0 : v; saveConversations();
    $$('[data-tool="up"],[data-tool="down"]', msgEl).forEach(b => b.classList.toggle('on', (b.dataset.tool === 'up' && msg.rating === 1) || (b.dataset.tool === 'down' && msg.rating === -1)));
  } else if (kind === 'regen') regenerate(idx);
});
thread.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.file-card')) { e.preventDefault(); e.target.click(); } });
thread.addEventListener('toggle', (e) => {
  const d = e.target; if (!d.matches?.('details.fold') || !state.liveTrace) return;
  const t = state.liveTrace, key = d.dataset.fold === 'think' ? 'thinkOpen' : 'stepsOpen';
  if (d.open === t[key]) return; // programmatic render, not a user toggle
  t.userToggled[d.dataset.fold] = true; t[key] = d.open;
}, true);

// ───────────────────────────── Streaming chat ─────────────────────────────
async function readEvents(response, onEvent) {
  const reader = response.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) { try { onEvent(JSON.parse(line)); } catch {} } }
  }
  if (buf.trim()) { try { onEvent(JSON.parse(buf.trim())); } catch {} }
}
function setSending(on) {
  state.sending = on;
  sendBtn.classList.toggle('stop', on);
  sendBtn.innerHTML = on ? '<svg class="ic" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="3"/></svg>' : icon('arrowup');
  sendBtn.setAttribute('aria-label', on ? 'Stop generating' : 'Send message');
  updateSendEnabled();
}
function updateSendEnabled() {
  sendBtn.disabled = !state.sending && (state.uploading || (!promptEl.value.trim() && !state.images.length));
  $('#attachPhoto').disabled = state.sending || state.uploading;
}

async function ask(promptText) {
  const conv = activeConv();
  const currentUser = [...conv.messages].reverse().find(m => m.role === 'user');
  let imageRefs = currentUser?.images || [];
  if (!imageRefs.length && /\b(edit|photo|image|picture|reference)\b/i.test(promptText)) {
    imageRefs = [...conv.messages].reverse().find(m => m.role === 'user' && m.images?.length)?.images || [];
  }
  const node = assistantNode({ role: 'assistant', content: '' }, conv.messages.length);
  $('.msg-tools', node).innerHTML = ''; $('.a-body', node).innerHTML = '<span class="dot-pulse"></span>';
  thread.append(node); scrollToBottom(true);
  const bodyEl = $('.a-body', node), foldEl = $('.a-fold', node);

  const t = { thinking: '', thinkSecs: 0, thinkOpen: true, steps: state.build ? ['Planning the build'] : [], stepsOpen: true, workSecs: 0, replying: false, userToggled: {} };
  state.liveTrace = t;
  const t0 = performance.now(); let thinkStart = 0, streamed = '', info = '', final = null, errText = null, raf = 0, settled = false;
  state.controller = new AbortController(); setSending(true);

  const paint = () => {
    raf = 0; if (settled) return;
    foldEl.innerHTML = foldHtml(t, true);
    const fb = $('details[data-fold="think"] .fold-body', foldEl); if (fb) fb.scrollTop = fb.scrollHeight;
    if (streamed) bodyEl.innerHTML = renderMarkdown(splitNotes(streamed).body) + '<span class="cursor"></span>';
    else bodyEl.innerHTML = (t.thinking || t.steps.length) ? '' : '<span class="dot-pulse"></span>';
    scrollToBottom(false);
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };

  try {
    const res = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: state.controller.signal,
      body: JSON.stringify({ prompt: promptText, images: imageRefs.map(p => ({id:p.id})), workspaces: conv.messages.filter(m => m.data?.workspace).slice(-2).map(m => m.data.workspace), model: state.model, history: historyFor(conv).slice(0, -1), web_search: state.webSearch, power: state.power, mode: state.build ? 'velaris' : 'assist' }),
    });
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('application/x-ndjson')) {
      if (ctype.includes('application/json')) throw new Error((await res.json()).error || 'Request failed');
      throw new Error(res.status === 502 || res.status === 504 ? 'The server took too long to respond (the model may be slow or overloaded). Try again or pick a faster model.' : `Server error (HTTP ${res.status}). Try again in a moment.`);
    }
    await readEvents(res, (ev) => {
      if (ev.type === 'info') { info = ev.text; if (!t.steps.includes(ev.text)) t.steps.push(ev.text); }
      else if (ev.type === 'status') { t.steps.push(ev.text); }
      else if (ev.type === 'thinking') { if (!thinkStart) thinkStart = performance.now(); t.thinking += ev.text; t.thinkSecs = (performance.now() - thinkStart) / 1000; }
      else if (ev.type === 'delta') {
        if (!t.replying) { t.replying = true; if (thinkStart) t.thinkSecs = (performance.now() - thinkStart) / 1000; if (!t.userToggled.think) t.thinkOpen = false; }
        streamed += ev.text;
      } else if (ev.type === 'done') final = ev;
      else if (ev.type === 'error') errText = ev.error;
      schedule();
    });
    if (errText) throw new Error(errText);
    if (!final) throw new Error('The model stopped responding unexpectedly. Please try again.');

    settled = true; if (raf) cancelAnimationFrame(raf);
    t.workSecs = (performance.now() - t0) / 1000; t.replying = true; if (!t.userToggled.steps) t.stepsOpen = false; if (!t.userToggled.think) t.thinkOpen = false;
    if (t.thinking.length > 12000) t.thinking = t.thinking.slice(-12000);
    if (t.steps.length < 2 && !final.files?.length) t.steps = [];
    const msg = { role: 'assistant', content: final.reply, data: final, trace: { thinking: t.thinking, thinkSecs: t.thinkSecs, steps: t.steps, workSecs: t.workSecs }, ts: Date.now() };
    if (currentUser && final.photoNotes) currentUser.photoNotes = final.photoNotes;
    conv.messages.push(msg);
    const finalNode = assistantNode(msg, conv.messages.length - 1);
    node.replaceWith(finalNode);
    if (!conv.title) conv.title = titleFor(promptText);
    persist(); scrollToBottom(true);
    if (final.files?.length) autoOpenPanel(msg);
  } catch (err) {
    settled = true; if (raf) cancelAnimationFrame(raf);
    if (err.name === 'AbortError') {
      const keep = splitNotes(streamed).body;
      const msg = { role: 'assistant', content: keep || 'Generation stopped.', error: !keep, ts: Date.now() };
      if (keep) msg.content = keep + '\n\n*Stopped.*';
      conv.messages.push(msg); node.replaceWith(assistantNode(msg, conv.messages.length - 1));
    } else {
      const msg = { role: 'assistant', content: err.message || 'Something went wrong.', error: true, ts: Date.now() };
      conv.messages.push(msg); node.replaceWith(assistantNode(msg, conv.messages.length - 1));
    }
    persist();
  } finally {
    state.liveTrace = null; state.controller = null; setSending(false); promptEl.focus();
  }
}

async function submit() {
  const text = promptEl.value.trim() || (state.images.length ? 'Describe the attached photos.' : ''); if (!text || state.sending || state.uploading) return;
  const conv = ensureConv();
  const msg = { role: 'user', content: text, images: state.images.slice(), ts: Date.now() };
  state.images = []; renderAttachments();
  conv.messages.push(msg);
  if (!conv.title) conv.title = titleFor(text);
  syncEmpty(); thread.append(userNode(msg, conv.messages.length - 1));
  promptEl.value = ''; autoResize(); persist();
  await ask(text);
}
async function regenerate(index) {
  if (state.sending) return; const conv = activeConv(); if (!conv) return;
  let u = index - 1; while (u >= 0 && conv.messages[u].role !== 'user') u--;
  if (u < 0) return;
  const text = conv.messages[u].content;
  conv.messages = conv.messages.slice(0, u + 1);
  redrawThread(); persist(); await ask(text);
}
// Edit a user message: truncate the chat from there and resend.
thread.addEventListener('dblclick', (e) => {
  const bubble = e.target.closest('.msg.user .bubble'); if (!bubble || state.sending) return;
  const idx = +bubble.closest('.msg').dataset.index, conv = activeConv(), msg = conv.messages[idx];
  bubble.outerHTML = `<div class="bubble" style="width:100%;background:var(--surface)"><textarea class="edit-area" style="width:100%;background:none;border:0;outline:0;resize:none;min-height:60px;font-size:16px">${escapeHtml(msg.content)}</textarea><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px"><button class="ghost-btn" data-edit="cancel" style="border:1px solid var(--border-strong)">Cancel</button><button class="ghost-btn" data-edit="send" style="background:var(--btn-bg);color:var(--btn-fg)">Send</button></div></div>`;
  const ta = $('.edit-area', thread); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
});
thread.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-edit]'); if (!b) return;
  if (b.dataset.edit === 'cancel') { redrawThread(); return; }
  const idx = +b.closest('.msg').dataset.index, conv = activeConv(), text = $('.edit-area', thread).value.trim(); if (!text) return;
  const images = conv.messages[idx].images || [];
  conv.messages = conv.messages.slice(0, idx); conv.messages.push({ role: 'user', content: text, images, ts: Date.now() });
  redrawThread(); persist(); await ask(text);
});

// ───────────────────────────── Composer ─────────────────────────────
function renderAttachments() {
  $('#attachments').innerHTML = state.images.map((p,i) => `<figure class="attachment"><img src="/api/uploads/${p.id}" alt="${escapeHtml(p.name)}"><figcaption>${escapeHtml(p.name)}</figcaption><button type="button" data-remove-photo="${i}" aria-label="Remove ${escapeHtml(p.name)}">×</button></figure>`).join('');
  updateSendEnabled();
}
function uploadMessage(text) {
  const box = $('#uploadError'); box.textContent = text; box.hidden = !text;
}
async function addPhotos(files) {
  if (state.sending || state.uploading) return;
  if (!files.length) return;
  if (files.length + state.images.length > 4) { uploadMessage('Attach at most 4 photos per message.'); return; }
  if (files.some(f => !['image/jpeg','image/png','image/webp','image/gif'].includes(f.type) || f.size > 8*1024*1024)) { uploadMessage('Use JPEG, PNG, WebP or GIF, at most 8 MB per image.'); return; }
  if (files.reduce((n,f) => n+f.size,0) > 19*1024*1024) { uploadMessage('Keep the selected photos under 19 MB in total.'); return; }
  state.uploading = true; updateSendEnabled(); uploadMessage('Uploading photos…');
  try {
    const form = new FormData(); files.forEach(f => form.append('images',f));
    const response = await fetch('/api/uploads',{method:'POST',body:form});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Upload failed.');
    state.images.push(...result.images); renderAttachments(); uploadMessage('');
  } catch (error) { uploadMessage(error.message || 'Upload failed. Please retry.'); }
  finally { state.uploading = false; updateSendEnabled(); $('#photoInput').value = ''; }
}
$('#attachPhoto').onclick = () => { closeMenus(); $('#photoInput').click(); };
$('#photoInput').onchange = e => addPhotos(Array.from(e.target.files));
$('#attachments').onclick = e => {
  const b = e.target.closest('[data-remove-photo]'); if (!b || state.uploading) return;
  state.images.splice(+b.dataset.removePhoto,1); renderAttachments();
};
$('#composer').addEventListener('dragover',e => { e.preventDefault(); $('#composer').classList.add('dragging'); });
$('#composer').addEventListener('dragleave',e => { if (!$('#composer').contains(e.relatedTarget)) $('#composer').classList.remove('dragging'); });
$('#composer').addEventListener('drop',e => { e.preventDefault(); $('#composer').classList.remove('dragging'); addPhotos(Array.from(e.dataTransfer.files)); });
promptEl.addEventListener('paste',e => {
  const files = Array.from(e.clipboardData?.items || []).filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
  if (files.length) { e.preventDefault(); addPhotos(files); }
});

function autoResize() {
  promptEl.style.height = 'auto'; promptEl.style.height = Math.min(promptEl.scrollHeight, 220) + 'px';
  const box = $('#composer');
  if (!promptEl.value) box.classList.remove('multi'); else if (promptEl.scrollHeight > 46) box.classList.add('multi'); // stays expanded once it wraps
  updateSendEnabled();
}
function setModeUI() {
  $('#toggleSearch').classList.toggle('on', state.webSearch);
  $('#toggleBuild').classList.toggle('on', state.build);
  const chips = [];
  if (state.webSearch) chips.push(`<span class="chip">${icon('globe')}Search<button type="button" data-chip="search" aria-label="Remove web search">${icon('x')}</button></span>`);
  if (state.build) chips.push(`<span class="chip">${icon('code')}Build<button type="button" data-chip="build" aria-label="Turn off build mode">${icon('x')}</button></span>`);
  $('#chips').innerHTML = chips.join('');
  promptEl.placeholder = state.build ? 'Describe what to build' : 'Ask anything';
  $('#heroTitle').textContent = state.build ? 'What should we build?' : 'What can I help with?';
}
const SUGGESTIONS = [
  ['cube', 'Create a 3D model', 'Design a printable 3D model of ', true],
  ['doc', 'Write a document', 'Write a professional report about ', true],
  ['slides', 'Make a presentation', 'Create a presentation about ', true],
  ['table', 'Build a spreadsheet', 'Create a spreadsheet that tracks ', true],
  ['code', 'Build a website', 'Build a polished, responsive website for ', true],
  ['image', 'Generate an image', 'Generate an image of ', true],
];
function renderSuggestions() {
  $('#suggestions').innerHTML = SUGGESTIONS.map((s, i) => `<button type="button" class="sug" data-sug="${i}">${icon(s[0])}${s[1]}</button>`).join('');
}
$('#suggestions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sug]'); if (!b) return; const s = SUGGESTIONS[+b.dataset.sug];
  if (s[3]) state.build = true; setModeUI(); promptEl.value = s[2]; autoResize(); promptEl.focus(); promptEl.setSelectionRange(s[2].length, s[2].length);
});
$('#chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-chip]'); if (!b) return;
  if (b.dataset.chip === 'search') state.webSearch = false; else state.build = false; setModeUI();
});
$('#toggleSearch').onclick = () => { if (!state.webSearchAvailable) return; state.webSearch = !state.webSearch; setModeUI(); closeMenus(); promptEl.focus(); };
$('#toggleBuild').onclick = () => { state.build = !state.build; setModeUI(); closeMenus(); promptEl.focus(); };

// ───────────────────────────── Menus & models ─────────────────────────────
const menus = () => [$('#modelMenu'), $('#plusMenu'), $('#profileMenu')];
function closeMenus(except) {
  menus().forEach(m => { if (m !== except) m.classList.remove('open'); });
  $('#modelButton').setAttribute('aria-expanded', String($('#modelMenu').classList.contains('open')));
  $('#profileBtn').setAttribute('aria-expanded', String($('#profileMenu').classList.contains('open')));
  if (!except || except !== ctxMenu) closeCtx();
}
function toggleMenu(m) { const open = !m.classList.contains('open'); closeMenus(); m.classList.toggle('open', open); $('#modelButton').setAttribute('aria-expanded', String($('#modelMenu').classList.contains('open'))); $('#profileBtn').setAttribute('aria-expanded', String($('#profileMenu').classList.contains('open'))); }
const POWER_LABEL = { low: 'Low', medium: 'Medium', high: 'High', max: 'Max' };
function updateModelButton() {
  const m = state.models.find(x => x.id === state.model) || state.models[0];
  $('#modelName').textContent = m ? m.name : 'Velaris';
  $('#modelSub').textContent = POWER_LABEL[state.power];
  $$('.effort-opt').forEach(b => { b.classList.toggle('active', b.dataset.power === state.power); b.setAttribute('aria-checked', String(b.dataset.power === state.power)); });
  $$('.model-opt').forEach(b => b.classList.toggle('active', b.dataset.id === state.model));
}
async function loadModels() {
  try {
    const cfg = await (await fetch('/api/config')).json();
    state.webSearchAvailable = !!cfg.webSearchEnabled;
    const sw = $('#toggleSearch'); sw.disabled = !state.webSearchAvailable; sw.style.opacity = state.webSearchAvailable ? '' : '.5';
    sw.title = state.webSearchAvailable ? 'Search the web before answering' : 'Web search needs TAVILY_API_KEY set on the server';
    state.models = await (await fetch('/api/models')).json();
    if (!state.models.some(m => m.id === state.model)) state.model = cfg.defaultModel || state.models[0]?.id || '';
    $('#models').innerHTML = state.models.map(m => `<button type="button" class="model-opt" role="menuitemradio" data-id="${escapeHtml(m.id)}"><span class="mo-text"><b>${escapeHtml(m.name)}</b><small>${escapeHtml(m.tag)}</small></span><span class="check">${icon('check')}</span></button>`).join('');
  } catch { $('#models').innerHTML = '<p class="menu-hint">Model list unavailable.</p>'; }
  updateModelButton();
}
$('#models').addEventListener('click', (e) => { const b = e.target.closest('.model-opt'); if (!b) return; state.model = b.dataset.id; savePrefs(); updateModelButton(); closeMenus(); });
$('#powerSelect').addEventListener('click', (e) => { const b = e.target.closest('.effort-opt'); if (!b) return; state.power = b.dataset.power; savePrefs(); updateModelButton(); });
$('#modelButton').onclick = (e) => { e.stopPropagation(); toggleMenu($('#modelMenu')); };
$('#plusBtn').onclick = (e) => { e.stopPropagation(); toggleMenu($('#plusMenu')); };
$('#profileBtn').onclick = (e) => { e.stopPropagation(); toggleMenu($('#profileMenu')); };
menus().forEach(m => m.addEventListener('click', e => e.stopPropagation()));
$$('[data-theme-set]').forEach(b => b.onclick = () => { setTheme(b.dataset.themeSet); closeMenus(); });
$('#themeBtn').onclick = () => { const dark = document.documentElement.dataset.theme === 'dark'; setTheme(dark ? 'light' : 'dark'); };
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (themePref() === 'system') applyTheme(); });
$('#clearAll').onclick = () => { closeMenus(); if (confirm('Delete all chats stored in this browser?')) { state.conversations = {}; saveConversations(); startNewChat(); } };
document.addEventListener('click', () => closeMenus());

// ───────────────────────────── Files panel ─────────────────────────────
const panel = { open: false, data: null, path: '', mode: '', info: null, text: '', viewer: null, token: 0 };
function closePanel() { panel.open = false; panel.viewer?.dispose?.(); panel.viewer = null; $('#panel').classList.remove('open'); $('#panel').setAttribute('aria-hidden', 'true'); $('#panelBody').innerHTML = ''; }
function autoOpenPanel(msg) {
  const files = msg.data.files.filter(f => !(f.isImage && f.path.endsWith('-preview.png')));
  const order = ['html', 'pptx', 'docx', 'stl', 'pdf', 'xlsx'];
  const pick = order.map(x => files.find(f => extOf(f.path) === x)).find(Boolean) || files[0];
  if (pick && innerWidth > 1100) openPanel(msg.data, pick.path);
}
function openPanel(data, path) {
  panel.open = true; panel.data = data; $('#panel').classList.add('open'); $('#panel').setAttribute('aria-hidden', 'false');
  $('#panelFiles').innerHTML = data.files.filter(f => !(f.isImage && f.path.endsWith('-preview.png'))).map(f => `<button class="ptab" role="tab" data-path="${escapeHtml(f.path)}"><span class="dotc" style="background:${ftype(f.path)[0]}"></span><span class="t">${escapeHtml(f.path.split('/').pop())}</span></button>`).join('');
  showFile(path);
}
$('#panelFiles').addEventListener('click', (e) => { const b = e.target.closest('.ptab'); if (b) showFile(b.dataset.path); });
$('#panelClose').onclick = closePanel;
async function showFile(path) {
  const token = ++panel.token; panel.path = path; panel.viewer?.dispose?.(); panel.viewer = null; panel.info = null; panel.text = '';
  $$('.ptab').forEach(b => b.classList.toggle('active', b.dataset.path === path));
  const ws = panel.data.workspace, body = $('#panelBody');
  $('#panelDownload').href = wsUrl('/api/download', ws, path); $('#panelDownload').setAttribute('download', path.split('/').pop());
  $('#panelCopy').hidden = true; $('#panelModes').innerHTML = ''; body.innerHTML = '<div class="spinner"></div>';
  try {
    const res = await fetch(wsUrl('/api/inspect', ws, path));
    if (!res.ok) throw new Error(res.status === 404 ? 'This file has expired (files are kept for 2 hours).' : 'Could not load a preview.');
    const info = await res.json(); if (token !== panel.token) return;
    panel.info = info; panel.text = info.text || '';
    const modes = modesFor(info, path); panel.mode = modes[0]?.id || '';
    renderModes(modes); renderPanelBody();
  } catch (err) { if (token === panel.token) body.innerHTML = `<div class="pb-center"><div><div class="big" style="background:#64748b">!</div>${escapeHtml(err.message)}</div></div>`; }
}
function modesFor(info, path) {
  const ext = extOf(path);
  switch (info.kind) {
    case 'text':
      if (['html', 'htm'].includes(ext)) return [{ id: 'preview', label: 'Preview' }, { id: 'code', label: 'Code' }];
      if (ext === 'svg') return [{ id: 'svgimg', label: 'Preview' }, { id: 'code', label: 'Code' }];
      if (ext === 'md') return [{ id: 'md', label: 'Preview' }, { id: 'code', label: 'Source' }];
      if (['csv', 'tsv'].includes(ext)) return [{ id: 'csv', label: 'Table' }, { id: 'code', label: 'Raw' }];
      return [{ id: 'code', label: 'Code' }];
    case 'docx': return [{ id: 'docx', label: 'Document' }];
    case 'sheet': return [{ id: 'sheet', label: 'Spreadsheet' }];
    case 'slides': return [{ id: 'slides', label: 'Slides' }];
    case 'stl': return [{ id: 'stl', label: '3D view' }];
    case 'pdf': return [{ id: 'pdf', label: 'PDF' }];
    case 'image': return [{ id: 'image', label: 'Image' }];
    case 'zip': return [{ id: 'zip', label: 'Contents' }];
    default: return [{ id: 'binary', label: 'File' }];
  }
}
function renderModes(modes) {
  $('#panelModes').innerHTML = modes.length > 1 ? modes.map(m => `<button type="button" data-mode="${m.id}" class="${m.id === panel.mode ? 'active' : ''}">${m.label}</button>`).join('') : '';
  $('#panelCopy').hidden = !panel.text;
}
$('#panelModes').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (!b) return; panel.mode = b.dataset.mode; $$('#panelModes button').forEach(x => x.classList.toggle('active', x === b)); renderPanelBody(); });
$('#panelCopy').onclick = () => { navigator.clipboard?.writeText(panel.text); const s = $('#panelCopy span:last-child'); s.textContent = 'Copied'; setTimeout(() => { s.textContent = 'Copy'; }, 1200); };

function parseCsv(text, delim) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length && rows.length < 300; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function sheetTable(rows) {
  const cols = Math.max(1, ...rows.map(r => r.length));
  const head = `<tr><th class="rn"></th>${Array.from({ length: cols }, (_, i) => `<th>${colName(i)}</th>`).join('')}</tr>`;
  const body = rows.map((r, i) => `<tr><td class="rn">${i + 1}</td>${Array.from({ length: cols }, (_, k) => `<td>${escapeHtml(r[k] ?? '')}</td>`).join('')}</tr>`).join('');
  return `<div class="sheet-wrap"><table class="sheet"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
function renderPanelBody() {
  const info = panel.info, body = $('#panelBody'), ws = panel.data.workspace, path = panel.path; if (!info) return;
  panel.viewer?.dispose?.(); panel.viewer = null; body.onclick = null;
  const [color, label] = ftype(path);
  switch (panel.mode) {
    case 'preview': body.innerHTML = `<iframe class="pb-frame" sandbox="allow-scripts allow-forms allow-modals allow-popups" title="Preview"></iframe>`; $('iframe', body).srcdoc = panel.text; break;
    case 'svgimg': case 'image': body.innerHTML = `<div class="pb-img"><img alt="${escapeHtml(path)}" src="${wsUrl('/api/preview', ws, path)}"></div>`; break;
    case 'pdf': body.innerHTML = `<iframe class="pb-frame" title="PDF" src="${wsUrl('/api/preview', ws, path)}"></iframe>`; break;
    case 'code': body.innerHTML = `<div class="codeblock pb-code"><pre><code>${highlight(panel.text, extOf(path))}</code></pre></div>${info.truncated ? '<p class="menu-hint" style="padding:0 20px">Showing the first 300 KB — download for the full file.</p>' : ''}`; break;
    case 'md': body.innerHTML = `<div class="pb-pad"><div class="pb-doc reply-text">${renderMarkdown(panel.text)}</div></div>`; break;
    case 'csv': body.innerHTML = `<div class="pb-pad">${sheetTable(parseCsv(panel.text, extOf(path) === 'tsv' ? '\t' : ','))}</div>`; break;
    case 'docx': {
      const blocks = info.blocks.map(b => { const s = (b.style || '').toLowerCase(); const t = escapeHtml(b.text); if (s.startsWith('title') || s === 'heading 1') return `<h1>${t}</h1>`; if (s.startsWith('heading 2')) return `<h2>${t}</h2>`; if (s.startsWith('heading')) return `<h3>${t}</h3>`; if (s.includes('list')) return `<ul><li>${t}</li></ul>`; return `<p>${t}</p>`; }).join('');
      const tables = (info.tables || []).map(t => sheetTable(t)).join('<br>');
      body.innerHTML = `<div class="pb-pad"><div class="pb-doc">${blocks}${tables}</div></div>`; break;
    }
    case 'sheet': {
      const sheets = info.sheets || []; let idx = 0;
      const draw = () => { body.innerHTML = `<div class="pb-pad">${sheets.length > 1 ? `<div class="seg" style="margin-bottom:12px">${sheets.map((s, i) => `<button data-sheet="${i}" class="${i === idx ? 'active' : ''}">${escapeHtml(s.name)}</button>`).join('')}</div>` : ''}${sheetTable(sheets[idx]?.rows || [])}</div>`; };
      draw(); body.onclick = (e) => { const b = e.target.closest('[data-sheet]'); if (b) { idx = +b.dataset.sheet; draw(); } }; break;
    }
    case 'slides': body.innerHTML = `<div class="pb-pad"><div class="pb-slides">${info.slides.map((s, i) => { const cover = i === 0 && s.bullets.length <= 2; return `<div class="slide${cover ? ' cover' : ''}"><h3>${escapeHtml(s.title || 'Untitled')}</h3>${s.bullets.length ? (cover ? `<p>${s.bullets.map(escapeHtml).join(' · ')}</p>` : `<ul>${s.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`) : ''}<span class="num">${i + 1}</span></div>`; }).join('')}</div></div>`; break;
    case 'zip': body.innerHTML = `<div class="pb-pad zip-list">${info.entries.map(e => `<div><span>${escapeHtml(e.name)}</span><span>${formatBytes(e.bytes)}</span></div>`).join('')}</div>`; break;
    case 'stl': {
      body.innerHTML = '<div class="stl-wrap"></div>';
      const wrap = $('.stl-wrap', body), token = panel.token;
      mountStl(wrap, wsUrl('/api/download', ws, path)).then(v => { if (token === panel.token) panel.viewer = v; else v?.dispose(); }).catch(err => {
        const prev = panel.data.files.find(f => f.path === path.replace(/\.(stl|glb)$/i, '-preview.png'));
        wrap.innerHTML = prev ? `<div class="pb-img" style="background:none"><img alt="Preview" src="${wsUrl('/api/preview', ws, prev.path)}"></div>` : `<div class="pb-center">${escapeHtml(err.message)}</div>`;
      });
      break;
    }
    default: body.innerHTML = `<div class="pb-center"><div><div class="big" style="background:${color}">${escapeHtml(label)}</div><div style="font-weight:600;color:var(--text)">${escapeHtml(path.split('/').pop())}</div><div style="margin-top:4px">${formatBytes(info.bytes)}${info.note ? ' · ' + escapeHtml(info.note) : ''}</div><div style="margin-top:10px">Download to open this file.</div></div></div>`;
  }
}

// ───────────────────────────── STL viewer (WebGL, no libraries) ─────────────────────────────
async function mountStl(wrap, url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('This model has expired or is unavailable. Generate it again.');
  const buf = await response.arrayBuffer();
  const tris = /\.glb$/i.test(url) ? parseGlb(buf) : parseStl(buf);
  if (!tris.count) throw new Error('This STL has no triangles.');
  const canvas = document.createElement('canvas'); wrap.append(canvas);
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) throw new Error('3D view needs WebGL, which is unavailable here.');
  const { pos, nrm, min, max } = tris;
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const radius = Math.hypot(size[0], size[1], size[2]) / 2 || 1;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec3 p;attribute vec3 n;uniform mat4 mvp;uniform mat3 nm;varying vec3 vn;varying float h;void main(){vn=nm*n;h=p.z;gl_Position=mvp*vec4(p,1.0);}'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec3 vn;varying float h;uniform vec3 col;void main(){vec3 N=normalize(vn);vec3 L=normalize(vec3(-0.45,0.55,0.7));vec3 L2=normalize(vec3(0.6,-0.2,0.4));float d=max(dot(N,L),0.0)*0.7+max(dot(N,L2),0.0)*0.2+0.22;float rim=pow(1.0-max(N.z,0.0),3.0)*0.12;vec3 c=col*d+rim;gl_FragColor=vec4(c,1.0);}'));
  gl.linkProgram(prog); gl.useProgram(prog);
  const buffer = (data, name) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); const loc = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0); return b; };
  const normalized = new Float32Array(pos.length); for (let i = 0; i < pos.length; i += 3) { normalized[i] = (pos[i] - center[0]) / radius; normalized[i + 1] = (pos[i + 1] - center[1]) / radius; normalized[i + 2] = (pos[i + 2] - center[2]) / radius; }
  buffer(normalized, 'p'); buffer(nrm, 'n');
  const uMvp = gl.getUniformLocation(prog, 'mvp'), uNm = gl.getUniformLocation(prog, 'nm'), uCol = gl.getUniformLocation(prog, 'col');
  gl.uniform3f(uCol, 0.42, 0.65, 1.0); gl.enable(gl.DEPTH_TEST);

  const hud = el(`<div class="stl-hud">${size.map(v => v.toFixed(1)).join(' × ')} mm · ${tris.count.toLocaleString()} triangles · drag to rotate, scroll to zoom</div>`);
  const tools = el('<div class="stl-tools"><button type="button" data-a="spin">Auto-rotate: on</button><button type="button" data-a="reset">Reset view</button></div>');
  wrap.append(hud, tools);

  let yaw = -0.7, pitch = 0.5, dist = 3.6, spin = true, raf = 0, dead = false, drag = null;
  const dpr = () => Math.min(devicePixelRatio || 1, 2);
  const resize = () => { const w = Math.max(1, wrap.clientWidth), h = Math.max(1, wrap.clientHeight); canvas.width = w * dpr(); canvas.height = h * dpr(); gl.viewport(0, 0, canvas.width, canvas.height); };
  const ro = new ResizeObserver(resize); ro.observe(wrap); resize();
  const norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
  const draw = () => {
    if (dead) return; if (spin && !drag) yaw += 0.006;
    const eye = [dist * Math.cos(pitch) * Math.cos(yaw), dist * Math.cos(pitch) * Math.sin(yaw), dist * Math.sin(pitch)];
    const z = norm(eye), x = norm(cross([0, 0, 1], z)), y = cross(z, x);
    const view = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
    const aspect = canvas.width / canvas.height, t = 1 / Math.tan(0.38), n = 0.1, f = 50, nf = 1 / (n - f);
    const proj = [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0];
    gl.uniformMatrix4fv(uMvp, false, mul(proj, view)); gl.uniformMatrix3fv(uNm, false, [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]);
    gl.clearColor(0.09, 0.10, 0.13, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, tris.count * 3); raf = requestAnimationFrame(draw);
  };
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!drag) return; yaw -= (e.clientX - drag.x) * 0.008; pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - drag.y) * 0.008)); drag = { x: e.clientX, y: e.clientY }; });
  const up = () => { drag = null; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); dist = Math.max(1.6, Math.min(9, dist * (1 + e.deltaY * 0.001))); }, { passive: false });
  canvas.addEventListener('dblclick', () => { yaw = -0.7; pitch = 0.5; dist = 3.6; });
  tools.onclick = (e) => { const a = e.target.closest('button')?.dataset.a; if (a === 'spin') { spin = !spin; e.target.textContent = `Auto-rotate: ${spin ? 'on' : 'off'}`; } if (a === 'reset') { yaw = -0.7; pitch = 0.5; dist = 3.6; } };
  raf = requestAnimationFrame(draw);
  return { dispose() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); gl.getExtension('WEBGL_lose_context')?.loseContext(); } };
}
function parseGlb(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength < 28 || dv.getUint32(0,true) !== 0x46546c67 || dv.getUint32(4,true) !== 2 || dv.getUint32(8,true) !== buf.byteLength) throw new Error('Invalid GLB file.');
  const size = dv.getUint32(12,true);
  if (size+28 > buf.byteLength) throw new Error('Truncated GLB file.');
  const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(buf,20,size)));
  const base = 28+size, primitive = doc.meshes[0].primitives[0];
  const read = (id,width,type) => {
    const a = doc.accessors[id], view = doc.bufferViews[a.bufferView];
    const offset = base+(view.byteOffset || 0)+(a.byteOffset || 0);
    if (a.componentType !== type || a.count > 600000 || offset+a.count*width*4 > buf.byteLength) throw new Error('Unsupported GLB accessor.');
    return new (type === 5126 ? Float32Array : Uint32Array)(buf,offset,a.count*width);
  };
  const vertices = read(primitive.attributes.POSITION,3,5126), normals = read(primitive.attributes.NORMAL,3,5126), indices = read(primitive.indices,1,5125);
  const count = indices.length/3, pos = new Float32Array(indices.length*3), nrm = new Float32Array(pos.length);
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  for (let i=0;i<indices.length;i++) {
    const v = indices[i]*3;
    if (v+2 >= vertices.length) throw new Error('GLB index out of range.');
    pos.set([vertices[v]*1000,-vertices[v+2]*1000,vertices[v+1]*1000],i*3);
    nrm.set([normals[v],-normals[v+2],normals[v+1]],i*3);
    for (let k=0;k<3;k++) { min[k]=Math.min(min[k],pos[i*3+k]); max[k]=Math.max(max[k],pos[i*3+k]); }
  }
  return {count,pos,nrm,min,max};
}

function parseStl(buf) {
  const dv = new DataView(buf); let count = 0, pos;
  const n = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  if (buf.byteLength >= 84 && buf.byteLength === 84 + 50 * n) {
    count = n; pos = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; for (let k = 0; k < 9; k++) pos[i * 9 + k] = dv.getFloat32(o + k * 4, true); }
  } else { // ASCII fallback
    const text = new TextDecoder().decode(buf), m = [...text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)];
    count = Math.floor(m.length / 3); pos = new Float32Array(count * 9);
    for (let i = 0; i < count * 3; i++) { pos[i * 3] = +m[i][1]; pos[i * 3 + 1] = +m[i][2]; pos[i * 3 + 2] = +m[i][3]; }
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { const v = pos[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  // face normals, then smooth them across edges flatter than ~38° so curves look round
  const face = new Float32Array(count * 3);
  for (let t = 0; t < count; t++) {
    const o = t * 9, ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2], vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; face[t * 3] = nx / l; face[t * 3 + 1] = ny / l; face[t * 3 + 2] = nz / l;
  }
  const keyOf = (i) => `${Math.round(pos[i] * 500)},${Math.round(pos[i + 1] * 500)},${Math.round(pos[i + 2] * 500)}`;
  const adj = new Map();
  for (let c = 0; c < count * 3; c++) { const k = keyOf(c * 3); (adj.get(k) || adj.set(k, []).get(k)).push(c); }
  const nrm = new Float32Array(count * 9), cosT = Math.cos(38 * Math.PI / 180);
  if (count > 120000) { for (let c = 0; c < count * 3; c++) { const t = (c / 3) | 0; nrm.set(face.subarray(t * 3, t * 3 + 3), c * 3); } }
  else for (let c = 0; c < count * 3; c++) {
    const t = (c / 3) | 0, fx = face[t * 3], fy = face[t * 3 + 1], fz = face[t * 3 + 2]; let sx = 0, sy = 0, sz = 0;
    for (const o of adj.get(keyOf(c * 3))) { const u = (o / 3) | 0, ux = face[u * 3], uy = face[u * 3 + 1], uz = face[u * 3 + 2]; if (ux * fx + uy * fy + uz * fz > cosT) { sx += ux; sy += uy; sz += uz; } }
    const l = Math.hypot(sx, sy, sz) || 1; nrm[c * 3] = sx / l; nrm[c * 3 + 1] = sy / l; nrm[c * 3 + 2] = sz / l;
  }
  return { count, pos, nrm, min, max };
}

// ───────────────────────────── Wiring ─────────────────────────────
$('#newChat').onclick = startNewChat;
$('#logoBtn').onclick = startNewChat;
$('#collapseBtn').onclick = () => setSidebar(false);
$('#openSidebar').onclick = () => setSidebar(true);
$('#scrim').onclick = () => $('#app').classList.remove('sidebar-open');
$('#chatSearch').addEventListener('input', (e) => { state.filter = e.target.value; renderSidebarList(); });
$('#recent').addEventListener('click', (e) => {
  const more = e.target.closest('[data-more]'); if (more) { e.stopPropagation(); openCtx(more, more.dataset.more); return; }
  const item = e.target.closest('.chat-item'); if (item && !e.target.isContentEditable) openChat(item.dataset.id);
});
$('#recent').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.chat-item') && !e.target.querySelector('[contenteditable="true"]')) openChat(e.target.dataset.id); });
$('#jump').onclick = () => scrollToBottom(true);
scroller.addEventListener('scroll', updateJump, { passive: true });
promptEl.addEventListener('input', autoResize);
promptEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!state.sending) submit(); } });
$('#composer').addEventListener('submit', (e) => { e.preventDefault(); if (state.sending) state.controller?.abort(); else submit(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeMenus(); closeCtx(); if (panel.open && !e.target.matches('textarea,input')) closePanel(); }
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setSidebar(true); $('#chatSearch').focus(); }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); startNewChat(); }
});
matchMedia('(max-width: 820px)').addEventListener?.('change', () => $('#app').classList.remove('sidebar-open'));

function init() {
  hydrateIcons(); renderSuggestions(); applyTheme();
  $('#app').classList.toggle('sidebar-collapsed', state.sidebarCollapsed && !mobile());
  state.conversations = loadConversations();
  // Like ChatGPT: always open on a fresh chat; history lives in the sidebar.
  state.activeId = null; redrawThread(); renderSidebarList(); setSending(false); autoResize();
  loadModels(); promptEl.focus();
}
init();
