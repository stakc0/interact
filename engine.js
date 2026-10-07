/*
 * Clout engine: the reward rules.
 * Plain JavaScript with no dependencies. The same file runs on the server (Node)
 * and in the browser, so the numbers people see are computed by the exact code that pays them.
 */
(function (root) {
  const E = {};
  const MIN = 6e4, HR = 36e5, DAY = 864e5;
  Object.assign(E, { MIN, HR, DAY });

  // Defaults for a new world. Admin can change most of these at runtime.
  E.DEFAULTS = {
    mode: 'test',          // 'test' = simulated coins and posts, 'live' = real integrations
    poolShare: 0.8,        // share of creator fees that goes to bagworkers. The rest (20%) is the platform's.
    cap: 0.25,             // max share of one coin's epoch pool per account
    maxPosts: 3,           // scoring posts per account, per coin, per epoch
    minAge: 30,            // X account age in days
    epochMin: 30,          // epoch length in minutes (fixed once the world starts; new worlds use this)
    postLifeHours: 24,     // a post keeps earning on its new engagement for this long after it is posted
    speed: 40,             // clock multiplier. 1 = real time
    reviewSol: 10,         // single payouts at or above this wait for admin approval
    minEngage: 3,          // likes + replies + reposts + quotes a post needs before it can earn (0 = off)
    exponent: 0.8,         // diminishing returns on engagement
    weights: { like: 1, reply: 2, repost: 3, quote: 4, kview: 1 },
    earlyMax: 1.5, earlyHours: 6, earlyFade: 24,
    holdMax: 1.5,
    disclose: ['#ad', '#sponsored', '#paid'],
    simRunning: true
  };
  // The deployer share is not a setting. There is no code path that pays a deployer.
  E.DEPLOYER_SHARE = 0;

  let S = null;
  E.setState = s => { S = s; E.reindex(); };
  E.state = () => S;
  E.reindex = () => {
    S.acc = S.acc || {};
    S.tmap = {}; S.pmap = {};
    for (const t of S.tokens) S.tmap[t.mint] = t;
    for (const p of S.posts) S.pmap[p.id] = p;
  };
  E.A = h => S.acc[h];
  E.T = m => S.tmap[m];

  /* ---------- clock and epochs ---------- */
  E.now = () => S.clock.base + (Date.now() - S.clock.real) * S.clock.speed;
  E.setSpeed = sp => { const n = E.now(); S.clock = { base: n, real: Date.now(), speed: sp }; S.cfg.speed = sp; };
  E.epochLen = () => S.cfg.epochMin * MIN;
  E.epochOf = ts => Math.floor(ts / E.epochLen());
  E.eStart = n => n * E.epochLen();
  E.eEnd = n => (n + 1) * E.epochLen();
  E.en = n => n - S.gen;                       // human epoch number, counted from world start

  /* ---------- rules ---------- */
  E.discloseRe = () => new RegExp('(^|\\s)(' + S.cfg.disclose.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=\\s|$|[.,!?])', 'i');
  // Coins with a busy ticker are tracked by contract address only (t.caOnly), so the address must be in the post.
  E.mentions = (text, t) => text.includes(t.mint) || (!t.caOnly && new RegExp('\\$' + t.ticker.replace(/[^A-Za-z0-9]/g, '') + '(?![A-Za-z0-9])', 'i').test(text));

  // Engagement for a post. Live posts carry real metrics (p.m); test posts follow a growth curve.
  E.metrics = (p, at) => {
    if (p.m) return p.m;
    at = Math.min(at ?? E.now(), E.now());
    const mins = Math.max(0, (at - p.ts) / MIN);
    const v = p.P * 18 * (1 - Math.exp(-mins / 45)), l = v * p.lr;
    return { views: Math.round(v), likes: Math.round(l), reposts: Math.round(l * .13), replies: Math.round(l * .16), quotes: Math.round(l * .045) };
  };

  // A post takes part in epoch n from the epoch it was posted until postLifeHours later.
  E.lifeMs = () => (S.cfg.postLifeHours ?? 24) * HR;
  E.active = (p, n) => p.ep <= n && E.eStart(n) < p.ts + E.lifeMs();
  const ZERO = { views: 0, likes: 0, reposts: 0, replies: 0, quotes: 0 };
  const minus = (a, b) => { const o = {}; for (const k in ZERO) o[k] = Math.max(0, (a[k] || 0) - (b[k] || 0)); return o; };
  // Engagement a post gained during epoch n (what it is paid for in that epoch). Live posts: change since the
  // snapshot taken at the last settlement (p.mb). Test posts: the growth curve between the epoch's start and end.
  E.gained = (p, n = S.epoch, at) => {
    if (p.m) return minus(p.m, p.mb || ZERO);
    const to = Math.min(E.eEnd(n), at ?? E.now()), from = Math.max(E.eStart(n), p.ts);
    return to <= from ? { ...ZERO } : minus(E.metrics(p, to), E.metrics(p, from));
  };

  // Returns null when a post can earn, otherwise [short reason, explanation].
  E.engagements = (p, at) => { const m = E.metrics(p, at); return m.likes + m.replies + m.reposts + m.quotes; };
  E.ineligible = (p, at) => {
    const a = E.A(p.h), t = E.T(p.mint), c = S.cfg;
    if (!a || !t) return ['Unknown', 'Account or coin not found.'];
    if (p.deleted) return ['Deleted on X', 'This post was deleted from X, so it no longer counts.'];
    if (p.void) return ['Removed by moderator', 'This post was voided and does not count.'];
    if (a.banned) return ['Account suspended', 'This account is on the do-not-pay list.'];
    if (!E.mentions(p.text, t)) return ['Doesn\'t mention the coin', `Needs $${t.ticker} or the contract address.`];
    if (!a.linked) return ['No wallet linked', 'Link a Solana wallet so there is somewhere to send the payout.'];
    if (a.age < c.minAge) return [`Account under ${c.minAge} days old`, `@${a.handle} is ${a.age} days old. Accounts need ${c.minAge} days.`];
    if ((a.hold[p.mint] || 0) < 1) return ['Doesn\'t hold the minimum', `Needs ${t.minHold}% of supply in the linked wallet at settlement.`];
    if (!E.discloseRe().test(p.text)) return ['Missing #ad', `Paid posts must be disclosed with ${c.disclose.join(', ')}.`];
    if (p.dup) return ['Near-duplicate', 'Matches another post word for word. Copy-paste posts score zero.'];
    const need = c.minEngage || 0, got = need ? E.engagements(p, at) : 0;
    if (got < need) return [`Needs ${need} engagements`, `Posts need at least ${need} likes, replies, reposts or quotes combined before they earn. This one has ${got}. Views don't count.`];
    return null;
  };

  E.score = (p, at, n = S.epoch) => {
    const a = E.A(p.h), t = E.T(p.mint), c = S.cfg, w = c.weights, m = E.gained(p, n, at);
    const raw = m.likes * w.like + m.replies * w.reply + m.reposts * w.repost + m.quotes * w.quote + m.views / 1000 * w.kview;
    const q = p.q ?? 1, E1 = raw * q, base = Math.pow(E1, c.exponent);
    const trust = a.trust;
    const hold = Math.min(c.holdMax, 1 + 0.5 * Math.log10(Math.max(1, a.hold[p.mint] || 0)));
    const hrs = (p.ts - t.created) / HR;
    const early = hrs <= c.earlyHours ? c.earlyMax : hrs >= c.earlyFade ? 1 : c.earlyMax - (c.earlyMax - 1) * (hrs - c.earlyHours) / (c.earlyFade - c.earlyHours);
    return { m, raw, q, base, trust, hold, early, score: base * trust * hold * early };
  };

  // What each account would get for one coin in one epoch if it settled at `at`.
  E.project = (mint, n, at) => {
    const t = E.T(mint), c = S.cfg;
    const posts = S.posts.filter(p => p.mint === mint && E.active(p, n));
    const by = {}, rows = []; let inel = 0;
    for (const p of posts) {
      if (E.ineligible(p, at)) { inel++; continue; }
      const sc = E.score(p, at, n).score;
      if (sc > 0) (by[p.h] = by[p.h] || []).push({ p, sc });
    }
    let total = 0;
    for (const h in by) {
      by[h].sort((x, y) => y.sc - x.sc);
      const top = by[h].slice(0, c.maxPosts);
      const s = top.reduce((a, x) => a + x.sc, 0);
      total += s;
      rows.push({ h, score: s, posts: top.length, over: by[h].length - top.length, ids: top.map(x => x.p.id) });
    }
    const pool = t.pool;
    for (const r of rows) { r.share = total ? r.score / total : 0; r.capped = r.share > c.cap; r.amt = Math.min(r.share, c.cap) * pool; }
    rows.sort((a, b) => b.score - a.score);
    const paid = rows.reduce((a, r) => a + r.amt, 0);
    return { rows, pool, paid, rolled: pool - paid, posts: posts.length, inel };
  };

  // Close epoch n for every coin. Credits accounts, queues large payouts for review, rolls the rest.
  E.settle = n => {
    const c = S.cfg; let tot = 0, held = 0; const workers = new Set(), credited = [];
    for (const t of S.tokens) {
      if (t.created > E.eEnd(n)) continue;
      const r = E.project(t.mint, n, E.eEnd(n));
      const out = [];
      for (const x of r.rows) {
        if (x.amt <= 0) continue;
        const a = E.A(x.h);
        workers.add(x.h);
        if (x.amt >= c.reviewSol) {
          S.reviews.unshift({ id: 'rv' + (++S.seq), h: x.h, mint: t.mint, n, amt: x.amt, share: x.share, status: 'pending', ts: E.now() });
          held += x.amt; out.push({ ...x, status: 'review' });
        } else {
          a.earned += x.amt; a.claimable += x.amt; tot += x.amt; out.push({ ...x, status: 'paid' });
          credited.push({ h: x.h, amt: x.amt, mint: t.mint });
        }
      }
      const paidHere = out.filter(x => x.status === 'paid').reduce((a, x) => a + x.amt, 0);
      const heldHere = out.filter(x => x.status === 'review').reduce((a, x) => a + x.amt, 0);
      t.paid += paidHere;
      t.epochs.unshift({ n, pool: r.pool, paid: paidHere, held: heldHere, rolled: r.rolled, rows: out.slice(0, 12), workers: r.rows.length, posts: r.posts });
      if (t.epochs.length > 24) t.epochs.pop();
      t.pool = r.rolled;
      // Engagement up to now has been paid for (or didn't qualify); the next epoch only counts what's new.
      for (const p of S.posts) if (p.m && p.mint === t.mint && E.active(p, n)) p.mb = { ...p.m };
    }
    const rec = { n, paid: tot, held, workers: workers.size, at: E.eEnd(n) };
    S.settles.unshift(rec); if (S.settles.length > 200) S.settles.pop();
    S.paidTotal += tot;
    S.ledger.push({ n, credited });
    if (S.ledger.length > 500) S.ledger.shift();
    return rec;
  };

  // Settle every epoch that has ended. Returns the settlement records.
  E.advance = () => {
    const out = [], n = E.epochOf(E.now());
    while (S.epoch < n) { out.push(E.settle(S.epoch)); S.epoch++; }
    return out;
  };

  // Split creator fees (in SOL) that arrived for one coin.
  E.addFees = (t, sol) => {
    const toPool = sol * S.cfg.poolShare;
    t.pool += toPool; S.proto += sol - toPool; S.feesTotal += sol;
  };

  E.approveReview = (id, ok) => {
    const r = S.reviews.find(x => x.id === id);
    if (!r || r.status !== 'pending') return false;
    const a = E.A(r.h), t = E.T(r.mint);
    if (ok) { a.earned += r.amt; a.claimable += r.amt; t.paid += r.amt; S.paidTotal += r.amt; r.status = 'approved'; }
    else { t.pool += r.amt; r.status = 'rejected'; }
    r.decided = E.now();
    return true;
  };

  E.globalBoard = () => {
    const agg = {};
    for (const t of S.tokens) {
      const pr = E.project(t.mint, S.epoch);
      for (const r of pr.rows) { const g = agg[r.h] || (agg[r.h] = { h: r.h, amt: 0, score: 0, coins: 0, posts: 0 }); g.amt += r.amt; g.score += r.score; g.coins++; g.posts += r.posts; }
    }
    return Object.values(agg).sort((a, b) => b.amt - a.amt);
  };

  E.newWorld = (cfg = {}, now = Date.now()) => ({
    v: 1, cfg: { ...JSON.parse(JSON.stringify(E.DEFAULTS)), ...cfg },
    clock: { base: now, real: Date.now(), speed: cfg.speed ?? E.DEFAULTS.speed },
    acc: {}, tokens: [], posts: [], settles: [], reviews: [], claims: [], ledger: [], log: [],
    sol: 121.4, proto: 0, feesTotal: 0, paidTotal: 0, seq: 0, epoch: 0, gen: 0
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = E; else root.Engine = E;
})(typeof self !== 'undefined' ? self : this);
