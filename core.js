/*
 * Clout core: world lifecycle and the public API handlers.
 * Pure JavaScript. The Node server wraps these in HTTP; the standalone demo
 * calls them directly in the browser.
 */
(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const E = isNode ? require('./engine.js') : root.Engine;
  const Sim = isNode ? require('./sim.js') : root.Sim;
  const Core = {};

  const fail = (status, msg) => { const e = new Error(msg); e.status = status; throw e; };
  const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

  Core.create = (opts = {}) => {
    const S = E.newWorld(opts.cfg || {});
    E.setState(S);
    if (S.cfg.mode === 'test') Sim.seed(S, opts.seed ?? 77);
    else { S.epoch = E.epochOf(E.now()); S.gen = S.epoch - 1; }
    Core.log(S, 'World created in ' + S.cfg.mode + ' mode');
    return S;
  };

  // Freeze the clock at save time so time doesn't jump while the server is off.
  Core.serialize = S => {
    S.clock = { base: E.now(), real: Date.now(), speed: S.clock.speed };
    return JSON.stringify(S, (k, v) => (k === 'tmap' || k === 'pmap') ? undefined : v);
  };
  Core.load = json => {
    const S = typeof json === 'string' ? JSON.parse(json) : json;
    S.clock.real = Date.now();
    // Live worlds run on real time: time the server was down (restarts, deploys) must not be lost,
    // or epochs drift away from the clock X and Solana use.
    if (S.cfg.mode === 'live') S.clock = { base: Date.now(), real: Date.now(), speed: 1 };
    for (const k of Object.keys(E.DEFAULTS)) if (S.cfg[k] === undefined) S.cfg[k] = JSON.parse(JSON.stringify(E.DEFAULTS[k]));
    // Worlds saved before the 80/20 split: move to it, unless live coins already launched under the old split.
    if (S.cfg.poolShare === 0.9 && !S.tokens.some(t => t.creatorEnc)) S.cfg.poolShare = 0.8;
    if (S.cfg.mode === 'live') for (const h in S.acc) { const a = S.acc[h];   // accounts the old X poller created for people who never signed in
      if (!a.sim && !a.verified && !a.linked && !a.earned && !a.claimable && a.xid) { delete S.acc[h]; S.posts = S.posts.filter(p => p.h !== h); }
      else if (a.linked && a.xid) a.verified = true; }
    S.xids = {}; for (const h in S.acc) if (S.acc[h].xid && !S.xids[S.acc[h].xid]) S.xids[S.acc[h].xid] = h;   // X user id -> account
    E.setState(S);
    return S;
  };

  Core.log = (S, msg) => { S.log.unshift({ ts: Date.now(), msg }); if (S.log.length > 300) S.log.pop(); };

  // Advance the world by `realMs` of wall time: simulate (test mode) and settle finished epochs.
  Core.tick = (S, realMs) => {
    E.setState(S);
    if (S.cfg.mode === 'test' && S.cfg.simRunning && S.clock.speed > 0) Sim.step(S, realMs);
    const done = E.advance();
    for (const r of done) Core.log(S, `Epoch #${E.en(r.n)} settled: ${r.paid.toFixed(3)} SOL paid to ${r.workers} accounts${r.held ? `, ${r.held.toFixed(3)} SOL held for review` : ''}`);
    // Keep the post list bounded: drop simulated posts older than 12 epochs.
    if (S.posts.length > 4000) { const cut = E.now() - E.lifeMs() - 6 * E.epochLen(); S.posts = S.posts.filter(p => p.ts >= cut || !p.sim); E.reindex(); }
    return done;
  };

  const me = (S, sess) => (sess && sess.handle && S.acc[sess.handle]) ? S.acc[sess.handle] : null;
  const needMe = (S, sess) => me(S, sess) || fail(401, 'Sign in first.');
  const needTest = S => S.cfg.mode === 'test' || fail(400, 'This action only exists in test mode.');

  // What a browser gets. Only the signed-in account's claims and wallet are included.
  Core.snapshot = (S, sess) => {
    E.setState(S);
    const m = me(S, sess), mh = m ? m.handle : null, minEp = S.epoch - 2;
    const posts = [];
    for (const p of S.posts) { if (p.ep >= minEp || p.h === mh || E.active(p, S.epoch)) posts.push(p); if (posts.length >= 1200) break; }
    const acc = {};
    for (const h in S.acc) { const { holdSeen, ...a } = S.acc[h]; acc[h] = { ...a, wallet: a.handle === mh ? a.wallet : (a.wallet ? a.wallet.slice(0, 4) + '…' + a.wallet.slice(-4) : null) }; }
    return {
      v: S.v, cfg: S.cfg, simNow: E.now(), speed: S.clock.speed, epoch: S.epoch, gen: S.gen, sol: S.sol,
      proto: S.proto, feesTotal: S.feesTotal, paidTotal: S.paidTotal, acc, posts,
      tokens: S.tokens.map(t => { if (!t.creatorEnc) return t; const { creatorEnc, ...pub } = t; return pub; }),   // keys never leave the server
      settles: S.settles.slice(0, 30), me: mh,
      myClaims: mh ? S.claims.filter(c => c.h === mh).slice(0, 20) : [],
      myHeld: mh ? S.reviews.filter(r => r.h === mh && r.status === 'pending').reduce((s, r) => s + r.amt, 0) : 0,
      liveReady: !!S.liveReady
    };
  };

  Core.handlers = {
    'POST /api/signin': (S, sess, b) => {
      needTest(S);
      const h = String(b.handle || '').trim().replace(/^@/, '').toLowerCase();
      if (!HANDLE.test(h)) fail(400, 'Handles use letters, numbers and underscores, up to 15 characters.');
      let a = S.acc[h];
      if (!a) {
        const age = Math.max(0, Math.min(7000, parseInt(b.age) || 0)), followers = Math.max(0, Math.min(5e7, parseInt(b.followers) || 0));
        a = S.acc[h] = { handle: h, name: String(b.name || h).slice(0, 40), hue: Math.floor(Math.random() * 360), age, followers,
          trust: age < S.cfg.minAge ? .15 : Sim.trustFor(age, followers), farm: false, linked: false, wallet: null, hold: {},
          earned: 0, claimable: 0, claimed: 0, posts: 0, banned: false, sim: false };
      }
      sess.handle = h;
      return { ok: true, handle: h };
    },
    'POST /api/signout': (S, sess) => { sess.handle = null; return { ok: true }; },
    'POST /api/link': (S, sess, b) => {
      const a = needMe(S, sess);
      if (S.cfg.mode === 'test') { a.wallet = b.wallet || Sim.b58(44); a.linked = true; return { ok: true, wallet: a.wallet }; }
      // Live mode: the server verifies the wallet signature before calling this with b.verified = true.
      if (!b.verified) fail(400, 'Wallet signature not verified.');
      a.wallet = b.wallet; a.linked = true; return { ok: true, wallet: a.wallet };
    },
    'POST /api/buy': (S, sess, b) => {
      needTest(S); const a = needMe(S, sess); const t = E.T(b.mint) || fail(404, 'Unknown coin.');
      if (!a.linked) fail(400, 'Link a wallet first.');
      const x = Math.max(1, Math.min(50, parseFloat(b.x) || 1.2));
      a.hold[t.mint] = Math.max(a.hold[t.mint] || 0, x);
      return { ok: true, hold: a.hold[t.mint] };
    },
    'POST /api/post': (S, sess, b) => {
      needTest(S); const a = needMe(S, sess); const t = E.T(b.mint) || fail(404, 'Unknown coin.');
      const text = String(b.text || '').trim();
      if (!text) fail(400, 'Write something first.');
      if (text.length > 280) fail(400, 'Posts are 280 characters or fewer.');
      if (!E.mentions(text, t)) fail(400, `Mention $${t.ticker} or its contract address.`);
      const norm = s => s.toLowerCase().replace(/[^a-z0-9$ ]/g, '').replace(/\s+/g, ' ').trim();
      const dup = S.posts.some(p => p.mint === t.mint && norm(p.text) === norm(text));
      const p = { id: 'p' + (++S.seq), mint: t.mint, h: a.handle, ts: E.now(), text, P: Math.pow(Math.max(10, a.followers), .72) * (0.9 + Math.random() * .7),
        q: .85, lr: .02 + Math.random() * .02, dup, ep: S.epoch, sim: false };
      S.posts.unshift(p); S.pmap[p.id] = p; a.posts++;
      const why = E.ineligible(p);
      return { ok: true, id: p.id, ineligible: why ? why[0] : null };
    },
    'POST /api/claim': (S, sess) => {
      const a = needMe(S, sess);
      if (!a.linked) fail(400, 'Link a wallet first.');
      if (a.claimable <= 0) fail(400, 'Nothing to claim yet.');
      if (S.cfg.mode !== 'test') fail(503, 'Payouts are not connected on this server.');
      const amt = a.claimable; a.claimable = 0; a.claimed += amt;
      const c = { id: 'c' + (++S.seq), h: a.handle, wallet: a.wallet, amt, ts: E.now(), cumulative: a.claimed, status: S.cfg.mode === 'test' ? 'simulated' : 'pending-onchain' };
      S.claims.unshift(c);
      Core.log(S, `@${a.handle} claimed ${amt.toFixed(4)} SOL`);
      return { ok: true, claim: c };
    },
    'POST /api/launch': (S, sess, b) => {
      if (S.cfg.mode !== 'test') fail(400, 'Live launches go through your wallet. Reload the page and try again.');
      const name = String(b.name || '').trim().slice(0, 32), ticker = String(b.ticker || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      if (!name || !ticker) fail(400, 'Add a name and ticker.');
      if (!b.agree) fail(400, 'Confirm the fee routing.');
      const minHold = [.01, .05, .1].includes(+b.minHold) ? +b.minHold : .05;
      let img = null; if (typeof b.img === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(b.img) && b.img.length < 200000) img = b.img;
      const t = Sim.mkToken(S, { name, ticker, created: E.now(), mc: 4200, minHold, img, desc: String(b.desc || '').slice(0, 240), deployer: b.wallet || Sim.b58(44), sim: true });
      t.rate = 0.4; // modest fee flow for a fresh test coin
      Core.log(S, `Launched $${ticker} (test)`);
      return { ok: true, mint: t.mint };
    }
  };

  Core.call = (S, method, path, body, sess) => {
    E.setState(S);
    if (method === 'GET' && path === '/api/state') return Core.snapshot(S, sess);
    const h = Core.handlers[method + ' ' + path];
    if (!h) fail(404, 'Not found.');
    return h(S, sess, body || {});
  };

  if (isNode) module.exports = Core; else root.Core = Core;
})(typeof self !== 'undefined' ? self : this);
