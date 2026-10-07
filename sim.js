/*
 * Clout test-mode simulator: fake accounts, coins, posts and fee flow so the
 * whole system can run before real coins exist. Nothing here is used in live mode.
 */
(function (root) {
  const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.Engine;
  const Sim = {};
  const { MIN, HR, DAY } = E;

  let seed = 77;
  const R = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rnd = (a, b) => a + R() * (b - a), ri = (a, b) => Math.floor(rnd(a, b + 1)), pick = a => a[Math.floor(R() * a.length)];
  const randn = () => { const u = 1 - R(), v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const wpick = (arr, w) => { let s = 0; for (const x of arr) s += w(x); let r = R() * s; for (const x of arr) { r -= w(x); if (r <= 0) return x; } return arr[arr.length - 1]; };
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const b58 = n => Array.from({ length: n }, () => B58[Math.floor(R() * 58)]).join('');
  Object.assign(Sim, { R, rnd, ri, pick, randn, b58 });

  const FIRST = ['Maya','Jonah','Ines','Theo','Priya','Kofi','Lena','Omar','Sasha','Diego','Noor','Felix','Hana','Arlo','Zara','Milo','Rhea','Cyrus','Tess','Idris','Juno','Kai','Lior','Nadia','Otto','Pia','Quinn','Remy','Uma','Wes','Yara','Bea','Cole','Dev','Esme'];
  const LAST = ['park','okafor','brandt','vega','lind','sato','reyes','hale','castell','morrow','ferro','holm','pike','duarte','mercer','flynn','raman','adeyemi','quint','whit'];
  const F1 = ['moon','pump','gem','alpha','based','giga','sigma','ape','degen','chad'], F2 = ['boi','hunter','calls','whale','caller','maxi','lord','bot','signals','x'];
  const ADJ = ['Quiet','Solar','Lucky','Paper','Velvet','Iron','Tiny','Cosmic','Humble','Brave','Neon','Mossy','Golden','Salty','Sleepy','Rapid','Rusty','Lunar','Wild','Polite','Feral','Sober','Loud','Soft'];
  const NOUN = ['Otter','Kite','Lantern','Frog','Comet','Turtle','Heron','Biscuit','Pixel','Anchor','Maple','Robot','Raccoon','Pebble','Falcon','Toast','Walrus','Cactus','Beacon','Moth','Goose','Clam','Yeti','Pigeon'];

  Sim.trustFor = (age, followers) => Math.min(1, .45 + Math.min(.3, age / 5000) + Math.min(.25, Math.log10(followers + 1) / 20));

  Sim.mkAccount = (S, farm) => {
    let h, name;
    if (farm) { h = pick(F1) + pick(F2) + ri(100, 99999); name = h.replace(/\d+$/, '').replace(/^./, c => c.toUpperCase()); }
    else { const f = pick(FIRST), l = pick(LAST), v = R(); h = (v < .35 ? f + l : v < .6 ? f + '_' + l : v < .8 ? f + ri(1, 99) : 'the' + f).toLowerCase(); name = R() < .7 ? f + ' ' + l[0].toUpperCase() + l.slice(1) : f; }
    if (S.acc[h]) return null;
    const age = farm ? ri(3, 26) : Math.round(40 + Math.pow(R(), .9) * 3000);
    const followers = farm ? ri(20, 400) : Math.round(Math.exp(6 + randn() * 1.3));
    const a = { handle: h, name, hue: ri(0, 359), age, followers, trust: farm ? rnd(.08, .24) : Math.min(1, Sim.trustFor(age, followers) + rnd(-.05, .05)),
      farm, linked: farm || R() < .88, wallet: b58(44), hold: {}, earned: 0, claimable: 0, claimed: 0, posts: 0, banned: false, sim: true };
    S.acc[h] = a; return a;
  };

  Sim.mkToken = (S, o = {}) => {
    const a = pick(ADJ), n = pick(NOUN);
    const name = o.name || (a + ' ' + n), ticker = o.ticker || (R() < .6 ? n.toUpperCase() : (a[0] + n).toUpperCase().slice(0, 7));
    let mc = o.mc ?? Math.max(4200, Math.exp(9.4 + randn() * 1.25)); if (o.mc == null && R() < .06) mc *= rnd(8, 25);
    const t = { mint: o.mint || b58(40) + 'echo', name, ticker, created: o.created ?? E.now() - Math.pow(R(), 1.6) * 12 * DAY, mc,
      minHold: o.minHold ?? pick([.01, .05, .1]), hue: ri(0, 359), deployer: o.deployer || b58(44), pool: 0, paid: 0, epochs: [],
      img: o.img || null, desc: o.desc || '', sim: o.sim ?? true };
    t.rate = mc * .0032 / S.sol * rnd(.6, 1.4); // SOL of creator fees per hour
    S.tokens.push(t); S.tmap[t.mint] = t; return t;
  };

  const TPL = [
    t => `$${t.ticker} is the only chart I'm watching today. ${pick(['Holding.', 'Still holding.', 'Added more.'])} #ad`,
    t => `The ${t.name} community is actually building. $${t.ticker} #ad`,
    t => `$${t.ticker} ${pick(['looks ready', 'is cooking', 'quietly broke out', 'keeps printing higher lows'])}. ${pick(['Not financial advice.', 'DYOR.', 'Size responsibly.'])} #ad`,
    t => `Everyone sleeping on $${t.ticker}. Bonding curve ${ri(60, 95)}% full. #ad`,
    t => `gm to $${t.ticker} holders only #ad`,
    t => `${t.name} memes are the best on the timeline right now. $${t.ticker} #ad`,
    t => `Made a ${pick(['thread', 'chart', 'meme', 'song'])} about $${t.ticker}. Fees go to whoever posts, so the dev can't take them. #ad`,
    t => `$${t.ticker} holders are the nicest people on here #ad`];

  Sim.mkPost = (S, ts, author) => {
    const pool = S.tokens.filter(t => t.created < ts); if (!pool.length) return null;
    const t = wpick(pool, t => Math.sqrt(t.mc));
    let a = author;
    if (!a) { const all = Object.values(S.acc).filter(x => x.sim); const holders = all.filter(x => (x.hold[t.mint] || 0) > 0); a = (R() < .7 && holders.length) ? pick(holders) : pick(all); }
    let text, dup = false;
    if (a.farm && R() < .55) { text = `🚀🚀 $${t.ticker} 100x gem 🚀🚀 #ad`; dup = true; } else text = pick(TPL)(t);
    if (R() < (a.farm ? .35 : .07)) text = text.replace(/\s#ad$/, '');
    const p = { id: 'p' + (++S.seq), mint: t.mint, h: a.handle, ts, text, P: Math.pow(a.followers, .72) * rnd(.35, 1.9), q: a.farm ? rnd(.12, .3) : rnd(.7, 1), lr: rnd(.012, .042), dup, ep: E.epochOf(ts), sim: true };
    S.posts.unshift(p); S.pmap[p.id] = p; a.posts++; return p;
  };

  Sim.accrue = (S, ms) => { for (const t of S.tokens) if (t.sim && t.created < E.now()) E.addFees(t, t.rate * ms / HR * Math.exp(randn() * .15)); };

  // Build a test world with 10 settled epochs of history.
  Sim.seed = (S, s = 77) => {
    seed = s;
    for (let i = 0; i < 70; i++) Sim.mkAccount(S, false);
    for (let i = 0; i < 16; i++) Sim.mkAccount(S, true);
    for (let i = 0; i < 48; i++) Sim.mkToken(S);
    const accs = Object.values(S.acc);
    for (const a of accs) { const k = a.farm ? ri(2, 6) : ri(3, 12); for (let j = 0; j < k; j++) { const t = pick(S.tokens); a.hold[t.mint] = a.farm ? (R() < .4 ? rnd(1, 3) : rnd(0, .9)) : (R() < .82 ? rnd(1, 24) : rnd(0, .9)); } }
    const n0 = E.epochOf(E.now()); S.epoch = n0 - 10; S.gen = n0 - 280;
    const L = E.epochLen();
    for (let n = n0 - 10; n < n0; n++) {
      Sim.accrue(S, L);
      const k = ri(70, 110); for (let j = 0; j < k; j++) Sim.mkPost(S, E.eStart(n) + R() * L);
      E.settle(n); S.epoch = n + 1;
    }
    const into = E.now() - E.eStart(n0);
    Sim.accrue(S, into);
    const k = Math.round(90 * into / L); for (let j = 0; j < k; j++) Sim.mkPost(S, E.eStart(n0) + R() * into);
    S.posts.sort((a, b) => b.ts - a.ts);
    E.reindex();
  };

  // One simulator step covering `realMs` of wall time.
  Sim.step = (S, realMs) => {
    const simMs = realMs * S.clock.speed;
    Sim.accrue(S, simMs);
    S.sol *= Math.exp(randn() * .0012);
    for (const t of S.tokens) { if (!t.sim) continue; const young = E.now() - t.created < 3 * HR; t.mc = Math.max(3800, t.mc * Math.exp(randn() * (young ? .025 : .005) + (young ? .004 : 0))); }
    const perSec = 90 / (E.epochLen() / 1000);                  // about 90 posts per epoch
    const expected = perSec * simMs / 1000; let k = Math.floor(expected) + (R() < expected % 1 ? 1 : 0);
    for (let j = 0; j < Math.min(k, 20); j++) Sim.mkPost(S, E.now() - R() * Math.min(simMs, 60000));
    if (R() < .05 * realMs / 2000) Sim.mkToken(S, { created: E.now(), mc: rnd(4200, 5200) });
    // Engagement on the user's own posts in test mode keeps growing via the curve in Engine.metrics.
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sim; else root.Sim = Sim;
})(typeof self !== 'undefined' ? self : this);
