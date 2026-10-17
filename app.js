/* Interact web app. Talks to the Interact server; falls back to an in-browser world when opened as a standalone file. */
(function () {
'use strict';
const En = Engine;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = (v, d = 2) => (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
function cmp(v) { const a = Math.abs(v); if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M'; if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K'; return v.toFixed(a < 10 ? (a < 1 ? 2 : 1) : 0); }
const usdC = v => '$' + cmp(v);
const sol = v => (v >= 100 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(v >= .01 ? 3 : 4)) + ' SOL';
const short = (a, n = 6) => !a ? '' : a.length > n * 2 + 1 ? a.slice(0, n) + '…' + a.slice(-n) : a;
const svgUri = s => 'data:image/svg+xml,' + encodeURIComponent(s);
const sum = a => a.reduce((s, v) => s + v, 0);
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const fmtN = n => n >= 1e4 ? cmp(n) : n.toLocaleString('en-US');
const { MIN, HR } = En;
const LOGO = (document.querySelector('.sbrand img') || {}).src || '/interact-logo.png';

let S = null, MODE = 'server', LOCAL = null, SESS = { handle: null }, ui = {};
const now = () => En.now(), A = h => S.acc[h], T = m => S.tmap[m], cfg = () => S.cfg;
const ME = () => S.me ? A(S.me) : null;
const isTest = () => S.cfg.mode === 'test';
const en = n => n - S.gen;
function ago(ts) { const s = Math.max(0, Math.floor((now() - ts) / 1000)); if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return m + 'm'; const h = Math.floor(m / 60); if (h < 24) return h + 'h'; return Math.floor(h / 24) + 'd'; }
function left(ms) { ms = Math.max(0, ms); const m = Math.floor(ms / MIN), s = Math.floor(ms % MIN / 1000); return `${m}m ${String(s).padStart(2, '0')}s`; }

/* ---------- data ---------- */
function apply(snap, before) {
  const prev = S ? S.epoch : null, prevSettle = before !== undefined ? before : (S && S.settles[0] ? S.settles[0].n : null);
  if (MODE === 'server') { snap.clock = { base: snap.simNow, real: Date.now(), speed: snap.speed }; snap.reviews = []; }
  S = snap; En.setState(S); _pcAt = 0;
  if (prev != null && S.settles[0] && S.settles[0].n !== prevSettle) {
    const r = S.settles[0];
    toast(`<span>Epoch #${en(r.n)} settled. <b>${sol(r.paid)}</b> paid to ${r.workers} interacters.</span>`);
  }
}
async function fetchState() { const r = await fetch('/api/state', { cache: 'no-store', credentials: 'same-origin' }); if (!r.ok) throw new Error('state ' + r.status); return r.json(); }
function localSnap() { const s = LOCAL; s.me = SESS.handle && s.acc[SESS.handle] ? SESS.handle : null; s.myClaims = s.claims.filter(c => c.h === s.me).slice(0, 20); s.myHeld = s.reviews.filter(r => r.h === s.me && r.status === 'pending').reduce((a, r) => a + r.amt, 0); return s; }
async function api(path, body) {
  if (MODE === 'local') { const out = Core.call(LOCAL, 'POST', path, body, SESS); apply(localSnap()); return out; }
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong.');
  apply(await fetchState()); return j;
}
const run = async (fn) => { try { return await fn(); } catch (e) { toast(`<span>${esc(e.message)}</span>`); } };
let lastReal = Date.now();
async function poll() {
  try {
    if (MODE === 'local') { const n = Date.now(), before = LOCAL.settles[0] ? LOCAL.settles[0].n : null; Core.tick(LOCAL, n - lastReal); lastReal = n; apply(localSnap(), before); }
    else apply(await fetchState());
  } catch (e) { return; }
  refreshLive(); renderChrome();
}

/* ---------- images ---------- */
function tokenImg(t) { const L = [14, 22, 32, 46, 62, 78, 90]; const l = L[t.hue % 7], l2 = Math.max(4, Math.min(96, l + (l > 50 ? -26 : 24))), ink = l > 54 ? '#0A0A0A' : '#FAFAFA', k = t.hue % 5; const g = `hsl(0,0%,${l2}%)`;
  const glyph = esc((String(t.ticker || '?').replace(/[^A-Za-z0-9]/g, '')[0] || '?').toUpperCase());
  const deco = [`<circle cx="32" cy="32" r="26" fill="none" stroke="${g}" stroke-width="2"/><circle cx="32" cy="32" r="18" fill="none" stroke="${g}" stroke-width="2"/><circle cx="32" cy="32" r="10" fill="none" stroke="${g}" stroke-width="2"/>`,
    Array.from({ length: 9 }, (_, i) => `<rect x="${-20 + i * 10}" y="-10" width="4" height="90" transform="rotate(30 32 32)" fill="${g}"/>`).join(''),
    Array.from({ length: 36 }, (_, i) => `<circle cx="${6 + (i % 6) * 10.4}" cy="${6 + Math.floor(i / 6) * 10.4}" r="${1.2 + ((i * 7 + t.hue) % 5) * .45}" fill="${g}"/>`).join(''),
    `<circle cx="${18 + t.hue % 28}" cy="${16 + t.hue % 20}" r="30" fill="${g}"/>`, `<path d="M0 44Q16 34 32 44T64 44V64H0Z" fill="${g}"/>`][k];
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(0,0%,${l}%)"/>${deco}<text x="32" y="${k === 4 ? 35 : 41}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="24" fill="${ink}">${glyph}</text></svg>`); }
function avImg(a) { const ini = (String(a.name).replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('') || '@').toUpperCase(); const l = [20, 30, 42, 58, 74][a.hue % 5], ink = l > 50 ? '#0A0A0A' : '#FAFAFA';
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(0,0%,${l}%)"/><circle cx="32" cy="84" r="40" fill="hsl(0,0%,${l > 50 ? l - 14 : l + 10}%)"/><text x="32" y="39" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="21" fill="${ink}">${esc(ini)}</text></svg>`); }
const imgCache = {};
const timg = t => t.img || imgCache['t' + t.mint] || (imgCache['t' + t.mint] = tokenImg(t));
const aimg = a => imgCache['a' + a.handle + a.hue] || (imgCache['a' + a.handle + a.hue] = avImg(a));
const tk = (t, s = 40) => `<span class="tk" style="width:${s}px;height:${s}px"><img class="ti" src="${timg(t)}" alt="" width="${s}" height="${s}"></span>`;
const av = (a, s = 28) => `<img class="av" src="${aimg(a)}" alt="" width="${s}" height="${s}" style="width:${s}px;height:${s}px">`;
const VF = '<svg class="vf" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#FAFAFA"/><path d="M5 8.2l2 2 4-4.4" fill="none" stroke="#0A0A0A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const banner = a => { const b = 20 + a.hue % 30; return `radial-gradient(90% 160% at ${a.hue % 100}% 0%,hsl(0,0%,${b + 30}%),transparent 62%),repeating-linear-gradient(${a.hue % 180}deg,hsl(0,0%,${b}%) 0 2px,hsl(0,0%,${b - 8}%) 2px 9px)`; };

/* ---------- live plumbing ---------- */
let liveFns = [], mountQ = [];
const live = (id, fn) => { liveFns.push([id, fn]); return `<div id="L-${id}">${fn()}</div>`; };
const refresh = ids => String(ids).split(',').forEach(id => { const f = liveFns.find(x => x[0] === id), el = document.getElementById('L-' + id); if (f && el) el.innerHTML = f[1](); });
function refreshLive() { for (const [id, fn] of liveFns) { const el = document.getElementById('L-' + id); if (!el) continue; if (el.matches(':hover') || (el.contains(document.activeElement) && document.activeElement !== document.body)) continue; el.innerHTML = fn(); } }
const queue = f => mountQ.push(f);
setInterval(() => { if (!S) return; const n = S.epoch; $$('[data-cd]').forEach(el => el.textContent = left(En.eEnd(n) - now())); $$('[data-ring]').forEach(el => el.style.setProperty('--p', Math.min(1, (now() - En.eStart(n)) / En.epochLen()).toFixed(4))); }, 250);
function toast(html) { const box = $('#toasts'); const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = html; box.appendChild(el); while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => el.remove(), 5500); }

/* ---------- components ---------- */
function pager(key, total, per, region) { const pages = Math.max(1, Math.ceil(total / per)); const cur = Math.min(ui[key] || 0, pages - 1); if (pages <= 1) return '';
  return `<div class="pager"><button data-act="set" data-k="${key}" data-v="${cur - 1}" data-r="${region}" ${cur === 0 ? 'disabled' : ''} aria-label="Previous page">‹</button><span class="mono">${cur + 1} / ${pages}</span><button data-act="set" data-k="${key}" data-v="${cur + 1}" data-r="${region}" ${cur >= pages - 1 ? 'disabled' : ''} aria-label="Next page">›</button></div>`; }
function pageOf(arr, key, per) { const pages = Math.max(1, Math.ceil(arr.length / per)); const cur = Math.min(ui[key] || 0, pages - 1); ui[key] = cur; return arr.slice(cur * per, cur * per + per); }
const seg = (key, opts, region, reset) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-act="set" data-k="${key}" data-v="${v}" data-r="${region}" ${reset ? `data-reset="${reset}"` : ''} aria-pressed="${ui[key] === v}">${l}</button>`).join('')}</div>`;
const IC = { eye: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
  rep: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 12.5V5.8C2 4.3 3.2 3 4.8 3h6.4C12.8 3 14 4.3 14 5.8v2.4c0 1.5-1.2 2.8-2.8 2.8H6z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  rt: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12V5h7M8.5 2.5 11 5 8.5 7.5M12 4v7H5M7.5 13.5 5 11l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  like: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13.5S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 7.5-6 7.5z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  search: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.6 10.6L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' };
function linkify(text) { return esc(text).replace(/\$([A-Za-z0-9]{1,10})/g, (m, k) => { const t = S.tokens.find(x => x.ticker.toUpperCase() === k.toUpperCase()); return t ? `<a href="#t-${t.mint}">$${esc(k)}</a>` : m; }); }
let _pc = {}, _pcAt = 0;
function projCache(mint) { if (Date.now() - _pcAt > 1500) { _pc = {}; _pcAt = Date.now(); } return _pc[mint] || (_pc[mint] = En.project(mint, S.epoch)); }
function postCard(p, { est = true } = {}) { const a = A(p.h), t = T(p.mint); if (!a || !t) return ''; const bad = En.ineligible(p), m = En.metrics(p); let chip;
  if (bad) chip = `<button class="chip no" data-act="why" data-id="${p.id}" title="${esc(bad[0])}">${esc(bad[0])}</button>`;
  else chip = `<button class="chip ok" data-act="why" data-id="${p.id}">Score ${En.score(p).score.toFixed(1)}</button>`;
  let estTxt = '';
  const act = En.active(p, S.epoch);
  if (est && !bad && act) { const row = projCache(p.mint).rows.find(r => r.h === p.h); if (row && row.ids.includes(p.id)) estTxt = `<span class="est">≈ ${sol(row.amt)} this epoch</span>`; else estTxt = `<span class="est" style="color:var(--ink-3);font-weight:500">Earning for ${Math.max(1, Math.ceil((p.ts + En.lifeMs() - now()) / 36e5))}h more</span>`; }
  if (!act && !bad) estTxt = `<span class="est" style="color:var(--ink-3);font-weight:500">Finished earning</span>`;
  return `<article class="post${bad ? ' dim' : ''}"><div class="phd"><a href="#u-${a.handle}">${av(a, 36)}</a><div class="who"><b><a href="#u-${a.handle}">${esc(a.name)}</a></b><span>@${esc(a.handle)} · ${ago(p.ts)}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">View on X</a>` : ''}</span></div>${chip}</div>
  <p class="ptx">${linkify(p.text)}</p><div class="pm"><span>${IC.rep}${fmtN(m.replies)}</span><span>${IC.rt}${fmtN(m.reposts)}</span><span>${IC.like}${fmtN(m.likes)}</span><span>${IC.eye}${fmtN(m.views)}</span>${estTxt}</div></article>`; }
function tokenCard(t) { const pr = projCache(t.mint); return `<a class="icard" href="#t-${t.mint}"><div class="fimg"><img src="${timg(t)}" alt=""><span class="fage">${ago(t.created)}</span><span class="fown">${pr.rows.length} interacting</span></div>
  <div class="fmeta"><div class="n">${esc(t.name)}<small>${esc(t.ticker)}</small></div><div class="m"><span><b>${t.mc ? usdC(t.mc) : '—'}</b><small>MC</small></span></div></div></a>`; }
const accounts = () => Object.values(S.acc);
let _gb = null, _gbAt = 0;
const globalBoard = () => { if (!_gb || Date.now() - _gbAt > 1500) { _gb = En.globalBoard(); _gbAt = Date.now(); } return _gb; };

/* ---------- pages ---------- */
function home() { queue(initFeed);
  return `<section class="hero2"><h1>Turn real interaction<br>into ownership</h1>
    <p>Each launch names a target account and a required action. When verified X interaction happens, the eligible user unlocks the claim.</p>
    <div class="ctas center"><a class="btn pri lg" href="#launch">Launch a coin</a><a class="btn lg" href="#earn">Start claiming</a><a class="btn lg" href="/api/x/oauth/start">Connect X</a></div></section>
  <section class="sec"><div class="deploy-banner"><div class="deploy-brand"><img src="https://pump.fun/pump-logomark.svg?dpl=dpl_F1kMU14PnLUU1vwgNv7nAQBtLtqX" alt="pump.fun" width="34" height="34"><div><strong>Interact is now live on pump.fun</strong><span>Official contract address</span></div></div><a class="mono" href="https://pump.fun/coin/CcqXU2nnLF9dmiZwzjMqMcej2DyRWteu46sLMuW3pump" target="_blank" rel="noopener">CcqXU2nnLF9dmiZwzjMqMcej2DyRWteu46sLMuW3pump ↗</a></div><div class="panel deploy-wait"><span class="pill"><span class="dot"></span>Tracking live market data</span><h2>Interact is indexing live launches</h2><p class="muted">Market cap, volume, and launch images are pulled from Dexscreener and launch metadata.</p></div></section>
  <section class="bento2">
    <div class="bx half"><a class="cover" href="#explore" aria-label="Explore coins"></a><div class="feedwrap"><div class="plistv" id="hfeed"></div></div><div class="bfoot"><span>Live posts</span><span>Explore →</span></div></div>
    <div class="bx half"><a class="cover" href="#board" aria-label="Open leaderboard"></a><div class="bin"><div class="bt"><span class="lab">Epoch #<span id="hEp">${en(S.epoch)}</span> ends in</span><span class="lab" id="hSpeed"></span></div><div class="bigcd" data-cd style="margin:8px 0 12px">${left(En.eEnd(S.epoch) - now())}</div><div class="ring" data-ring><i></i></div>
      ${live('hMini', () => { const g = globalBoard().slice(0, 4); return `<div class="lab" style="margin-top:14px">Projected leaders</div><ul class="mini2">${g.map((r, i) => { const a = A(r.h); return `<li><span class="rk">${i + 1}</span>${av(a, 24)}<span class="nm">${esc(a.name)}</span><span class="mono">${sol(r.amt)}</span></li>`; }).join('') || '<li class="faint">No eligible posts yet this epoch.</li>'}</ul>`; })}</div><div class="bfoot"><span>Leaderboard</span><span>Open →</span></div></div>
    <div class="bx"><a class="cover" href="#docs-fees" aria-label="Where fees go"></a><div class="bin"><div class="eyebrow">Where creator fees go</div>${live('hSplit', splitBar)}<div class="zero"><span>Deployer share</span><b>0%</b></div><p class="hint" style="margin-top:10px">Locked at launch. There's no field for it.</p></div><div class="bfoot"><span>Fee split</span><span>Docs →</span></div></div>
    <div class="bx"><a class="cover" href="#docs-score" aria-label="Scoring"></a><div class="bin"><div class="eyebrow">Post score</div><div class="formula" style="margin-top:10px;font-size:12px;padding:12px">target action
 × verified account
 × keyword proof
 × claimant wallet</div></div><div class="bfoot"><span>Scoring</span><span>Docs →</span></div></div>
    <div class="bx"><a class="cover" href="#earn" aria-label="Start claiming"></a><div class="bin"><div class="eyebrow">To unlock a claim you need</div><ul class="checks" style="margin-top:12px">
      <li><span class="m y">✓</span><span>An X account ${cfg().minAge}+ days old</span></li><li><span class="m y">✓</span><span>A linked Solana wallet</span></li><li><span class="m y">✓</span><span>The coin's minimum hold</span></li><li><span class="m y">✓</span><span>${esc(cfg().disclose[0])} in the post</span></li></ul></div><div class="bfoot"><span>Earn</span><span>Start →</span></div></div>
  </section>
  <section class="sec">${live('hStats', () => `<div class="kstats"><div><div class="eyebrow">Paid to interacters</div><div class="v">${sol(S.paidTotal)}</div><div class="n">All epochs</div></div><div><div class="eyebrow">Paid to deployers</div><div class="v">0 SOL</div><div class="n">By design</div></div><div><div class="eyebrow">Interactors paid</div><div class="v">${accounts().filter(a => a.earned > 0).length}</div><div class="n">Unique accounts</div></div><div><div class="eyebrow">Coins</div><div class="v">${S.tokens.length}</div><div class="n">${isTest() ? 'Test coins' : 'Registered'}</div></div></div>`)}</section>`; }
const splitBar = () => { const p = Math.round(cfg().poolShare * 100); return `<div class="splitbig"><div class="a" style="flex:${p}">Interactors ${p}%</div>${p < 100 ? `<div class="b" style="flex:${100 - p}">${100 - p}%</div>` : ''}</div>`; };
function initFeed() { const f = $('#hfeed'); if (!f) return; f.innerHTML = S.posts.filter(p => !En.ineligible(p)).slice(0, 4).map(p => postCard(p, { est: false })).join('') || '<p class="empty">Posts will appear here.</p>'; f._last = S.posts[0] && S.posts[0].id; }
function feedPush() { const f = $('#hfeed'); if (!f) return; const fresh = []; for (const p of S.posts) { if (p.id === f._last) break; if (!En.ineligible(p)) fresh.push(p); } f._last = S.posts[0] && S.posts[0].id; if (!fresh.length) return;
  const w = document.createElement('div'); w.innerHTML = fresh.slice(0, 2).map(p => postCard(p, { est: false })).join(''); const els = [...w.children]; els.reverse().forEach(el => f.prepend(el));
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { const h = els.reduce((s, el) => s + el.offsetHeight + 10, 0); f.style.transition = 'none'; f.style.transform = `translateY(${-h}px)`; f.offsetHeight; f.style.transition = 'transform .9s cubic-bezier(.2,.8,.2,1)'; f.style.transform = 'translateY(0)'; }
  while (f.children.length > 6) f.lastElementChild.remove(); }

function explore() { return `<div class="phead"><div><span class="eyebrow">Explore</span><h1 style="margin-top:10px">Coins to interact</h1><p>Every launch has a target, a condition, and a claim. Choose one and make the interaction happen.</p></div><a class="btn pri" href="#launch">Launch a coin</a></div>
  <div class="ctrl">${seg('exSort', [['pool', 'Most active'], ['open', 'Least crowded'], ['mc', 'Market cap'], ['new', 'Newest']], 'exGrid', 'exPage')}
   <label class="search"><span class="sr">Search coins</span>${IC.search}<input class="inp" id="exSearch" placeholder="Search name, ticker or address" value="${esc(ui.exQ)}" autocomplete="off"></label></div>
  ${live('exGrid', () => { const q = ui.exQ.trim().toLowerCase(); let arr = S.tokens.filter(t => !q || (t.name + ' ' + t.ticker + ' ' + t.mint).toLowerCase().includes(q));
    const by = { pool: (a, b) => b.pool - a.pool, open: (a, b) => (b.pool / (projCache(b.mint).rows.length + 1)) - (a.pool / (projCache(a.mint).rows.length + 1)), mc: (a, b) => b.mc - a.mc, new: (a, b) => b.created - a.created }[ui.exSort]; arr.sort(by);
    return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><span class="hint">${arr.length} coins · Coins update live <span data-cd>${left(En.eEnd(S.epoch) - now())}</span></span>${pager('exPage', arr.length, 16, 'exGrid')}</div>${arr.length ? `<div class="igrid">${pageOf(arr, 'exPage', 16).map(tokenCard).join('')}</div>` : `<p class="empty">${ui.exQ ? `No coins match “${esc(ui.exQ)}”.` : 'No coins yet.'}</p>`}`; })}`; }

function tokenPage(mint) { const t = T(mint); if (!t) return notFound();
  return `<div style="padding-top:22px"><a class="open-a" href="#explore">← Back to Explore</a></div>
  <div class="thead">${tk(t, 72)}<div style="min-width:0"><h1><span class="mono" style="font-size:.5em;color:var(--ink-3);letter-spacing:0">$${esc(t.ticker)}</span><br>${esc(t.name)}</h1>
   <div class="meta"><span class="pill">Launched ${ago(t.created)} ago</span><span class="pill">Min hold ${t.minHold}%</span>${t.sim ? '<span class="pill">Test coin</span>' : `<a class="pill" target="_blank" rel="noopener" href="https://pump.fun/coin/${t.mint}">Trade on pump.fun ↗</a>${t.graduated ? '<span class="pill">Graduated</span>' : ''}${t.caOnly ? '<span class="pill" title="This ticker is busy on X, so posts must include the contract address">Post with contract address</span>' : ''}`}<button class="pill" style="border:0" data-act="copy" data-v="${t.mint}">${short(t.mint)} ⧉</button></div></div>
   <div class="mc"><div class="eyebrow">Market cap</div><div class="v">${live('tMc', () => t.mc ? usdC(t.mc) : '—')}</div></div></div>
  ${live('tStats', () => { const pr = projCache(t.mint); return `<div class="kstats"><div><div class="eyebrow">Market status</div><div class="v">Live</div><div class="n">Dexscreener indexing active</div></div><div><div class="eyebrow">Pays out in</div><div class="v" data-cd>${left(En.eEnd(S.epoch) - now())}</div><div class="n">Every ${cfg().epochMin} minutes</div></div><div><div class="eyebrow">Interactors now</div><div class="v">${pr.rows.length}</div><div class="n">${pr.posts} posts · ${pr.inel} not eligible</div></div><div><div class="eyebrow">Paid all time</div><div class="v">${sol(t.paid)}</div><div class="n">Deployer received 0 SOL</div></div></div>`; })}
  <div class="tlay" style="margin-top:16px"><div class="panel" style="min-width:0"><div class="tabs" role="group">
    ${[['posts', 'Earning posts'], ['board', 'Projected payouts'], ['past', 'Past epochs']].map(([v, l]) => `<button data-act="set" data-k="tTab" data-v="${v}" data-r="tMain" data-reset="tPage" aria-pressed="${ui.tTab === v}">${l}</button>`).join('')}</div>
    <div class="pb" style="padding-top:12px">${live('tMain', () => tokenMain(t))}</div></div>
   <aside class="side">
    <div class="panel"><div class="ph"><span class="eyebrow">Your eligibility</span></div><div class="pb">${live('tMe', () => meChecks(t))}<a class="btn pri" style="width:100%;margin-top:14px" href="#earn" data-act="earnfor" data-v="${t.mint}">Trigger $${esc(t.ticker)}</a></div></div>
    <div class="panel"><div class="ph"><span class="eyebrow">Where this coin's fees go</span></div><div class="pb">${splitBar()}<div class="zero"><span>Deployer ${short(t.deployer, 4) || ''}</span><b>0%</b></div><p class="hint" style="margin-top:10px">The platform share keeps Interact running. Fee routing is locked at launch.</p></div></div>
    <div class="panel"><div class="ph"><span class="eyebrow">Claims by launch</span></div><div class="pb">${live('tChart', () => { const e = t.epochs.slice(0, 12).reverse(); if (e.length < 2) return '<p class="hint">Chart appears after two epochs.</p>'; return bars(e.map(x => x.paid + (x.held || 0)), e.map(x => '#' + en(x.n))); })}</div></div>
   </aside></div>`; }
function bars(vals, labels) { const W = 300, H = 120, pl = 4, pb = 18, n = vals.length, mx = Math.max(...vals, 1e-9) * 1.1, bw = (W - pl * 2) / n;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Paid per epoch">${vals.map((v, i) => { const h = (H - pb - 6) * v / mx; return `<rect x="${pl + i * bw + bw * .15}" y="${H - pb - h}" width="${bw * .7}" height="${h}" rx="2" fill="${i === n - 1 ? '#FAFAFA' : '#5A5A5A'}"><title>${labels[i]}: ${sol(v)}</title></rect>`; }).join('')}
  <text x="${pl}" y="${H - 4}">${labels[0]}</text><text x="${W - pl}" y="${H - 4}" text-anchor="end">${labels[n - 1]}</text></svg><p class="hint" style="margin-top:4px">Last ${n} epochs · latest ${sol(vals[n - 1])}</p>`; }
function tokenMain(t) {
  if (ui.tTab === 'posts') { const arr = S.posts.filter(p => p.mint === t.mint && En.active(p, S.epoch)); return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span class="hint">${arr.length} posts mention $${esc(t.ticker)} this epoch</span>${pager('tPage', arr.length, 8, 'tMain')}</div>${arr.length ? `<div class="plistv">${pageOf(arr, 'tPage', 8).map(p => postCard(p)).join('')}</div>` : '<p class="empty">No posts yet this epoch. First in gets the biggest share.</p>'}`; }
  if (ui.tTab === 'board') { const pr = projCache(t.mint); return `<p class="hint" style="margin-bottom:8px">If the epoch ended now. Shares above ${cfg().cap * 100}% are capped and the rest rolls into the next epoch${pr.rolled > 0 ? ` (${sol(pr.rolled)} would roll)` : ''}.</p>${lbTable(pr.rows.map(r => ({ ...r, a: A(r.h) })), 'tPage', 'tMain', true)}`; }
  const e = t.epochs; return `<div style="display:flex;justify-content:flex-end;margin-bottom:6px">${pager('tPage', e.length, 6, 'tMain')}</div><ul class="rows">${pageOf(e, 'tPage', 6).map(x => { const id = 'e' + t.mint.slice(0, 6) + x.n, open = ui.open.has(id);
    return `<li class="row${open ? ' open' : ''}"><div class="rh"><button class="rb" data-act="tog" data-id="${id}" aria-expanded="${open}"><span class="amt">${sol(x.paid + (x.held || 0))}</span><span class="sub">Epoch #${en(x.n)} · ${x.workers} interacters · ${x.posts} posts</span><span class="rt">${x.held ? `<span class="pill warn">${sol(x.held)} in review</span>` : ''}${x.rolled > 0.0001 ? `<span class="pill">${sol(x.rolled)} rolled</span>` : ''}<svg class="chev" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span></button></div>
    <div class="rdet">${x.rows.length ? `<ul class="bd">${x.rows.map(r => { const a = A(r.h); return a ? `<li><a href="#u-${a.handle}">${av(a, 18)}@${esc(a.handle)}</a><span class="lead"></span><span class="mono">${(r.share * 100).toFixed(1)}% · ${sol(r.amt)}${r.status === 'review' ? ' · review' : ''}</span></li>` : ''; }).join('')}</ul>` : '<p class="hint">No eligible posts. The whole pool rolled over.</p>'}</div></li>`; }).join('') || '<li class="empty">No settled epochs yet.</li>'}</ul>`; }
function lbTable(rows, key, region, showShare) { if (!rows.length) return '<p class="empty">Nobody eligible yet.</p>'; const page = pageOf(rows, key, 12), off = (ui[key] || 0) * 12;
  return `<div class="ox"><table class="lb"><thead><tr><th>#</th><th>Interactor</th>${showShare ? '<th>Share</th>' : '<th class="r">Coins</th>'}<th class="r">Posts</th><th class="r">${showShare || key === 'bPage' && ui.bTab === 'epoch' ? 'Projected' : 'Earned'}</th></tr></thead><tbody>
  ${page.map((r, i) => `<tr class="${r.a.handle === S.me ? 'me' : ''}"><td class="rk">${off + i + 1}</td><td><a class="u" href="#u-${r.a.handle}">${av(r.a, 30)}<span style="min-width:0">${esc(r.a.name)}${r.a.handle === S.me ? ' (you)' : ''}<small>@${esc(r.a.handle)}</small></span></a></td>
   ${showShare ? `<td><div style="display:flex;align-items:center;gap:8px"><div class="sharebar" style="flex:1"><i style="width:${Math.min(100, r.share / cfg().cap * 100)}%"></i></div><span class="mono" style="font-size:12px">${(r.share * 100).toFixed(1)}%${r.capped ? ' · cap' : ''}</span></div></td>` : `<td class="r mono">${r.coins}</td>`}
   <td class="r mono">${r.posts}</td><td class="r mono">${sol(r.amt)}</td></tr>`).join('')}</tbody></table></div><div style="display:flex;justify-content:flex-end;margin-top:8px">${pager(key, rows.length, 12, region)}</div>`; }
function meChecks(t) { const me = ME(); const c = [[!!me, 'Signed in with X', me ? '@' + me.handle : 'Sign in on the Earn page'], [!!me && me.age >= cfg().minAge, `Account ${cfg().minAge}+ days old`, me ? me.age + ' days' : '—'], [!!me && me.linked, 'Wallet linked', me && me.linked ? short(me.wallet, 4) : 'Not linked'], [!!me && (me.hold[t.mint] || 0) >= 1, `Holds ${t.minHold}% of supply`, me ? ((me.hold[t.mint] || 0) >= 1 ? `${((me.hold[t.mint]) * t.minHold).toFixed(3)}% held` : 'Below the minimum') : '—']];
  return `<ul class="checks">${c.map(x => `<li><span class="m ${x[0] ? 'y' : 'n'}">${x[0] ? '✓' : ''}</span><span>${x[1]}<small>${x[2]}</small></span></li>`).join('')}</ul>${isTest() && me && me.linked && (me.hold[t.mint] || 0) < 1 ? `<button class="btn sm" style="margin-top:10px" data-act="buy" data-v="${t.mint}">Buy the minimum (test)</button>` : ''}`; }

function board() { return `<div class="phead"><div><span class="eyebrow">Leaderboard</span><h1 style="margin-top:10px">Top interacters</h1><p>This epoch shows projected payouts across every coin if it ended now. All time shows what has been paid.</p></div><div style="text-align:right"><div class="lab">Epoch #${en(S.epoch)} ends in</div><div class="bigcd" style="font-size:36px" data-cd>${left(En.eEnd(S.epoch) - now())}</div></div></div>
  <div class="panel"><div class="ph">${seg('bTab', [['epoch', 'This epoch'], ['all', 'All time']], 'bMain', 'bPage')}</div>
  <div class="pb">${live('bMain', () => { if (ui.bTab === 'epoch') return lbTable(globalBoard().map(r => ({ ...r, a: A(r.h) })), 'bPage', 'bMain', false);
    const arr = accounts().filter(a => a.earned > 0).sort((a, b) => b.earned - a.earned).map(a => ({ a, amt: a.earned, coins: Object.keys(a.hold).length, posts: a.posts })); return lbTable(arr, 'bPage', 'bMain', false); })}</div></div>`; }

function userPage(h) { const a = A(h); if (!a) return notFound(); const flags = [a.age < cfg().minAge ? `${a.age}-day-old account` : null, !a.linked ? 'No wallet linked' : null, a.farm ? 'Low-quality engagement' : null, a.banned ? 'Suspended' : null].filter(Boolean);
  return `<div class="banner" style="background:${banner(a)}"></div><div class="pmeta"><img class="av bigav" src="${aimg(a)}" alt="" width="104" height="104" style="width:104px;height:104px">
   <div style="padding-bottom:6px;min-width:0"><h1 style="font-size:clamp(26px,3.6vw,40px)">${esc(a.name)}${a.handle === S.me ? ' <span class="pill" style="vertical-align:middle">You</span>' : ''}</h1><div class="faint" style="margin-top:6px">@${esc(a.handle)} · ${fmtN(a.followers)} followers · ${a.age} days on X</div></div></div>
  <div class="tagrow" style="margin-top:14px"><span class="flag">Trust ${(a.trust * 100).toFixed(0)}/100</span>${flags.map(f => `<span class="flag bad">${f}</span>`).join('')}</div>
  ${live('uStats', () => `<div class="kstats" style="margin-top:18px"><div><div class="eyebrow">Earned</div><div class="v">${sol(a.earned)}</div><div class="n">${usd(a.earned * S.sol)}</div></div><div><div class="eyebrow">Claimable</div><div class="v">${sol(a.claimable)}</div><div class="n">${a.handle === S.me ? '<a class="lnk" href="#earn">Claim on Earn</a>' : 'Unclaimed payouts'}</div></div><div><div class="eyebrow">Posts</div><div class="v">${a.posts}</div><div class="n">All coins</div></div><div><div class="eyebrow">This epoch</div><div class="v">${sol((globalBoard().find(r => r.h === a.handle) || { amt: 0 }).amt)}</div><div class="n">Projected</div></div></div>`)}
  <div class="panel" style="margin-top:16px"><div class="ph"><h2>Recent posts</h2></div><div class="pb">${live('uPosts', () => { const arr = S.posts.filter(p => p.h === a.handle); return `<div style="display:flex;justify-content:flex-end;margin-bottom:8px">${pager('uPage', arr.length, 8, 'uPosts')}</div>${arr.length ? `<div class="pgrid">${pageOf(arr, 'uPage', 8).map(p => postCard(p)).join('')}</div>` : '<p class="empty">No recent posts.</p>'}`; })}</div></div>`; }

/* ---------- Earn ---------- */
const D = { draft: '', handle: '', followers: '1200', age: '420', code: null };
function earnPage() { if (!ui.earnMint || !T(ui.earnMint)) ui.earnMint = (S.tokens.slice().sort((a, b) => b.pool - a.pool)[0] || {}).mint;
  return `<div class="phead"><div><span class="eyebrow">Claim</span><h1 style="margin-top:10px">Create the proof. Unlock the claim.</h1><p>${false ? 'Demo disabled.' : 'Connect X, create the required post, and let Interact verify the target account action before unlocking your claim.'}</p></div></div>
  <div class="ea"><div class="panel"><div class="pb" style="padding-top:20px" id="eSteps">${earnSteps()}</div></div><aside class="side">${live('eMe', earnSide)}</aside></div>`; }
function earnSteps() { const me = ME(), t = T(ui.earnMint); const st = (n, done, title, body) => `<div class="estep${done ? ' done' : ''}"><span class="num">${done ? '✓' : n}</span><div class="body"><h3>${title}</h3>${body}</div></div>`;
  let s1;
  if (me) s1 = `<p class="muted">Signed in as <b>@${esc(me.handle)}</b> · ${fmtN(me.followers)} followers · ${me.age} days old. <button class="lnk" data-act="signout">Sign out</button></p>`;
  else if (isTest()) s1 = `<div class="field"><label for="eHandle">Your X handle</label><div class="pre"><span>@</span><input class="inp" id="eHandle" value="${esc(D.handle)}" placeholder="yourhandle" autocomplete="off"></div></div><div class="frow"><div class="field"><label for="eFol">Followers</label><input class="inp" id="eFol" inputmode="numeric" value="${esc(D.followers)}"></div><div class="field"><label for="eAge">Account age (days)</label><input class="inp" id="eAge" inputmode="numeric" value="${esc(D.age)}"></div></div>
     <p class="hint">Test sign-in. Try an age under ${cfg().minAge} to see that rule block payouts.</p><button class="btn pri" data-act="signin" style="align-self:flex-start">Sign in</button>`;
  else if (S.chain && !S.chain.x) s1 = '<p class="notice">X sign-in is not connected on this server yet (the admin needs to add an X API token).</p>';
  else s1 = D.code ? `<p class="muted">Post this from <b>@${esc(D.handle)}</b>, then check:</p><div class="codebox"><code id="vText">Verifying my account for Interact: ${esc(D.code)}</code><button class="btn sm" data-act="copy" data-v="Verifying my account for Interact: ${esc(D.code)}">Copy</button></div><div class="ctas"><a class="btn" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent('Verifying my account for Interact: ' + D.code)}">Post on X</a><button class="btn pri" data-act="vcheck">I posted it</button></div>`
    : `<div class="field"><label for="eHandle">Your X handle</label><div class="pre"><span>@</span><input class="inp" id="eHandle" value="${esc(D.handle)}" placeholder="yourhandle" autocomplete="off"></div></div><p class="hint">You'll post a short code from this account so Interact knows it's yours.</p><button class="btn pri" data-act="vstart" style="align-self:flex-start">Get my code</button>`;
  const s2 = me && me.linked ? `<p class="muted">Payouts go to <span class="mono">${short(me.wallet, 6)}</span>.${isTest() ? '' : ' <button class="lnk" data-act="link">Change wallet</button>'}</p>` : `<p class="muted">Payouts are sent in SOL to this wallet. It's also where your holding is checked.</p><button class="btn ${me ? 'pri' : ''}" data-act="link" ${me ? '' : 'disabled'} style="align-self:flex-start">${isTest() ? 'Link test wallet' : 'Connect and sign with wallet'}</button>`;
  if (!t) return `<div class="stepbox">${st(1, !!me, isTest() ? 'Sign in' : 'Verify your X account', s1)}${st(2, !!(me && me.linked), 'Link a wallet', s2)}${st(3, false, 'Hold a coin', '<p class="muted">No coins have launched yet. Launch one, or check back soon.</p>')}</div>`;
  const opts = S.tokens.slice().sort((a, b) => b.pool - a.pool).map(x => `<option value="${x.mint}" ${x.mint === ui.earnMint ? 'selected' : ''}>$${esc(x.ticker)} · ${esc(x.name)} · pool ${sol(x.pool)}</option>`).join('');
  const held = me && (me.hold[t.mint] || 0) >= 1;
  const s3 = `<div class="field"><label for="eMint">Coin</label><select class="inp sel" id="eMint">${opts}</select></div><p class="muted">$${esc(t.ticker)} needs <b>${t.minHold}%</b> of supply in your linked wallet at settlement. Holding more boosts your score, up to ${cfg().holdMax}× at ten times the minimum.</p>
   ${held ? `<p class="hint ok">✓ You hold ${(me.hold[t.mint] * t.minHold).toFixed(3)}% (${me.hold[t.mint].toFixed(1)}× the minimum).</p>` : ''}
   ${isTest() ? (held ? `<button class="btn sm" data-act="buy" data-v="${t.mint}" data-x="10" style="align-self:flex-start">Top up to 10× (test)</button>` : `<button class="btn ${me && me.linked ? 'pri' : ''}" data-act="buy" data-v="${t.mint}" ${me && me.linked ? '' : 'disabled'} style="align-self:flex-start">Buy the minimum (test)</button>`) : (held ? '' : `<p class="hint">Holdings are read from your linked wallet on chain.</p><a class="btn" target="_blank" rel="noopener" style="align-self:flex-start" href="https://pump.fun/coin/${t.mint}">Buy $${esc(t.ticker)} on pump.fun</a>`)}`;
  const s4 = isTest() ? `<div class="field"><label for="eDraft">Your post</label><textarea class="inp" id="eDraft" rows="4" maxlength="280" placeholder="Write about $${esc(t.ticker)}. End with #ad.">${esc(D.draft)}</textarea><div style="display:flex;justify-content:space-between"><button class="lnk" data-act="sample">Use an example</button><span class="counter" id="eCount">${D.draft.length}/280</span></div></div><div id="eChecks">${draftChecks()}</div>
   <button class="btn pri" id="ePost" data-act="post" ${draftOk() ? '' : 'disabled'} style="align-self:flex-start">Post (test)</button>`
   : `<p class="muted">Create a post on X with ${t.caOnly ? `<b>the contract address</b> (<span class="mono">${short(t.mint, 5)}</span>, $${esc(t.ticker)} alone isn't tracked because that ticker is busy on X)` : `<b>$${esc(t.ticker)}</b>`} and <b>${esc(cfg().disclose[0])}</b>. Interact verifies the target action and unlocks the claim for ${cfg().postLifeHours ?? 24} hours. Only posts made after you verified count${cfg().minEngage ? `, and a post needs at least ${cfg().minEngage} likes, replies, reposts or quotes before it earns` : ''}.</p><a class="btn pri" target="_blank" rel="noopener" style="align-self:flex-start" href="https://x.com/intent/post?text=${encodeURIComponent('$' + t.ticker + ' ' + (t.caOnly ? t.mint + ' ' : '') + cfg().disclose[0])}">Post on X</a>`;
  return `<div class="stepbox">${st(1, !!me, isTest() ? 'Sign in' : 'Verify your X account', s1)}${st(2, !!(me && me.linked), 'Link a wallet', s2)}${st(3, held, 'Hold the coin', s3)}${st(4, false, 'Create the proof', s4)}</div>`; }
function draftList() { const me = ME(), t = T(ui.earnMint), d = D.draft; const norm = s => s.toLowerCase().replace(/[^a-z0-9$ ]/g, '').replace(/\s+/g, ' ').trim();
  const mine = me ? S.posts.filter(p => p.h === me.handle && p.mint === t.mint && p.ep === S.epoch).length : 0;
  const dup = d.trim() && S.posts.some(p => p.mint === t.mint && norm(p.text) === norm(d));
  return [[En.mentions(d, t), `Mentions $${t.ticker} or its address`, 'How posts are matched to a coin'], [En.discloseRe().test(d), `Includes ${cfg().disclose[0]}`, 'Paid promotion has to be disclosed'], [!!d.trim() && !dup, 'Not a copy of another post', 'Duplicates score zero'],
    [!!me && me.age >= cfg().minAge, `Account ${cfg().minAge}+ days old`, me ? me.age + ' days' : 'Sign in first'], [!!(me && me.linked), 'Wallet linked', me && me.linked ? 'Ready' : 'Step 2'], [!!me && (me.hold[t.mint] || 0) >= 1, 'Holds the minimum', 'Step 3'], [mine < cfg().maxPosts, `Under ${cfg().maxPosts} scoring posts this epoch`, `${mine} of ${cfg().maxPosts} used on $${t.ticker}`]]; }
const draftChecks = () => `<ul class="checks">${draftList().map(x => `<li><span class="m ${x[0] ? 'y' : 'n'}">${x[0] ? '✓' : ''}</span><span>${x[1]}<small>${x[2]}</small></span></li>`).join('')}</ul>`;
const draftOk = () => !!ME() && !!D.draft.trim() && draftList().slice(0, 2).every(x => x[0]);
function earnSide() { const me = ME(); if (!me) return `<div class="panel"><div class="pb" style="padding-top:18px"><div class="eyebrow">Your earnings</div><p class="muted" style="margin-top:10px">Sign in to see what you've earned and what's projected this epoch.</p></div></div>`;
  const proj = (globalBoard().find(r => r.h === me.handle) || { amt: 0 }).amt, mine = S.posts.filter(p => p.h === me.handle).slice(0, 4);
  return `<div class="panel"><div class="pb" style="padding-top:18px"><div class="eyebrow">Claimable</div><div class="pool" style="margin:8px 0 2px">${sol(me.claimable)}</div><div class="hint">${usd(me.claimable * S.sol)} · earned ${sol(me.earned)} all time</div>
   <button class="btn pri" style="width:100%;margin-top:14px" data-act="claim" ${me.claimable > 0 && me.linked ? '' : 'disabled'}>Claim to wallet</button>
   <div class="zero" style="margin-top:14px"><span>Projected this epoch</span><span class="mono" style="color:var(--ink)">${sol(proj)}</span></div>
   ${S.myHeld > 0 ? `<div class="zero" style="margin-top:8px"><span>In review</span><span class="mono" style="color:var(--ink)">${sol(S.myHeld)}</span></div>` : ''}
   <p class="hint" style="margin-top:8px">Pays out in <span data-cd>${left(En.eEnd(S.epoch) - now())}</span>.</p></div></div>
   ${mine.length ? `<div class="panel"><div class="ph"><span class="eyebrow">Your proofs</span><a class="open-a" href="#u-${me.handle}">All →</a></div><div class="pb plistv">${mine.map(p => postCard(p)).join('')}</div></div>` : ''}
   ${S.myClaims.length ? `<div class="panel"><div class="ph"><span class="eyebrow">Claims</span></div><div class="pb"><div class="plist">${S.myClaims.slice(0, 5).map(c => `<a href="#earn"><span style="min-width:0"><span class="nm" style="display:block">${sol(c.amt)}</span><span class="faint mono" style="font-size:11px">${c.sig ? `<a target="_blank" rel="noopener" href="https://solscan.io/tx/${c.sig}">${c.status} ↗</a>` : c.status}</span></span><span class="val mono faint">${ago(c.ts)} ago</span></a>`).join('')}</div></div></div>` : ''}`; }

/* ---------- Launch ---------- */
const L = { name: '', ticker: '', desc: '', img: null, minHold: .05, agree: false, busy: 0, done: null, dev: '', sig: null, target: '', action: 'keyword', keyword: '' };
const chainReady = () => !!(S.chain && S.chain.live && S.chain.ready);
function launchPage() { return `<div class="phead"><div><span class="eyebrow">Launch</span><h1 style="margin-top:10px">Launch a coin with a real unlock</h1><p>Every launch locks its creator-fee allocation behind a real X interaction. The creator defines who must act and what counts.</p></div></div>
  ${isTest() || chainReady() ? '' : `<p class="notice" style="margin-bottom:16px">Launching is switched off until the server is fully set up${S.chain && S.chain.problem ? ': ' + esc(S.chain.problem) : '.'}</p>`}
  <div class="lgrid"><div class="panel" id="lBody">${lBody()}</div><aside class="prev" id="lPrev">${lPrev()}</aside></div>`; }
function lBody() { if (L.done && T(L.done)) { const t = T(L.done); return `<div class="lform"><span class="pill ok" style="align-self:flex-start"><span class="dot"></span>Launched</span><h2>$${esc(t.ticker)} is live</h2><p class="muted">Its creator fees unlock only after the configured interaction is verified. The first epoch settles in <span data-cd>${left(En.eEnd(S.epoch) - now())}</span>.</p><div class="codebox"><code>${t.mint}</code><button class="btn sm" data-act="copy" data-v="${t.mint}">Copy</button></div><div class="ctas"><a class="btn pri" href="#t-${t.mint}">View coin</a>${t.sim ? '' : `<a class="btn" target="_blank" rel="noopener" href="https://pump.fun/coin/${t.mint}">pump.fun ↗</a>${L.sig ? `<a class="btn" target="_blank" rel="noopener" href="https://solscan.io/tx/${L.sig}">Transaction ↗</a>` : ''}`}<button class="btn" data-act="lreset">Launch another</button></div></div>`; }
  return `<form class="lform" id="lForm" novalidate>
   <div class="frow"><div class="field"><label for="lName">Name</label><input class="inp" id="lName" maxlength="32" value="${esc(L.name)}" placeholder="Quiet Otter"></div><div class="field"><label for="lTicker">Ticker</label><div class="pre"><span>$</span><input class="inp" id="lTicker" maxlength="10" value="${esc(L.ticker)}" placeholder="OTTER"></div></div></div>
   <div class="field"><span class="flab">Image</span><div class="upl"><div class="ph0" id="lImgPrev">${L.img ? `<img src="${L.img}" alt="">` : '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16l4-4 3 3 5-6 4 5M4 5h16v14H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'}</div><label class="btn sm" for="lImg">Choose image</label><input type="file" id="lImg" accept="image/*" class="sr"></div></div>
   <div class="field"><label for="lDesc">Description</label><textarea class="inp" id="lDesc" maxlength="240" placeholder="What is this coin about?">${esc(L.desc)}</textarea></div>
   <div class="field"><label for="lTarget">Target X account</label><input class="inp" id="lTarget" maxlength="15" value="${esc(L.target)}" placeholder="elon"><span class="hint">Creator fees unlock when this verified account interacts.</span></div>
   <div class="frow"><div class="field"><label for="lAction">Required interaction</label><select class="inp" id="lAction"><option value="keyword" ${L.action === 'keyword' ? 'selected' : ''}>Reply with keyword</option><option value="like" ${L.action === 'like' ? 'selected' : ''}>Like</option><option value="reply" ${L.action === 'reply' ? 'selected' : ''}>Reply</option><option value="repost" ${L.action === 'repost' ? 'selected' : ''}>Repost</option></select></div><div class="field"><label for="lKeyword">Keyword</label><input class="inp" id="lKeyword" maxlength="80" value="${esc(L.keyword)}" placeholder="INTERACT" ${L.action !== 'keyword' ? 'disabled' : ''}></div></div>
   ${isTest() ? '' : `<div class="field"><label for="lDev">First buy (optional, SOL)</label><input class="inp" id="lDev" inputmode="decimal" value="${esc(L.dev)}" placeholder="0"><span class="hint">Buys your coin in the same transaction so nobody snipes it before you. Up to ${S.chain ? S.chain.maxDevBuySol : 5} SOL. You pay about 0.02 SOL of Solana rent and fees to create the coin.</span></div>`}
   <div class="field"><span class="flab">Minimum hold to claim</span><div class="seg" role="group">${[.01, .05, .1].map(v => `<button type="button" data-act="lhold" data-v="${v}" aria-pressed="${L.minHold === v}">${v}% of supply</button>`).join('')}</div><span class="hint">Claimants must hold this amount before their verified interaction can unlock the allocation.</span></div>
   <div class="field"><span class="flab">Creator-fee unlock</span>${splitBar().replace('class="splitbig"', 'class="splitbig" style="margin:0"')}<div class="zero"><span>Your share as deployer</span><b>0%</b></div><span class="hint">The launch condition is fixed after deployment.</span></div>
   <hr class="divider" style="margin:0"><label class="check"><input type="checkbox" id="lAgree" ${L.agree ? 'checked' : ''}><span>I understand creator fees from this coin are routed to interacters permanently and I can't redirect them.</span></label>
   <div id="lSubmit">${lSubmit()}</div></form>`; }
const lValid = () => !!(L.name.trim() && L.ticker.trim() && L.target.trim() && L.action && (L.action !== 'keyword' || L.keyword.trim()) && L.agree && (isTest() || (chainReady() && L.img)));
const LIVE_STEPS = ['Upload image and metadata', 'Approve in your wallet', 'Send to Solana', 'Confirm Interact receives the creator fees'];
function lSubmit() { if (L.busy) return `<ol class="steps">${(isTest() ? ['Upload image and metadata', 'Create mint and bonding curve', 'Route creator fees to Interact', 'Check creator on chain', 'Open epoch #' + en(S.epoch)] : LIVE_STEPS).map((s, i) => `<li class="${i < L.busy - 1 ? 'done' : i === L.busy - 1 ? 'on' : ''}"><span class="s">${i < L.busy - 1 ? '✓' : i + 1}</span>${s}</li>`).join('')}</ol>`;
  return `<button type="submit" class="btn pri lg" style="width:100%" ${lValid() ? '' : 'disabled'}>Launch $${esc(L.ticker || 'COIN')}${isTest() ? ' (test)' : ''}</button><p class="hint" style="margin-top:8px;text-align:center">${isTest() ? (lValid() ? 'Test mode: the coin is created in Interact\'s database, not on chain.' : 'Add a name and ticker, and confirm the fee routing.') : !chainReady() ? 'Launching is switched off on this server.' : lValid() ? 'Your wallet will ask you to approve. The coin is created on pump.fun.' : 'Add a name, ticker and image, and confirm the fee routing.'}</p>`; }
function lPrev() { const fake = { hue: hash(L.ticker || 'x') % 360, ticker: L.ticker || 'C' }; const img = L.img || tokenImg(fake);
  return `<div class="icard" style="transform:none"><div class="fimg"><img src="${img}" alt=""><span class="fage">now</span><span class="fown">Waiting for deploy</span></div><div class="fmeta"><div class="n">${esc(L.name || 'Coin name')}<small>${esc(L.ticker || 'TICKER')}</small></div><div class="m"><span><b>Awaiting launch</b><small>status</small></span></div></div></div>`; }
async function shrinkImage(file) { const url = URL.createObjectURL(file); try { const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
  const c = document.createElement('canvas'); const px = isTest() ? 128 : 400; c.width = c.height = px; const x = c.getContext('2d'); const s = Math.min(img.width, img.height); x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, px, px); return isTest() ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9); } finally { URL.revokeObjectURL(url); } }
async function runLaunch() {
  if (!isTest()) return runLiveLaunch();
  for (let i = 1; i <= 5; i++) { L.busy = i; const s = $('#lSubmit'); if (s) s.innerHTML = lSubmit(); await new Promise(r => setTimeout(r, 450)); }
  try { const r = await api('/api/launch', { name: L.name, ticker: L.ticker, desc: L.desc, minHold: L.minHold, img: L.img, agree: L.agree }); L.done = r.mint; toast(`<span>Launched <b>$${esc(L.ticker)}</b>. Its fees now pay interacters.</span>`); }
  catch (e) { toast(`<span>${esc(e.message)}</span>`); }
  L.busy = 0; const b = $('#lBody'); if (b) b.innerHTML = lBody(); }

/* ---------- wallet (live mode) ---------- */
const getWallet = () => { const w = (window.phantom && window.phantom.solana) || window.solflare || window.backpack || window.solana; if (!w) throw new Error('No Solana wallet found in this browser. Install Phantom, Solflare or Backpack.'); return w; };
async function walletConnect() { const w = getWallet(); const r = await w.connect(); const pk = (r && r.publicKey) || w.publicKey; if (!pk) throw new Error('The wallet did not connect.'); return { w, wallet: pk.toString() }; }
let web3P = null;
const loadWeb3 = () => web3P || (web3P = new Promise((ok, bad) => { if (window.solanaWeb3) return ok(window.solanaWeb3); const sc = document.createElement('script'); sc.src = 'https://unpkg.com/@solana/web3.js@1.98.2/lib/index.iife.min.js'; sc.onload = () => ok(window.solanaWeb3); sc.onerror = () => { web3P = null; bad(new Error('Could not load the wallet library.')); }; document.head.appendChild(sc); }));
const b64ToBytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const bytesToB64 = b => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
async function postJSON(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Something went wrong.'); return j; }
function dataImageFile(dataUrl, name = 'token-image.png') { const [head, raw] = String(dataUrl || '').split(','); if (!raw) return null; const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png'; const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0)); return new File([bytes], name, { type: mime }); }
async function prepareLaunch(body) { const form = new FormData(); form.set('launch', JSON.stringify(body)); const file = dataImageFile(L.img); if (!file) throw new Error('Choose a token image first.'); form.set('image', file); const r = await fetch('/api/launch/prepare', { method: 'POST', credentials: 'same-origin', body: form }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not prepare launch.'); return j; }
async function runLiveLaunch() {
  const step = i => { L.busy = i; const s = $('#lSubmit'); if (s) s.innerHTML = lSubmit(); };
  try {
    const { w, wallet } = await walletConnect();
    step(1);
    const [solanaWeb3, prep] = await Promise.all([loadWeb3(), prepareLaunch({ name: L.name, symbol: L.ticker, description: L.desc, wallet, totalSupply: '1000000000', decimals: 6, targetUsername: L.target, action: L.action, keyword: L.keyword })]);
    step(2);
    const txs = (prep.transactions || []).map(t => solanaWeb3.VersionedTransaction.deserialize(b64ToBytes(t.transaction)));
    // One approval for both when the first buy needs its own transaction.
    const signed = txs.length > 1 && w.signAllTransactions ? await w.signAllTransactions(txs) : [await w.signTransaction(txs[0]), ...(txs[1] ? [await w.signTransaction(txs[1])] : [])];
    step(3);
    const wire = t => { const b = t.serialize({ requireAllSignatures: false, verifySignatures: false }); return bytesToB64(b instanceof Uint8Array ? b : Uint8Array.from(b)); };
    step(4);
    const r = await postJSON('/api/launch/confirm', { intentId: prep.intentId, transaction: wire(signed[0]), name: L.name, symbol: L.ticker, description: L.desc, metadataUri: prep.metadataUri, targetUsername: L.target, action: L.action, keyword: L.keyword });
    if (r.buyError) toast(`<span>${esc(r.buyError)}</span>`);
    apply(await fetchState()); L.done = r.mint; L.sig = r.signature;
    toast(`<span>Launched <b>$${esc(L.ticker)}</b> on pump.fun. Its creator fees now pay interacters.</span>`);
  } catch (e) { toast(`<span>${esc(/reject|denied|cancel/i.test(e.message || '') ? 'You cancelled in your wallet.' : e.message || String(e))}</span>`); }
  L.busy = 0; const b = $('#lBody'); if (b) b.innerHTML = lBody(); }

/* ---------- docs ---------- */
const DOCS = [['fees', 'Where fees go'], ['epochs', 'Epochs'], ['eligible', 'Who can earn'], ['score', 'Scoring'], ['caps', 'Caps and rollover'], ['claim', 'Claiming'], ['abuse', 'Anti-abuse'], ['disclose', 'Disclosure']];
function docsPage(sec) { if (sec) queue(() => { const el = document.getElementById('d-' + sec); if (el) el.scrollIntoView(); }); queue(calcRun); const c = cfg(), w = c.weights, P = Math.round(c.poolShare * 100);
  const H = n => `<h2><span>${String(n).padStart(2, '0')}</span>${DOCS[n - 1][1]}</h2>`;
  return `<div class="phead"><div><span class="eyebrow">How it works</span><h1 style="margin-top:10px">The Interact system</h1><p>A launchpad where each creator-fee allocation is tied to a specific, verifiable X interaction. These are the live rules.</p></div></div>
  <div class="dgrid"><nav class="toc" aria-label="Contents"><ol>${DOCS.map((d, i) => `<li><a href="#docs-${d[0]}"><span>${i + 1}</span>${d[1]}</a></li>`).join('')}</ol></nav><article class="prose">
  <section id="d-fees">${H(1)}<p>Every Interact launch records a target X account, an action, and an optional keyword. Creator fees stay locked until the target action is verified against a real post.</p>
   <dl class="kv"><dt>Interactor pool</dt><dd>${P}%, split among verified claimants every epoch</dd>${P < 100 ? `<dt>Platform</dt><dd>${100 - P}%, the Interact platform fee (covers X API access, servers and payouts)</dd>` : ''}<dt>Deployer</dt><dd>0% for launching. A deployer who posts about their coin and holds it earns from the interacter pool under the same rules and caps as everyone else</dd></dl></section>
  <section id="d-epochs">${H(2)}<p>Fees accrue into the coin's pool as it trades. Every ${c.epochMin} minutes the epoch closes: Interact checks holdings, measures the new likes, replies, reposts and quotes each eligible post got during that epoch, computes scores and credits payouts. A post keeps earning for ${c.postLifeHours ?? 24} hours after it's posted, so a post that takes off later still gets paid for it, as long as you keep holding and don't delete it.</p></section>
  <section id="d-eligible">${H(3)}<dl class="kv"><dt>Mentions the coin</dt><dd>$TICKER or the contract address</dd><dt>Target proof</dt><dd>Verified like, reply, repost, or keyword interaction from the configured account</dd><dt>Account age</dt><dd>${c.minAge} days or older</dd><dt>Linked wallet</dt><dd>Verified by signing a message</dd><dt>Holds the coin</dt><dd>The coin's minimum (0.01%, 0.05% or 0.1% of supply) at settlement</dd><dt>Wallet</dt><dd>The verified user supplies the receiving wallet before claiming</dd>${c.minEngage ? `<dt>Some reach</dt><dd>At least ${c.minEngage} likes, replies, reposts or quotes combined (views don't count)</dd>` : ''}<dt>In good standing</dt><dd>Not suspended, post not removed by a moderator</dd></dl></section>
  <section id="d-score">${H(4)}<div class="formula">score      = engagement^${c.exponent} × trust × hold × early

engagement = (${w.like}·likes + ${w.reply}·replies + ${w.repost}·reposts + ${w.quote}·quotes + ${w.kview}·views/1000)
             × engager quality
trust      = 0.1 – 1.0   account age, follower quality, flags
hold       = 1 + 0.5·log10(holding ÷ minimum), capped at ${c.holdMax}
early      = ${c.earlyMax} in the first ${c.earlyHours}h after launch, easing to 1.0 by ${c.earlyFade}h</div>
   <div class="tester"><div class="flab">Score calculator</div><div class="calc">${[['cLikes', 'Likes', 120], ['cReplies', 'Replies', 18], ['cReposts', 'Reposts', 14], ['cQuotes', 'Quotes', 4], ['cViews', 'Views', 9000], ['cTrust', 'Trust (0–1)', 0.8], ['cHold', 'Holding × minimum', 3], ['cHrs', 'Hours after launch', 2], ['cPool', 'Epoch pool (SOL)', 12], ['cOthers', 'Everyone else\'s score', 400]].map(([id, l, v]) => `<div class="field"><label for="${id}">${l}</label><input class="inp mono" id="${id}" inputmode="decimal" value="${v}"></div>`).join('')}</div><div class="calcout" id="cOut"></div></div></section>
  <section id="d-caps">${H(5)}<p>Each account's payout for one coin in one epoch is capped at <b>${c.cap * 100}%</b> of the pool, and only its best <b>${c.maxPosts}</b> posts for that coin count. Anything a cap keeps back rolls into the next epoch, as does the whole pool when nobody eligible posted. Single payouts of ${c.reviewSol} SOL or more are held for a manual review before they're claimable.</p></section>
  <section id="d-claim">${H(6)}<p>Balances accumulate across epochs and coins. After each epoch Interact computes a Merkle root over every wallet's cumulative earnings, which an on-chain distributor uses to pay claims. Unclaimed balances don't expire.</p></section>
  <section id="d-abuse">${H(7)}<dl class="kv"><dt>Holding requirement</dt><dd>Farms must buy the coin before they can farm it</dd><dt>Account age</dt><dd>Fresh accounts can't earn</dd><dt>Diminishing returns</dt><dd>The exponent, the post limit and the cap</dd><dt>Engager quality</dt><dd>Engagement from flagged accounts is discounted</dd><dt>Duplicates</dt><dd>Copy-paste posts score zero</dd><dt>Review</dt><dd>Large payouts wait for a moderator</dd></dl></section>
  <section id="d-disclose">${H(8)}<p>Interact verifies real public actions through the X API. It does not automate likes, replies, reposts, or posting. Creators should disclose promotional relationships where required.</p></section>
  </article></div>`; }
function calcRun() { const g = id => parseFloat(($('#' + id) || {}).value) || 0; const o = $('#cOut'); if (!o) return; const c = cfg(), w = c.weights;
  const raw = w.like * g('cLikes') + w.reply * g('cReplies') + w.repost * g('cReposts') + w.quote * g('cQuotes') + w.kview * g('cViews') / 1000; const base = Math.pow(raw, c.exponent); const hold = Math.min(c.holdMax, 1 + .5 * Math.log10(Math.max(1, g('cHold')))); const h = g('cHrs'), early = h <= c.earlyHours ? c.earlyMax : h >= c.earlyFade ? 1 : c.earlyMax - (c.earlyMax - 1) * (h - c.earlyHours) / (c.earlyFade - c.earlyHours);
  const s = base * Math.min(1, Math.max(0, g('cTrust'))) * hold * early; const share = s / ((s + g('cOthers')) || 1); const pay = Math.min(share, c.cap) * g('cPool');
  o.innerHTML = `<div><div class="lab">Score</div><div class="v">${s.toFixed(1)}</div></div><div><div class="lab">Share</div><div class="v">${(share * 100).toFixed(1)}%${share > c.cap ? ` → ${c.cap * 100}% cap` : ''}</div></div><div><div class="lab">Payout</div><div class="v">${sol(pay)}</div></div>`; }
const notFound = () => `<div class="phead"><div><span class="eyebrow">Not found</span><h1 style="margin-top:10px">Nothing here</h1><p style="margin-top:18px"><a class="btn" href="#explore">Go to Explore</a></p></div></div>`;

function openWhy(id) { const p = S.pmap[id]; if (!p) return; const a = A(p.h), t = T(p.mint), bad = En.ineligible(p), sc = En.score(p);
  const row = En.active(p, S.epoch) ? projCache(p.mint).rows.find(r => r.h === p.h) : null;
  $('#modal').innerHTML = `<div class="paper why" role="dialog" aria-modal="true" aria-labelledby="wT"><div class="rtop"><span class="eyebrow" id="wT">Why this post ${bad ? 'doesn\'t earn' : 'scores'}</span><button class="x" data-act="close" aria-label="Close">×</button></div>
   <div style="display:flex;gap:10px;align-items:center">${av(a, 32)}<div><b>${esc(a.name)}</b><div class="faint" style="font-size:12.5px">@${esc(a.handle)} · on $${esc(t.ticker)}</div></div></div><p style="margin:12px 0;font-size:14px">${linkify(p.text)}</p><hr>
   ${bad ? `<p><b>${esc(bad[0])}</b></p><p class="muted" style="margin-top:6px">${esc(bad[1])}</p>` : `
   <div class="row2"><span>New engagement this epoch (${sc.m.likes} likes, ${sc.m.replies} replies, ${sc.m.reposts} reposts, ${sc.m.quotes} quotes, ${fmtN(sc.m.views)} views)</span><span>${sc.raw.toFixed(1)}</span></div>
   <div class="row2"><span>× engager quality</span><span>${sc.q.toFixed(2)}</span></div><div class="row2"><span>^${cfg().exponent}</span><span>${sc.base.toFixed(1)}</span></div>
   <div class="row2"><span>× trust</span><span>${sc.trust.toFixed(2)}</span></div><div class="row2"><span>× hold</span><span>${sc.hold.toFixed(2)}</span></div><div class="row2"><span>× early</span><span>${sc.early.toFixed(2)}</span></div>
   <div class="row2 tot"><span>Score</span><span>${sc.score.toFixed(1)}</span></div>
   ${row ? `<hr><p class="muted">@${esc(a.handle)}'s best ${row.posts} post${row.posts > 1 ? 's' : ''} on $${esc(t.ticker)} add up to ${(row.share * 100).toFixed(1)}% of this epoch's scores${row.capped ? `, capped at ${cfg().cap * 100}%` : ''}. Projected payout <b class="mono" style="color:var(--ink)">${sol(row.amt)}</b>.</p>` : ''}`}</div>`;
  $('#modal').hidden = false; $('#modal .x').focus(); }
const closeModal = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };

/* ---------- router ---------- */
const ROUTES = { home, explore, t: tokenPage, u: userPage, earn: earnPage, board, launch: launchPage, docs: docsPage };
let curRoute = '';
function render(scroll = true) { if (!S) return; const h = decodeURIComponent(location.hash.slice(1)) || 'home'; const i = h.indexOf('-'); const r = i < 0 ? h : h.slice(0, i), arg = i < 0 ? '' : h.slice(i + 1);
  if (r !== curRoute || arg !== ui._arg) { ['tPage', 'uPage', 'bPage'].forEach(k => ui[k] = 0); ui.open.clear(); } ui._arg = arg; curRoute = r; liveFns = []; mountQ = [];
  $('#app').innerHTML = (ROUTES[r] || notFound)(arg);
  $$('.sidenav a').forEach(a => a.dataset.nav === r ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')); sbDrawer(false); $('#gDD').innerHTML = '';
  if (scroll) scrollTo(0, 0); mountQ.forEach(f => f()); mountQ = []; renderChrome(); }
addEventListener('hashchange', () => render(true));
function renderChrome() { if (!S) return; const me = ME(), el = $('#acct');
  el.innerHTML = me ? `<span class="acav" style="overflow:hidden">${av(me, 40)}</span><span class="acn"><b>@${esc(me.handle)}</b><small>${sol(me.claimable)} to claim</small></span>` : `<span class="acav" style="overflow:hidden"><img class="logo" src="${LOGO}" alt=""></span><span class="acn"><b>Start claiming</b><small>${isTest() ? 'Sign in' : 'Connect X'}</small></span>`;
  const wb = $('#walletBtn'); wb.textContent = me ? (me.linked ? short(me.wallet, 4) : '@' + me.handle) : 'Start claiming';
  $('#clockLab').innerHTML = !isTest() ? '<b>Live</b> · Solana mainnet' : S.speed === 0 || (S.clock && S.clock.speed === 0) ? 'Clock <b>paused</b>' : `Clock <b>${S.clock.speed}×</b>`;
  const mb = $('#modebar'); mb.hidden = true;
  const he = $('#hEp'); if (he) he.textContent = en(S.epoch); const hs = $('#hSpeed'); if (hs) hs.textContent = S.clock.speed === 1 ? 'Real time' : `Clock ${S.clock.speed}×`;
  feedPush(); }
function sbDrawer(o) { document.body.classList.toggle('sbo', o); $('#scrim').hidden = !o; }
$('#scrim').addEventListener('click', () => sbDrawer(false));
try { if (localStorage.getItem('echo-sbc')) document.body.classList.add('sbc'); } catch (_) {}
const rerenderEarn = () => { const s = $('#eSteps'); if (s) s.innerHTML = earnSteps(); refresh('eMe'); refresh('tMe'); renderChrome(); };

async function phantomLink() {
  const { w, wallet } = await walletConnect();
  const { message } = await api('/api/link/nonce', {});
  const signed = await w.signMessage(new TextEncoder().encode(message), 'utf8');
  const sig = signed.signature || signed; const B = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n; for (const b of sig) n = n * 256n + BigInt(b); let s = ''; while (n > 0n) { s = B[Number(n % 58n)] + s; n /= 58n; } for (const b of sig) { if (b === 0) s = '1' + s; else break; }
  return api('/api/link/verify', { wallet, signature: s });
}

const ACT = {
  set(a) { const k = a.dataset.k, v = a.dataset.v; ui[k] = /^-?\d+$/.test(v) ? +v : v; if (a.dataset.reset) ui[a.dataset.reset] = 0; const g = a.parentElement; if (g && (g.classList.contains('seg') || g.classList.contains('tabs'))) [...g.children].forEach(b => b.setAttribute('aria-pressed', b === a)); refresh(a.dataset.r); },
  tog(a) { const id = a.dataset.id, row = a.closest('.row'), o = !ui.open.has(id); o ? ui.open.add(id) : ui.open.delete(id); row && row.classList.toggle('open', o); a.setAttribute('aria-expanded', o); },
  why(a) { openWhy(a.dataset.id); }, close() { closeModal(); },
  copy(a) { const o = a.textContent; try { navigator.clipboard.writeText(a.dataset.v).then(() => { a.textContent = 'Copied'; setTimeout(() => a.textContent = o, 1200); }).catch(() => toast('<span>Copy was blocked. Select the text instead.</span>')); } catch (_) { toast('<span>Copy was blocked. Select the text instead.</span>'); } },
  sb() { if (innerWidth <= 900) sbDrawer(!document.body.classList.contains('sbo')); else { const c = document.body.classList.toggle('sbc'); try { localStorage.setItem('echo-sbc', c ? '1' : ''); } catch (_) {} } },
  signin: () => run(async () => { D.handle = ($('#eHandle') || {}).value || ''; D.followers = ($('#eFol') || {}).value || ''; D.age = ($('#eAge') || {}).value || ''; await api('/api/signin', { handle: D.handle, followers: D.followers, age: D.age }); if (MODE === 'local') SESS.handle = D.handle.trim().replace(/^@/, '').toLowerCase(); apply(MODE === 'local' ? localSnap() : await fetchState()); rerenderEarn(); toast(`<span>Signed in as <b>@${esc(S.me)}</b></span>`); }),
  signout: () => run(async () => { await api('/api/signout', {}); if (MODE === 'local') { SESS.handle = null; apply(localSnap()); } rerenderEarn(); }),
  vstart: () => run(async () => { D.handle = ($('#eHandle') || {}).value || ''; const r = await api('/api/verify/start', { handle: D.handle }); D.code = r.code; rerenderEarn(); }),
  vcheck: () => run(async () => { await api('/api/verify/check', {}); D.code = null; rerenderEarn(); toast(`<span>Verified <b>@${esc(S.me)}</b></span>`); }),
  link: () => run(async () => { if (isTest()) await api('/api/link', {}); else await phantomLink(); rerenderEarn(); toast('<span>Wallet linked</span>'); }),
  buy: a => run(async () => { const x = parseFloat(a.dataset.x) || 1.2; await api('/api/buy', { mint: a.dataset.v, x }); rerenderEarn(); toast(`<span>Bought $${esc(T(a.dataset.v).ticker)} to ${x}× the minimum (test)</span>`); }),
  sample() { const t = T(ui.earnMint); D.draft = `Been holding $${t.ticker} since ${ago(t.created)} ago and the ${t.name} crowd keeps showing up. ${cfg().disclose[0]}`; rerenderEarn(); },
  post: () => run(async () => { if (!draftOk()) return; const r = await api('/api/post', { mint: ui.earnMint, text: D.draft }); D.draft = ''; rerenderEarn(); toast(r.ineligible ? `<span>Posted, but it won't earn yet: ${esc(r.ineligible)}.</span>` : '<span>Posted. Watch the score climb as engagement comes in.</span>'); }),
  claim: a => run(async () => { if (a) a.disabled = true; try { if (!isTest()) { const me = ME(); const r = await postJSON('/api/interaction/check', { mint: ui.earnMint, walletAddress: me?.wallet || '' }); if (!r.ok) throw new Error(r.error || 'The required interaction has not been verified yet.'); toast('<span>Interaction verified. Your claim is queued for payout.</span>'); } else { const r = await api('/api/claim', {}); toast(`<span>Claimed <b>${sol(r.claim.amt)}</b> (test)</span>`); } rerenderEarn(); } finally { if (a) a.disabled = false; } }),
  earnfor(a) { ui.earnMint = a.dataset.v; },
  lhold(a) { L.minHold = parseFloat(a.dataset.v); [...a.parentElement.children].forEach(b => b.setAttribute('aria-pressed', b === a)); },
  lreset() { Object.assign(L, { name: '', ticker: '', desc: '', img: null, agree: false, done: null, dev: '', sig: null, target: '', action: 'keyword', keyword: '' }); $('#lBody').innerHTML = lBody(); $('#lPrev').innerHTML = lPrev(); }
};
document.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (!a) return; const act = a.dataset.act;
  if (a.tagName === 'A') { if (ACT[act]) ACT[act](a, e); return; } if (a.type !== 'submit') e.preventDefault(); ACT[act] && ACT[act](a, e); });
document.addEventListener('submit', e => { if (e.target.id === 'lForm') { e.preventDefault(); if (lValid() && !L.busy) runLaunch(); } });
document.addEventListener('input', e => { const id = e.target.id, v = e.target.value;
  if (id === 'exSearch') { ui.exQ = v; ui.exPage = 0; refresh('exGrid'); return; }
  if (id === 'gSearch') { gSearch(v); return; }
  if (id === 'eDraft') { D.draft = v; $('#eChecks').innerHTML = draftChecks(); $('#ePost').disabled = !draftOk(); $('#eCount').textContent = v.length + '/280'; return; }
  if (id === 'eHandle') D.handle = v; if (id === 'eFol') D.followers = v; if (id === 'eAge') D.age = v;
  if (id && id[0] === 'c' && $('#cOut')) calcRun();
  if (id === 'lDev') { L.dev = v.replace(/[^0-9.]/g, ''); return; }
  const m = { lName: 'name', lTicker: 'ticker', lDesc: 'desc', lTarget: 'target', lKeyword: 'keyword' }; if (m[id]) { L[m[id]] = id === 'lTicker' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '') : v; if (id === 'lTicker') e.target.value = L.ticker; $('#lPrev').innerHTML = lPrev(); $('#lSubmit').innerHTML = lSubmit(); } });
document.addEventListener('change', async e => { const id = e.target.id; if (id === 'eMint') { ui.earnMint = e.target.value; rerenderEarn(); } if (id === 'lAgree') { L.agree = e.target.checked; $('#lSubmit').innerHTML = lSubmit(); } if (id === 'lAction') { L.action = e.target.value; $('#lKeyword').disabled = L.action !== 'keyword'; $('#lSubmit').innerHTML = lSubmit(); }
  if (id === 'lImg' && e.target.files[0]) { try { L.img = await shrinkImage(e.target.files[0]); $('#lImgPrev').innerHTML = `<img src="${L.img}" alt="">`; $('#lPrev').innerHTML = lPrev(); } catch (_) { toast('<span>That image could not be read. Try a PNG or JPG.</span>'); } } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); sbDrawer(false); $('#gDD').innerHTML = ''; }
  if (e.key === 'Enter' && e.target.id === 'gSearch') { e.preventDefault(); ui.exQ = e.target.value; e.target.value = ''; $('#gDD').innerHTML = ''; location.hash === '#explore' ? render(false) : location.hash = 'explore'; }
  if (e.key === 'Enter' && ['eHandle', 'eFol', 'eAge'].includes(e.target.id)) { e.preventDefault(); isTest() ? ACT.signin() : ACT.vstart(); } });
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
function gSearch(q) { q = q.trim().toLowerCase().replace(/^@/, ''); const dd = $('#gDD'); if (!q) { dd.innerHTML = ''; return; }
  const ts = S.tokens.filter(t => (t.name + ' ' + t.ticker + ' ' + t.mint).toLowerCase().includes(q)).sort((a, b) => b.pool - a.pool).slice(0, 5), as = accounts().filter(a => (a.handle + ' ' + a.name).toLowerCase().includes(q)).slice(0, 4);
  dd.innerHTML = `<div class="dd">${ts.length ? '<div class="gh">Coins</div>' + ts.map(t => `<a href="#t-${t.mint}">${tk(t, 24)}<b>${esc(t.name)}</b><span class="faint">$${esc(t.ticker)} · ${sol(t.pool)} pool</span></a>`).join('') : ''}${as.length ? '<div class="gh">Interactors</div>' + as.map(a => `<a href="#u-${a.handle}">${av(a, 24)}<b>${esc(a.name)}</b><span class="faint">@${esc(a.handle)}</span></a>`).join('') : ''}${!ts.length && !as.length ? '<div class="gh" style="padding-bottom:10px">No matches</div>' : ''}</div>`; }
document.addEventListener('focusout', e => { if (e.target.id === 'gSearch') setTimeout(() => { const d = $('#gDD'); if (d && !d.contains(document.activeElement)) d.innerHTML = ''; }, 200); });

/* ---------- boot ---------- */
ui = { open: new Set(), exSort: 'pool', exQ: '', exPage: 0, tTab: 'posts', tPage: 0, bTab: 'epoch', bPage: 0, uPage: 0, earnMint: null };
(async function boot() {
  try { if (location.protocol === 'file:' || window.ECHO_STANDALONE) throw new Error('Open the deployed Interact site to use live data.'); apply(await fetchState()); MODE = 'server'; }
  catch (e) { MODE = 'server'; document.querySelector('#app').innerHTML = `<p class="empty">${esc(e.message || 'Live data is temporarily unavailable.')}</p>`; return; }
  render(true); setInterval(poll, 30000);
})();
})();
