// 第9次改修: 世界の出来事(良い・悪い)・軍縮・居住域の集約・存続への挑戦・政策の段階的解放と変更機会。DOM非依存。
// engine.js から stepYear の中で呼ばれる。ここは engine を import しない(循環を避ける)。乱数は engine と同じ s.rng を使う。
//
// 【考え方】出来事は「状態から決まる発生率 → 予兆 → 影響(国・施設・人口・資源・環境) → 後遺症」の一続き。データ(EPISODES)を足すだけで増やせる。
//  宗教・思想は名称で善悪を決めない。強制・搾取・医療拒否・相互扶助・共同体の維持といった具体的な行動と結果で扱う。
const cl = (x, a, b) => x < a ? a : x > b ? b : x;
const cpop = c => c.y + c.a + c.o;
function rnd(s) { let t = (s.rng = (s.rng + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const log = (s, text, kind = "hist") => { s.log.push({ y: s.year, t: text, k: kind }); if (s.log.length > 1500) s.log.splice(0, 200); };
const lose = (c, f) => { c.y *= 1 - f; c.a *= 1 - f; c.o *= 1 - f; };
export const PROGRAM9 = 2100;

export const W9_DEFAULT = () => ({ unl: {}, seen: {}, win: { open: false, from: null, until: null, n: 0 }, next: 2200, pLock: false, ep: [], last: {}, ask: null, bt: {}, apathy: 0, indiv: 0, immune: 0, comm: 0, supp: 0, hist: { bad: 0, good: 0, dead: 0, byId: {} }, flags: {} });

// ---------- 政策・保護対象の段階的解放 ----------
// when(s, st): 解放条件(進行・技術・社会状況・政策判断・重大事件)。tab: 新着マークを出すタブ。ch: 配分チャンネル。
export const UNLOCKS = [
  { id: "ch_guard", tab: "policy", ch: "guard", name: "治安・防衛・サイバー防御の配分", why: "敵対勢力の最初の動きが現れる、または2110年を迎える", when: (s, st) => s.host.hist.attacks > 0 || s.year >= 2110 },
  { id: "hp", tab: "policy", name: "敵対勢力への基本方針", why: "敵対勢力の最初の動き、または2115年", when: (s, st) => s.host.hist.attacks > 0 || s.year >= 2115 },
  { id: "ch_disarm", tab: "policy", ch: "disarm", name: "軍縮・民生転換の配分", why: "軍事施設の停止が3か所に達する、または2200年", when: (s, st) => st.nMilStop >= 3 || s.year >= 2200 },
  { id: "ch_consol", tab: "policy", ch: "consol", name: "居住域・交通網の集約の配分", why: "人口が半分を割った国が現れる、または2180年", when: (s, st) => st.shrunk >= 1 || s.year >= 2180 },
  { id: "bt", tab: "policy", name: "存続への挑戦(研究課題)", why: "生存研究の蓄積が10に達する、または2125年", when: (s, st) => s.g.rsr >= 10 || s.year >= 2125 },
  { id: "her_b", tab: "sites", name: "価値3の遺産の保護", why: "記録の蓄積が4に達する、または2130年", when: (s, st) => s.g.arch >= 4 || s.year >= 2130 },
  { id: "her_c", tab: "sites", name: "価値2以下・独自候補の遺産の保護", why: "記録の蓄積が15に達する、または2170年", when: (s, st) => s.g.arch >= 15 || s.year >= 2170 },
  { id: "her_nat", tab: "sites", name: "遺産の自然還元", why: "環境修復が進み汚染が30を下回る、または2125年", when: (s, st) => s.g.pl < 30 || s.year >= 2125 },
];
export const unlocked = (s, id) => !s.w9 || !!s.w9.unl[id];
export const channelOpen = (s, k) => { if (!s.w9) return true; const u = UNLOCKS.find(x => x.ch === k); return !u || !!s.w9.unl[u.id]; };
// 保護対象(遺産)の解放: 価値と状態で段階がある。2100年より前・旧セーブ(w9なし)は制限しない
export function siteOpen(s, d, mode) {
  if (!s.w9 || s.year < PROGRAM9) return true;
  if (mode === 3 && !s.w9.unl.her_nat) return false;
  if (d.v >= 4) return true;
  return d.real && d.v === 3 ? !!s.w9.unl.her_b : !!s.w9.unl.her_c;
}
// 全自動のときは変更の機会(window)の間だけ方針・遺産の設定を変えられる。手動・半自動はいつでも
export const canEdit = (s) => s.mode !== "auto" || s.year < PROGRAM9 || !!(s.w9 && s.w9.win.open);
export const WIN = { every: 250, len: 80, first: 2200 };
export function newMarks(s, tab) { const w = s.w9; if (!w) return []; const out = UNLOCKS.filter(u => u.tab === tab && w.unl[u.id] && !w.seen[u.id]).map(u => ({ id: u.id, name: u.name, kind: "unlock" })); if (tab === "policy" && w.win.open && !w.win.seen) out.push({ id: "win", name: "方針の変更機会", kind: "win" }); if (tab === "sites" && w.win.open && !w.win.seenS) out.push({ id: "win", name: "遺産設定の変更機会", kind: "win" }); return out; }
export function markSeen(s, tab) { const w = s.w9; if (!w) return false; let ch = false; for (const u of UNLOCKS) if (u.tab === tab && w.unl[u.id] && !w.seen[u.id]) { w.seen[u.id] = s.year; ch = true; } if (w.win.open) { if (tab === "policy" && !w.win.seen) { w.win.seen = true; ch = true; } if (tab === "sites" && !w.win.seenS) { w.win.seenS = true; ch = true; } } return ch; }

// ---------- 年次の集計(1年に1回) ----------
function gather(s) {
  const g = s.g, live = []; let P = 0, U = 0, Hl = 0, Hp = 0, Cn = 0, Lg = 0, Hop = 0, old = 0, shrunk = 0;
  for (const c of s.countries) { if (c.extinct) continue; const p = cpop(c); if (p <= 0) continue; live.push(c); P += p; U += c.unrest * p; Hl += c.health * p; Hp += c.happy * p; Cn += c.consent * p; Lg += c.logi * p; Hop += c.hope * p; old += c.o; if (p / c.P0 < .5) shrunk++; }
  const q = P || 1; let nMil = 0, nMilStop = 0, nAI = 0;
  for (const f of s.facs) if (f.t === 3) { nMil++; if (f.st === 2) nMilStop++; }
  return { live, P, pr: P / g.P0, U: U / q, Hl: Hl / q, Hp: Hp / q, Cn: Cn / q, Lg: Lg / q, Hop: Hop / q, oldShare: old / q, shrunk, nMil, nMilStop, milFrac: nMil ? nMilStop / nMil : 0, cons: (g.cons || 0) / 100 };
}
const wpick = (s, list, wf) => { let tot = 0; for (const c of list) tot += Math.max(1e-9, wf(c)); let r = rnd(s) * tot; for (const c of list) { r -= Math.max(1e-9, wf(c)); if (r <= 0) return c; } return list[list.length - 1]; };

// ---------- 世界の出来事の定義 ----------
// m: 影響する指標(人口・幸福・安全性・環境・資源・AI・遺産) / risk: 年間の発生率(状態から) / warn: 予兆 / dur: 継続年数 / start: 原因と対象 / tick: 毎年の影響 / end: 後遺症
const dens = (st) => 1 + .8 * st.cons;                       // 集約した居住域は感染症に弱い
const frag = (st, g) => 1 + .5 * st.cons - .35 * (g.shel || 0); // 集約は災害時の被害を広げる。遮蔽・準備は和らげる
function disaster(o) {
  return { kind: "bad", cool: o.cool || 30, dur: o.dur, m: o.m, name: o.name, risk: o.risk, warn: o.warn,
    start(s, ep, st, P) { const c = wpick(s, st.live, x => cpop(x) * (o.w ? o.w(x) : 1)); ep.t = [s.countries.indexOf(c)]; ep.sev = .5 + rnd(s); ep.cause = o.cause(s, st, c); return ep.cause; },
    tick(s, ep, st, P) {
      const g = s.g, c = s.countries[ep.t[0]]; if (!c || c.extinct) return; const k = ep.sev * ep.resp * frag(st, g), first = ep.age === 0;
      if (first || o.every) { lose(c, o.loss * k * (first ? 1 : .3)); c.logi = cl(c.logi - o.logi * k, .1, .98); c.unrest = cl(c.unrest + .02 * k, 0, 1); c.happy = cl(c.happy - .03 * k, 0, 1); if (o.cut) c.cut = cl((c.cut || 0) + o.cut * k, 0, .8); g.res = cl(g.res - o.res * k, 0, 100); }
      if (first) {
        if (o.fac) { const i = s.countries.indexOf(c); let n = 0; for (const f of s.facs) if (f.c === i && o.fac.t.includes(f.t) && f.st < 3) { f.safety = cl(f.safety - o.fac.d * k, .02, .97); n++; } ep.facHit = n; }
        if (o.her) g.her = cl(g.her - o.her * k, 0, 100);
        if (o.bio) g.bio = cl(g.bio - o.bio * k, 0, 100);
        if (o.wild) for (let gi = 0; gi < s.mam.length; gi++) if (gi < 4) { const m = s.mam[gi], l = m.n * o.wild * k; m.n -= l; m.dd += l; }
        if (o.pl) g.pl = cl(g.pl + o.pl * k, 0, 100);
      }
      if (o.chronic) o.chronic(s, c, k, ep);
    },
    end(s, ep) { const c = s.countries[ep.t[0]]; if (c && o.after) o.after(s, c, ep); } };
}
export const EPISODES = {
  // ----- 悪い出来事 -----
  pandemic: { kind: "bad", name: "感染症の流行", cool: 25, dur: [3, 7], m: ["pop", "happy", "res"],
    risk: (s, st, P) => Math.max(.0005, (.004 + .011 * (1 - st.Hl) + (s.g.res < 35 ? .006 : 0) + .004 * (st.pr > .5 ? 1 : 0) - .009 * P.careP) * dens(st)) * (s.w9.immune > s.year ? .5 : 1),
    warn: (s, st, P) => ((.004 + .011 * (1 - st.Hl) + (s.g.res < 35 ? .006 : 0) - .009 * P.careP) * dens(st)) > .011 ? "各地で原因不明の発熱の報告が増えている(医療の余力と居住の密度が関わる)" : null,
    start(s, ep, st, P) { const c = wpick(s, st.live, x => cpop(x) * (1.2 - x.health)); ep.t = [s.countries.indexOf(c)]; ep.sev = .5 + .6 * rnd(s); ep.cause = `${c.name}で発生。原因: 居住の密度(集約度${Math.round(st.cons * 100)})と医療の余力(健康${st.Hl.toFixed(2)})`; ep.ask = ep.sev > .75; return ep.cause; },
    tick(s, ep, st, P) { const g = s.g, k = ep.sev * ep.resp * (1 - .6 * P.careP) * (1 - .3 * (g.med || 0)) * dens(st);
      if (ep.age > 0 && ep.t.length < 4 && rnd(s) < .25 * dens(st) * ep.sev) { const c2 = wpick(s, st.live.filter(x => !ep.t.includes(s.countries.indexOf(x))), x => cpop(x)); if (c2) ep.t.push(s.countries.indexOf(c2)); }
      for (const i of ep.t) { const c = s.countries[i]; if (!c || c.extinct) continue; lose(c, .004 * k); c.o *= 1 - .01 * k; c.unrest = cl(c.unrest + .012 * k, 0, 1); c.happy = cl(c.happy - .02 * k, 0, 1); c.health = cl(c.health - .01 * k, .1, 1); c.logi = cl(c.logi - .004 * k, .1, .98); }
      g.res = cl(g.res - .06 * k, 0, 100); ep.k = k; },
    end(s, ep, st, P) { for (const i of ep.t) { const c = s.countries[i]; if (c) c.health = cl(c.health - .04, .1, 1); } if (ep.k < .4 && P.careP > .35) { s.w9.flags.epiWin = s.year; } } },
  quake: disaster({ name: "大地震と津波", cool: 40, dur: [1, 2], m: ["pop", "safety", "her"], loss: .006, logi: .08, cut: .25, res: .5, her: 1.2, fac: { t: [0, 1, 2], d: .1 }, w: c => 1,
    risk: (s, st) => .008 * (1 + .6 * st.cons), warn: () => null, // 温暖化とは関係が薄い: 汚染・環境・遮蔽の以外の方針では減らない
    cause: (s, st, c) => `${c.name}の沿岸で発生。地殻の活動によるもので、気候の状態とは無関係(居住の集約度${Math.round(st.cons * 100)}が被害を広げる)` }),
  flood: disaster({ name: "大洪水", dur: [1, 2], m: ["pop", "env", "safety"], loss: .003, logi: .06, cut: .15, res: .3, bio: .3, fac: { t: [0, 1], d: .05 }, pl: .3,
    risk: (s, st, P) => .004 + .018 * (s.g.pl / 100) * (1 - .6 * (s.g.land || 0)) * (1 - .5 * P.ecoP), warn: (s, st, P) => ((.004 + .018 * s.g.pl / 100 * (1 - .6 * (s.g.land || 0)) * (1 - .5 * P.ecoP)) > .014) ? "河川の増水が記録されている(汚染と環境の劣化が災害を呼びやすくしている)" : null,
    cause: (s, st, c) => `${c.name}で発生。原因: 環境の劣化(汚染${s.g.pl.toFixed(0)})と、緩衝となる湿地・森林の不足` }),
  drought: disaster({ name: "大干ばつ", dur: [3, 6], m: ["pop", "happy", "env"], loss: .001, logi: .02, res: .4, bio: .4, every: true,
    risk: (s, st, P) => .004 + .016 * (s.g.pl / 100) * (1 - .5 * (s.g.land || 0)) * (1 - .4 * P.ecoP), warn: () => null,
    chronic: (s, c, k) => { c.health = cl(c.health - .012 * k, .1, 1); c.hope = cl(c.hope - .01 * k, .05, 1.3); c.consent = cl(c.consent - .006 * k, 0, 1); },
    cause: (s, st, c) => `${c.name}で発生。原因: 気温の上昇と土壌の乾燥(汚染${s.g.pl.toFixed(0)})` }),
  storm: disaster({ name: "巨大な暴風雨", dur: [1, 2], m: ["pop", "safety"], loss: .002, logi: .1, cut: .3, res: .3, fac: { t: [0, 1, 2, 3], d: .04 },
    risk: (s, st, P) => .005 + .014 * (s.g.pl / 100) * (1 - .4 * P.ecoP), warn: () => null,
    cause: (s, st, c) => `${c.name}を直撃。送電と輸送が長く止まる(輸送網の整理が進むほど迂回が効かない: 集約度${Math.round(st.cons * 100)})` }),
  wildfire: disaster({ name: "大規模な山火事", dur: [1, 3], m: ["env", "her"], loss: .0008, logi: .02, res: .15, bio: 1.5, her: .8, wild: .015, pl: .5, every: true,
    risk: (s, st, P) => .004 + .015 * (s.g.pl / 100) * (1 - .6 * (s.g.land || 0)) * (1 - .4 * P.ecoP), warn: () => null,
    cause: (s, st, c) => `${c.name}の森林で発生。乾燥と、管理されない放棄地の可燃物(環境の劣化)が原因` }),
  cult: { kind: "bad", name: "搾取的な新興団体の拡大", cool: 40, dur: [8, 20], m: ["happy", "res", "pop"],
    risk: (s, st, P) => Math.max(0, .004 + .02 * Math.max(0, .9 - st.Hop) + .016 * st.U + .008 * (1 - s.ai.trust / 100) - .02 * P.careP - .01 * s.w9.comm) * (st.P > 1e7 ? 1 : 0),
    warn: (s, st, P) => ((.004 + .02 * Math.max(0, .9 - st.Hop) + .016 * st.U - .02 * P.careP) > .02) ? "終末への不安と不信が高まり、強い勧誘を行う団体の噂が広がっている" : null,
    start(s, ep, st, P) { const c = wpick(s, st.live, x => cpop(x) * (1.2 - x.consent + x.unrest)); ep.t = [s.countries.indexOf(c)]; ep.sev = .5 + .6 * rnd(s); ep.cause = `${c.name}で拡大。原因: 終末への不安(希望${st.Hop.toFixed(2)})・不信(不安${st.U.toFixed(2)})。評価するのは信仰ではなく、強制・搾取・医療の拒否といった行動`; ep.ask = true; return ep.cause; },
    tick(s, ep, st, P) { const g = s.g, c = s.countries[ep.t[0]]; if (!c || c.extinct) return; const k = ep.sev * ep.resp * (1 - .4 * P.guardP) * (1 - .5 * P.careP);
      c.consent = cl(c.consent - .01 * k, 0, 1); c.a *= 1 - .0008 * k; c.unrest = cl(c.unrest + .004 * k, 0, 1); c.health = cl(c.health - .004 * k, .1, 1); c.happy = cl(c.happy - .004 * k, 0, 1); g.res = cl(g.res - .08 * k, 0, 100); ep.k = k; },
    end(s, ep) { const c = s.countries[ep.t[0]]; if (c) c.consent = cl(c.consent - .03, 0, 1); } },
  fad: { kind: "bad", name: "根拠の乏しい思想の流行", cool: 30, dur: [6, 12], m: ["safety", "res", "happy"],
    risk: (s, st, P) => Math.max(0, .004 + .012 * Math.max(0, .8 - st.Hop) + .006 * (st.U) - .012 * P.careP - .006 * Math.min(1, s.g.rsr / 60)),
    warn: () => null,
    start(s, ep, st, P) { const c = wpick(s, st.live, x => cpop(x) * (1.3 - x.hope)); ep.t = [s.countries.indexOf(c)]; ep.sev = .4 + .5 * rnd(s); ep.cause = `${c.name}で流行。原因: 先の見えない不安に、根拠の乏しい説明が受け入れられた(研究の蓄積${s.g.rsr.toFixed(0)}・支援の不足)。その結果、医療の拒否と不適切な停止の見合わせが起きる`; return ep.cause; },
    tick(s, ep, st, P) { const g = s.g, c = s.countries[ep.t[0]]; if (!c || c.extinct) return; const k = ep.sev * ep.resp * (1 - .5 * P.careP);
      c.health = cl(c.health - .006 * k, .1, 1); g.res = cl(g.res - .05 * k, 0, 100); if (ep.age === 0 || ep.age % 4 === 0) c.pauseUntil = Math.max(c.pauseUntil || 0, s.year + 3); }, end() { } },
  decadence: { kind: "bad", name: "退廃と無関心の広がり", cool: 40, dur: [15, 30], m: ["happy", "safety", "res"],
    risk: (s, st, P) => Math.max(0, .003 + .016 * Math.max(0, .5 - st.Hop) + .012 * (s.g.lull || 0) * (st.Hp > .6 ? 1 : 0) - .01 * P.careP - .006 * (s.g.accept || 0)), warn: () => null,
    start(s, ep, st) { ep.t = []; ep.sev = .4 + .4 * rnd(s); ep.cause = `原因: 希望の低下(${st.Hop.toFixed(2)})と、長い静穏期のあとの目的の喪失。保守の担い手が減り、輸送と施設の手入れが滞る`; return ep.cause; },
    tick(s, ep, st, P) { const w = s.w9; w.apathy = cl(w.apathy + .03 * ep.sev * (1 - .6 * P.careP), 0, .6); }, end(s) { } },
  indiv: { kind: "bad", name: "極端な個人主義と協調の弱まり", cool: 40, dur: [15, 30], m: ["safety", "res"],
    risk: (s, st, P) => Math.max(0, .003 + .012 * Math.max(0, st.Hp - .6) + .01 * (1 - st.Cn) - .008 * P.careP - .006 * s.w9.comm), warn: () => null,
    start(s, ep, st) { ep.t = []; ep.sev = .4 + .4 * rnd(s); ep.cause = `原因: 合意の低下(${st.Cn.toFixed(2)})と、自分たちだけの暮らしを優先する空気。国家間の協力と、配分の実効力が弱まる`; return ep.cause; },
    tick(s, ep, st, P) { const w = s.w9; w.indiv = cl(w.indiv + .02 * ep.sev * (1 - .5 * P.careP), 0, .35); }, end() { } },
  despair: { kind: "bad", name: "社会的な悲劇(絶望と孤立)", cool: 25, dur: [1, 3], m: ["happy", "pop"],
    risk: (s, st, P) => Math.max(0, .002 + .018 * (1 - st.Hp) * Math.max(0, 1 - st.Hop) + .012 * st.U - .025 * P.careP - .01 * s.w9.comm - .01 * s.w9.supp - (s.w9.ep.some(e => e.id === "cult") ? -.008 : 0)),
    warn: (s, st, P) => ((.002 + .018 * (1 - st.Hp) * Math.max(0, 1 - st.Hop) + .012 * st.U - .025 * P.careP - .01 * s.w9.comm) > .016) ? "孤立と絶望を訴える声が増えている(支援と見守り・共同体の場で防げる)" : null,
    start(s, ep, st, P) { const c = wpick(s, st.live, x => cpop(x) * (1.2 - x.happy)); ep.t = [s.countries.indexOf(c)]; ep.sev = .4 + .5 * rnd(s); ep.cause = `${c.name}で発生。原因: 孤立(幸福${st.Hp.toFixed(2)})・希望の喪失・支援の不足。強制がある場合は団体の関与も疑われる`; ep.ask = true; return ep.cause; },
    tick(s, ep, st, P) { const c = s.countries[ep.t[0]]; if (!c || c.extinct) return; const k = ep.sev * ep.resp * (1 - .6 * P.careP - .3 * s.w9.comm);
      if (ep.age === 0) { lose(c, .0006 * k); c.happy = cl(c.happy - .08 * k, 0, 1); c.hope = cl(c.hope - .05 * k, .05, 1.3); s.ai.trust = cl(s.ai.trust - 1.5 * k, 0, 100); c.consent = cl(c.consent - .02 * k, 0, 1); } }, end() { } },
  letdown: { kind: "bad", name: "期待の後の失望", cool: 10, dur: [5, 10], m: ["happy", "res"],
    risk: () => 0, warn: () => null,
    start(s, ep, st) { ep.t = []; ep.sev = ep.sev || .6; ep.cause = ep.cause || "原因: 期待された研究の突破口が実らなかった"; return ep.cause; },
    tick(s, ep, st, P) { for (const c of st.live) { c.hope = cl(c.hope - .01 * ep.sev * ep.resp, .05, 1.3); c.happy = cl(c.happy - .004 * ep.sev, 0, 1); } s.ai.trust = cl(s.ai.trust - .2 * ep.sev, 0, 100); }, end() { } },
  // ----- 良い出来事 -----
  hygiene: { kind: "good", name: "衛生環境の改善", cool: 35, dur: [1, 1], m: ["pop", "happy"],
    risk: (s, st, P) => st.Hl < .9 ? .004 + .014 * P.careP + .006 * (s.g.res > 45 ? 1 : 0) : 0, warn: () => null,
    start(s, ep, st) { ep.t = []; ep.cause = `原因: 終活支援の配分と資源の余裕で、上下水道と衛生が行き届いた(健康${st.Hl.toFixed(2)})`; return ep.cause; },
    tick(s, ep, st) { for (const c of st.live) c.health = cl(c.health + .05, .1, 1); s.g.med = cl((s.g.med || 0) + .03, 0, 1); s.g.res = cl(s.g.res - .5, 0, 100); }, end() { } },
  epiwin: { kind: "good", name: "感染症対策の成功", cool: 40, dur: [1, 1], m: ["pop", "safety"],
    risk: (s) => s.w9.flags.epiWin && s.year - s.w9.flags.epiWin < 6 ? .5 : 0, warn: () => null,
    start(s, ep, st) { ep.t = []; ep.cause = "原因: 流行を小さな被害で抑えられた。検疫と医療の連携が、次の流行への備えになった"; delete s.w9.flags.epiWin; return ep.cause; },
    tick(s) { s.w9.immune = s.year + 40; s.g.med = cl((s.g.med || 0) + .03, 0, 1); s.ai.trust = cl(s.ai.trust + 2, 0, 100); }, end() { } },
  medical: { kind: "good", name: "医療水準の向上", cool: 50, dur: [1, 1], m: ["pop", "happy", "res"],
    risk: (s, st, P) => (s.g.med || 0) < .9 && s.g.rsr > 8 ? .003 + .012 * P.resP + .008 * P.careP : 0, warn: () => null,
    start(s, ep, st) { ep.t = []; ep.cause = `原因: 生存研究の蓄積(${s.g.rsr.toFixed(0)})が医療に結びついた。寿命は延びるが、介護の需要と医療の費用も増える`; return ep.cause; },
    tick(s, ep, st) { const g = s.g; g.med = cl((g.med || 0) + .07, 0, 1); for (const c of st.live) c.health = cl(c.health + .03, .1, 1); g.res = cl(g.res - .6, 0, 100); }, end() { } },
  medeff: { kind: "good", name: "医療資源の効率的な利用", cool: 50, dur: [1, 1], m: ["res"],
    risk: (s, st) => st.pr < .6 && (s.g.med || 0) > .1 && s.g.res < 70 ? .01 : 0, warn: () => null,
    start(s, ep, st) { ep.t = []; ep.cause = "原因: 人口が減り、医療拠点の統合と機械の補助で、少ない人手と資源で医療を保てるようになった"; return ep.cause; },
    tick(s) { s.g.medEff = cl((s.g.medEff || 0) + .3, 0, 1); s.g.res = cl(s.g.res + .8, 0, 100); }, end() { } },
  forest: { kind: "good", name: "森林と湿地の再生", cool: 30, dur: [1, 1], m: ["env"],
    risk: (s, st, P) => s.g.bio < 90 ? .004 + .02 * P.ecoP : 0, warn: () => null,
    start(s) { return "原因: 環境修復の配分と、放棄された土地の自然回復。洪水・干ばつ・山火事への緩衝になる"; },
    tick(s) { const g = s.g; g.bio = cl(g.bio + 3, 0, 100); g.pl = cl(g.pl - 2, 0, 100); g.land = cl((g.land || 0) + .08, 0, 1); }, end() { } },
  biodiv: { kind: "good", name: "生物多様性の回復", cool: 40, dur: [1, 1], m: ["env"],
    risk: (s, st, P) => s.g.bio > 60 ? .003 + .015 * P.ecoP + .006 * P.wildP : 0, warn: () => null,
    start() { return "原因: 生息地の連結と汚染の低下で、鳥類・昆虫・植物の種が戻り始めた"; },
    tick(s) { s.g.bio = cl(s.g.bio + 2, 0, 100); s.g.land = cl((s.g.land || 0) + .04, 0, 1); }, end() { } },
  warmstab: { kind: "good", name: "人為的な温暖化の安定化", cool: 80, dur: [1, 1], m: ["env", "safety"],
    risk: (s) => s.g.pl < 30 && !s.w9.flags.warm ? .03 : 0, warn: () => null,
    start() { return "原因: 排出が下がり、汚染が30を下回った。気候に由来する災害(洪水・干ばつ・暴風雨・山火事)の起きやすさは下がる。地震は気候と関係がないので変わらない"; },
    tick(s) { s.w9.flags.warm = s.year; for (const c of s.countries) c.hope = cl(c.hope + .03, .05, 1.3); }, end() { } },
  mamhab: { kind: "good", name: "大型哺乳類の生息環境の改善", cool: 40, dur: [1, 1], m: ["env"],
    risk: (s, st, P) => P.wildP > .04 ? .004 + .03 * P.wildP : 0, warn: () => null,
    start() { return "原因: 野生保護の配分で、分断された生息地が回廊でつながった"; },
    tick(s) { for (let gi = 0; gi < 4; gi++) s.mam[gi].hab = cl(s.mam[gi].hab + .04, 0, 1.2); s.g.bio = cl(s.g.bio + .5, 0, 100); }, end() { } },
  culture: { kind: "good", name: "文化・芸術・学問の深まり", cool: 35, dur: [1, 1], m: ["happy", "her"],
    risk: (s, st, P) => st.Hp > .5 && st.pr > .02 ? .004 + .01 * P.herP + .01 * (st.Hp - .5) : 0, warn: () => null,
    start() { return "原因: 余暇と記録への投資が、新しい作品と学びを生んだ"; },
    tick(s) { const g = s.g; g.her = cl(g.her + 1.5, 0, 100); g.hMod = cl(g.hMod + .004, -.04, .08); for (const c of s.countries) if (!c.extinct) c.happy = cl(c.happy + .02, 0, 1); }, end() { } },
  tradition: { kind: "good", name: "伝統文化の継承", cool: 35, dur: [1, 1], m: ["her", "happy"],
    risk: (s, st, P) => st.pr > .02 ? .004 + .014 * P.herP : 0, warn: () => null,
    start() { return "原因: 遺産への配分が、技と祭りを継ぐ人々を支えた"; },
    tick(s) { const g = s.g; g.her = cl(g.her + 1, 0, 100); g.arch = cl(g.arch + 1, 0, 100); for (const c of s.countries) if (!c.extinct) { c.consent = cl(c.consent + .01, 0, 1); c.unrest = cl(c.unrest - .01, 0, 1); } }, end() { } },
  faith: { kind: "good", name: "伝統宗教による静かな暮らしと共同体", cool: 40, dur: [1, 1], m: ["happy", "safety"],
    risk: (s, st, P) => st.Hop < 1 && st.pr > .02 ? .003 + .012 * P.careP + .006 * (1 - st.U) : 0, warn: () => null,
    start(s, ep, st) { const k = 2; ep.t = []; for (let i = 0; i < k; i++) { const c = wpick(s, st.live, x => cpop(x) * x.consent); const j = s.countries.indexOf(c); if (!ep.t.includes(j)) ep.t.push(j); } return `原因: 強制も搾取もない集まりが、看取りと相互扶助を担った(${ep.t.map(i => s.countries[i].name).join("・")}。評価したのは信仰の名ではなく、行動と結果)`; },
    tick(s, ep) { for (const i of ep.t) { const c = s.countries[i]; c.unrest = cl(c.unrest - .03, 0, 1); c.happy = cl(c.happy + .03, 0, 1); c.health = cl(c.health + .01, .1, 1); } s.w9.comm = cl(s.w9.comm + .35, 0, 1); }, end() { } },
  trust: { kind: "good", name: "相互扶助と社会的信頼の回復", cool: 40, dur: [1, 1], m: ["happy", "safety"],
    risk: (s, st, P) => st.Cn < .75 && st.U < .6 ? .003 + .012 * P.careP : 0, warn: () => null,
    start() { return "原因: 厳しい時期のあとで、近隣の助け合いが制度として根づいた"; },
    tick(s) { for (const c of s.countries) if (!c.extinct) c.consent = cl(c.consent + .04, 0, 1); s.ai.trust = cl(s.ai.trust + 3, 0, 100); s.w9.comm = cl(s.w9.comm + .2, 0, 1); s.w9.indiv = Math.max(0, s.w9.indiv - .1); s.w9.apathy = Math.max(0, s.w9.apathy - .1); }, end() { } },
  accept: { kind: "good", name: "終末を受け入れつつ、幸福に暮らす社会", cool: 60, dur: [1, 1], m: ["happy", "pop"],
    risk: (s, st, P) => st.Hp > .6 && st.pr < .6 && (s.g.accept || 0) < .8 ? .004 + .012 * P.careP : 0, warn: () => null,
    start(s, ep, st) { return `原因: 幸福(${st.Hp.toFixed(2)})と支援が重なり、終わりを知りながら今日を大切にする暮らしが根づいた。希望が戻り、人々は子を持つことをためらわなくなる`; },
    tick(s) { s.g.accept = cl((s.g.accept || 0) + .15, 0, 1); for (const c of s.countries) if (!c.extinct) c.hope = cl(c.hope + .05, .05, 1.3); }, end() { } },
};
// 重大な出来事で個別の判断を求める定義(EVENTSに登録される)
export const EP_ASKS = {
  pandemic: { title: "感染症の流行", body: (s, ep) => `${s.countries[ep.t[0]].name}で感染症が広がっている(深刻度${(ep.sev * 100).toFixed(0)})。${ep.cause}`,
    ch: [["quarantine", "隔離と医療に集中する", "資源を使い、不安は高まるが、被害は小さくなる", s => { const e = s.w9.ep.find(x => x.id === "pandemic"); if (e) { e.resp *= .55; e.until += 1; } s.g.res = cl(s.g.res - 1.5, 0, 100); for (const c of s.countries) c.unrest = cl(c.unrest + .01, 0, 1); }, "S2D-1"],
      ["balanced", "移動を制限しつつ暮らしを保つ", "被害も負担も中程度", s => { const e = s.w9.ep.find(x => x.id === "pandemic"); if (e) e.resp *= .8; }, "S1D1"],
      ["natural", "自然な経過に任せる", "資源は使わないが、被害は大きく、長引く", s => { const e = s.w9.ep.find(x => x.id === "pandemic"); if (e) { e.resp *= 1.3; e.until += 2; } }, "D1S-2"]] },
  cult: { title: "搾取的な団体の拡大", body: (s, ep) => `${ep.cause}`,
    ch: [["support", "離脱する人への支援と対話を行う", "時間はかかるが合意が育ち、団体の力が弱まる", s => { const e = s.w9.ep.find(x => x.id === "cult"); if (e) { e.resp *= .5; } s.g.res = cl(s.g.res - .6, 0, 100); s.w9.comm = cl(s.w9.comm + .1, 0, 1); }, "D2S-1"],
      ["regulate", "強制・搾取・医療拒否に当たる行為だけを取り締まる", "信教の自由は守りつつ、被害の行為を止める。反発も出る", s => { const e = s.w9.ep.find(x => x.id === "cult"); if (e) { e.resp *= .35; e.until = Math.min(e.until, s.year + 5); } for (const c of s.countries) c.unrest = cl(c.unrest + .008, 0, 1); }, "S2D-1"],
      ["leave", "個人の自由として静観する", "介入しない。被害が長引くことがある", s => { const e = s.w9.ep.find(x => x.id === "cult"); if (e) e.resp *= 1.2; }, "D1S-2"]] },
  despair: { title: "社会的な悲劇への備え", body: (s, ep) => `${ep.cause}。方法や詳細は扱わない。問われているのは、孤立と絶望にどう寄り添うか。`,
    ch: [["watch", "見守りと相談の支援を広げる", "資源と人手を使い、将来の発生を減らす", s => { s.w9.supp = cl(s.w9.supp + .5, 0, 1); s.g.res = cl(s.g.res - .5, 0, 100); }, "D2S1"],
      ["community", "共同体の集まりの場を再建する", "時間をかけて信頼と希望を育てる", s => { s.w9.comm = cl(s.w9.comm + .4, 0, 1); s.g.res = cl(s.g.res - .3, 0, 100); }, "D2"],
      ["respect", "個人の意思として尊重し、静かに寄り添う", "介入はしないが、孤立への備えは残る", s => { s.w9.supp = cl(s.w9.supp + .1, 0, 1); }, "D1"]] },
};

// ---------- 存続への挑戦(研究課題) ----------
// 単一の抽選ではなく、複数の必要条件(hard)がそろった年に、小さな成功確率(base)を soft の達成度で重みづけして引く。
// 宇宙天文学的な終末原因は宇宙線・高エネルギー粒子の増加として設定されている。宇宙空間に出ても遮蔽が薄いので不利で、他天体の地下遮蔽なら成り立ちうる。
export const BT = {
  space: { name: "宇宙空間への進出(軌道居住)", note: "軌道には大気の遮蔽が無く、終末の原因が強まる環境では成り立ちにくい", start: 2130, base: 2.0e-5,
    hard: [["宇宙基地が稼働している", (s, st) => spaceRatio(s) >= .5], ["資源に余裕がある", s => s.g.res >= 35], ["十分な技術者がいる", (s, st) => st.P >= 3e7], ["厚い遮蔽の技術がある", s => (s.g.shel || 0) >= .5]],
    soft: [["電力", (s, st) => st.live.length ? avg(st.live, c => Math.min(1, c.en)) : 0], ["輸送", (s, st) => st.Lg], ["国家間の合意", (s, st) => st.Cn], ["静穏期である", s => s.g.lull || 0]] },
  colony: { name: "他天体への移民・定住", note: "月・火星などの深い地下に遮蔽居住区を築く。軌道居住の経験(宇宙進出)が前提", start: 2160, base: 3.0e-5, needs: ["space", 55],
    hard: [["宇宙基地が稼働している", (s, st) => spaceRatio(s) >= .6], ["資源に余裕がある", s => s.g.res >= 40], ["十分な技術者がいる", (s, st) => st.P >= 5e7], ["厚い遮蔽の技術がある", s => (s.g.shel || 0) >= .6], ["医療の水準が高い", s => (s.g.med || 0) >= .3]],
    soft: [["電力", (s, st) => st.live.length ? avg(st.live, c => Math.min(1, c.en)) : 0], ["輸送", (s, st) => st.Lg], ["国家間の合意", (s, st) => st.Cn], ["静穏期である", s => s.g.lull || 0]] },
  upload: { name: "意識の連続的な移行(アップロード)", note: "情報の複製は連続性を保証しない。この世界で成功とみなすのは、連続性の検証に合格した段階的な移行だけ。管理AIのコアは複製できず対象外", start: 2190, base: 1.5e-5, needs: ["med", 50],
    hard: [["脳と意識の研究が進んでいる", s => s.g.rsr >= 70], ["資源に余裕がある", s => s.g.res >= 40], ["十分な技術者がいる", (s, st) => st.P >= 5e7], ["誤り訂正と遮蔽がある", s => (s.g.shel || 0) >= .6], ["社会が連続性を受け入れている", (s, st) => st.Cn >= .55]],
    soft: [["電力", (s, st) => st.live.length ? avg(st.live, c => Math.min(1, c.en)) : 0], ["輸送", (s, st) => st.Lg], ["幸福", (s, st) => st.Hp], ["AIとの信頼", s => s.ai.trust / 100]] },
  med: { name: "生命維持・再生医療の飛躍", note: "老化と放射線障害に立ち向かう医療。成功しても終末の原因は消えないが、人類が長く生きる道になる", start: 2125, base: 8.0e-5,
    hard: [["医療の水準が高い", s => (s.g.med || 0) >= .4], ["資源に余裕がある", s => s.g.res >= 35], ["十分な技術者がいる", (s, st) => st.P >= 2e7], ["遮蔽がある", s => (s.g.shel || 0) >= .4]],
    soft: [["電力", (s, st) => st.live.length ? avg(st.live, c => Math.min(1, c.en)) : 0], ["健康", (s, st) => st.Hl], ["国家間の合意", (s, st) => st.Cn], ["静穏期である", s => s.g.lull || 0]] },
};
const avg = (a, f) => a.reduce((p, x) => p + f(x), 0) / Math.max(1, a.length);
const spaceRatio = (s) => { let n = 0, r = 0; for (const f of s.facs) if (f.t === 5) { n++; if (f.st === 0) r++; } return n ? r / n : 0; };
export const MIRACLE_KINDS = { space: "宇宙空間での存続", colony: "他天体での定住", upload: "意識の連続的な移行", med: "生命維持の飛躍" };
// 最終段階の成功確率(1年あたり)。hardが1つでも欠ければ0
export function miracleChance(s, st, key) {
  const d = BT[key]; for (const [, f] of d.hard) if (!f(s, st)) return 0;
  let a = 0; for (const [, f] of d.soft) a += cl(f(s, st), 0, 1); a /= d.soft.length;
  return d.base * a * a;
}
function btStep(s, sh, st, flow) {
  const w = s.w9, g = s.g; if (!w.unl.bt || w.miracleDone) return;
  for (const key of Object.keys(BT)) {
    const d = BT[key], b = w.bt[key] || (w.bt[key] = { p: 0, fails: 0, last: null, done: false });
    if (b.done || s.year < d.start) continue; if (d.needs && ((w.bt[d.needs[0]] || { p: 0 }).p < d.needs[1])) continue;
    const feas = cl(avg(d.hard, ([, f]) => f(s, st) ? 1 : .35) * .6 + .4 * cl(g.res / 60, 0, 1), 0, 1) * (1 - .6 * (s.host.ctrl || 0)) * (1 - w.indiv);
    if (b.p < 100) {
      const inc = flow * sh.research * 0.008 * feas * (1 - b.p / 140);
      b.p = cl(b.p + inc, 0, 100); g.res = cl(g.res - inc * .004, 0, 100);
      // 失敗・中断・偽の突破口
      if (b.p >= 20 && rnd(s) < .012 * (1.3 - feas)) {
        const fake = rnd(s) < .35, loss = fake ? .5 : .3 + .2 * rnd(s); b.fails++; const bigHope = b.p >= 45; b.p *= 1 - loss;
        log(s, `【挑戦】${d.name}: ${fake ? "突破口と発表された成果が検証で否定された" : "実験の失敗と中断が重なり"}、進捗が${Math.round(loss * 100)}%後退した。`, "acc");
        if (bigHope && !w.ep.some(e => e.id === "letdown")) startEp(s, "letdown", { sev: fake ? .9 : .6, cause: `原因: ${d.name}への期待が大きかっただけに、失敗が社会の失望を呼んだ` });
      }
    } else {
      const q = miracleChance(s, st, key); b.q = q;
      if (q > 0 && rnd(s) < q) {
        b.done = true; w.miracleDone = true; s.flags.miracle = { kind: key, year: s.year }; g.miracleYear = s.year;
        log(s, `【奇跡】${s.year}年、${d.name}が成功した。${key === "upload" ? "連続性の検証に合格した最初の人々が、新しい基盤で目を覚ました。" : key === "med" ? "老いと放射線に耐える最初の世代が生まれた。" : key === "space" ? "遮蔽された軌道の居住区で、最初の世代が暮らし始めた。" : "月と火星の深い地下に、最初の定住区が築かれた。"}終末の原因は消えていない。それでも、人類の一部はここから先へ進む。`, "major");
        for (const c of s.countries) if (!c.extinct) c.hope = cl(c.hope + .2, .05, 1.3);
      }
    }
  }
}

// ---------- 出来事の進行 ----------
export function startEp(s, id, init = {}) {
  const w = s.w9, def = EPISODES[id], st = s.w9._st || gather(s), P = s.w9._P || powers(s, {});
  const ep = { id, y0: s.year, age: 0, resp: 1, ...init, t: [], m: def.m };
  const dur = def.dur[0] + Math.floor(rnd(s) * (def.dur[1] - def.dur[0] + 1)); ep.until = s.year + dur;
  ep.cause = def.start(s, ep, st, P) || ep.cause || "";
  w.ep.push(ep); w.last[id] = s.year; w.hist[def.kind]++; w.hist.byId[id] = (w.hist.byId[id] || 0) + 1;
  log(s, `【${def.kind === "bad" ? "出来事" : "良い知らせ"}】${s.year}年 ${def.name}。${ep.cause}(影響: ${def.m.map(k => MN[k]).join("・")})`, def.kind === "bad" ? "acc" : "hist");
  if (ep.ask) w.ask = id;
  return ep;
}
const MN = { pop: "人口", happy: "幸福", safety: "安全性", env: "環境", res: "資源", ai: "AI", her: "遺産" };
function powers(s, sh) { const g = s.g; return { careP: cl((sh.care || 0) * 2.2 + (g.med || 0) * .5, 0, 1), guardP: cl((sh.guard || 0) * 4, 0, 1), ecoP: cl((sh.eco || 0) * 3, 0, 1), herP: cl((sh.heritage || 0) * 3, 0, 1), wildP: sh.wild || 0, resP: cl((sh.research || 0) * 3, 0, 1) }; }
function episodes(s, sh, st) {
  const w = s.w9, P = powers(s, sh); w._st = st; w._P = P;
  // 進行中の出来事
  for (let i = w.ep.length - 1; i >= 0; i--) {
    const ep = w.ep[i], def = EPISODES[ep.id]; def.tick(s, ep, st, P); ep.age++;
    if (s.year >= ep.until) { def.end(s, ep, st, P); w.ep.splice(i, 1); if (w.ask === ep.id) w.ask = null; if (def.kind === "bad") log(s, `【収束】${def.name}が収まった。${(ep.k !== undefined && ep.k < .4) ? "備えが被害を抑えた。" : "後遺症が残る。"}`, "hist"); }
  }
  // 予兆と発生
  let started = 0; const warns = [];
  for (const id in EPISODES) {
    const def = EPISODES[id]; const last = w.last[id]; if (last !== undefined && s.year - last < def.cool) continue; if (w.ep.some(e => e.id === id)) continue;
    const p = def.risk(s, st, P); if (p <= 0) continue;
    const wr = def.warn && def.warn(s, st, P); if (wr) warns.push(wr);
    if (def.kind === "bad" && w.ep.filter(e => EPISODES[e.id].kind === "bad").length >= 2) continue; // 同時に重なる悪い出来事は2つまで
    if (started >= 1) continue;
    if (rnd(s) < p) { startEp(s, id); started++; }
  }
  w.warns = warns; w._st = null;
}

// ---------- 軍縮・居住域の集約・遮蔽 ----------
function structural(s, sh, st, flow) {
  const g = s.g, w = s.w9, H = s.host;
  // 軍縮: 軍事施設の停止が進むほど先へ進める。国家間の合意(協定)が崩れると後退する
  const open = channelOpen(s, "disarm"); const hpo = s.hostPolicy || {};
  const target = cl(1 - 1.1 * H.T - .8 * H.K + (hpo.diplomacy === "dialogue" ? .12 : hpo.diplomacy === "firm" ? -.12 : 0) - .15 * (H.str ? H.str.raid : 0), 0, 1);
  g.disAgr = cl((g.disAgr ?? 1) + (target - (g.disAgr ?? 1)) * .05 - .01 * ((H.yr && H.yr.raid) || 0) * ((g.dis || 0) > 10 ? 1 : 0), 0, 1);
  if (open && sh.disarm > 0) {
    const cap = 100 * (.2 + .8 * st.milFrac), rate = flow * sh.disarm * .06 * (s.coop || 1) * g.disAgr * cl(st.Cn / .35, .4, 1);
    const before = g.dis || 0; g.dis = Math.min(cap, before + rate); const d = g.dis - before;
    if (d > 0) { g.med = cl((g.med || 0) + d * .0035, 0, 1); for (const c of st.live) c.unrest = cl(c.unrest + .0018 * d, 0, 1); }
    if (g.dis > 15 && g.disAgr < .3 && !(w.last.disbreak > s.year - 40)) { w.last.disbreak = s.year; g.dis *= .6; for (const c of st.live) { c.unrest = cl(c.unrest + .05, 0, 1); } log(s, `【軍縮協定の破綻】国家間の不信が協定を壊し、軍縮は${Math.round(g.dis)}まで後退した(緊張${(H.T * 100).toFixed(0)}・合意${(g.disAgr * 100).toFixed(0)})。守りが薄い間は武装勢力にも狙われやすい。`, "major"); }
    // 兵器・危険物管理の失敗: 解体の途中の軍事施設で、急いだ軍縮ほど起きやすい
    if (d > .3 && rnd(s) < .004 * d) { let tf = null; for (const f of s.facs) if (f.t === 3 && f.st === 1 && (!tf || f.safety < tf.safety)) tf = f; if (tf) { tf.safety = cl(tf.safety - .25, .02, .97); w.hist.byId.armsFail = (w.hist.byId.armsFail || 0) + 1; log(s, `【兵器管理の失敗】${s.countries[tf.c].name}の${tf.n}で、解体中の危険物の管理に不備が出た(安全性が下がった)。`, "acc"); } }
  } else g.disAgr = Math.max(g.disAgr, .5);
  // 居住域・交通網の集約
  if (channelOpen(s, "consol") && sh.consol > 0) {
    const rate = flow * sh.consol * .022 * (.5 + .5 * st.Lg), before = g.cons || 0; g.cons = Math.min(100, before + rate); const d = g.cons - before;
    for (const c of st.live) { c.unrest = cl(c.unrest + .0022 * d, 0, 1); c.consent = cl(c.consent - .0012 * d, 0, 1); }
  }
  g.dis = g.dis || 0; g.cons = g.cons || 0;
  // 遮蔽された生活圏(shel): 余剰資源・社会の秩序・輸送・労働力で築かれ、手入れが無ければ劣化する。軍縮は建設力の民生転換として貢献する
  const surplusRaw = cl((g.res - 12) / 45, 0, 1), surplus = .35 + .65 * surplusRaw, order = cl(1 - st.U * 1.4, 0, 1), lab = .35 + .65 * Math.sqrt(cl(st.pr * 3, 0, 1)), c01 = st.cons;
  const invest = cl(sh.consol * 4 + sh.disarm * 1.5 + (sh.heritage || 0) * .3, 0, 1);
  const b = .025 * invest * surplus * order * (.4 + .6 * st.Lg) * lab * (.5 + .5 * c01 + .3 * (g.dis || 0) / 100) * (1 - (g.shel || 0) / .95);
  const decay = .001 * (g.shel || 0) * (1 + .8 * (1 - surplus * order)) * (1 + w.apathy * 2 + (H.str ? H.str.raid * .5 : 0));
  g.shel = cl((g.shel || 0) + b - decay, 0, .95);
  g.res = cl(g.res + (.17 * (g.dis || 0) / 100 + .13 * c01) * (1 - g.res / 100) * lab, 0, 100); // 転用・集約で出た資材の再利用(労働力が減ると小さくなる)
  g.milLoad = 1 - .8 * (g.dis || 0) / 100; g.transLoad = 1 - .6 * (g.cons || 0) / 100;
  // 受容(accept): 幸福・支援・共同体・秩序が続くと育ち、不安や無関心で損なわれる。終わりを知りながら生きる覚悟が、希望(出生)を支える
  { const P = powers(s, sh), tg = cl((st.Hp - .62) * 1.3 + 2.2 * Math.max(0, (sh.care || 0) - .22) + 1.0 * w.comm + .25 * w.supp + .2 * (g.dis || 0) / 100 - .6 * st.U - .3 * w.apathy, 0, 1); g.accept = cl((g.accept || 0) + (tg - (g.accept || 0)) * .015, 0, 1); }
  // 周期の減衰
  w.apathy *= .985; w.indiv *= .985; w.comm *= .99; w.supp *= .99;
}

// ---------- 解放と変更の機会 ----------
function unlocks(s, st) {
  const w = s.w9; let any = false;
  for (const u of UNLOCKS) if (!w.unl[u.id] && u.when(s, st)) { w.unl[u.id] = s.year; any = true; log(s, `【解放】${u.name}が使えるようになった(${u.why})。`, "major"); }
  return any;
}
function windows(s, any) {
  const w = s.w9, win = w.win;
  if (win.open && s.year >= win.until) { win.open = false; win.seen = win.seenS = false; log(s, "【変更機会の終了】次の方針の変更機会まで、設定は今の方針のまま進みます。", "hist"); }
  if (!win.open && s.mode === "auto" && s.year >= w.next) { win.open = true; win.from = s.year; win.until = s.year + WIN.len; win.n++; win.seen = win.seenS = false; w.next = s.year + WIN.every; w.pLock = false; log(s, `【方針の変更機会】${s.year}〜${win.until}年の間、全自動でも方針と遺産の設定を変えられます(方針・遺産タブの印)。`, "major"); }
  else if (!win.open && s.mode === "auto" && any && s.year >= PROGRAM9 + 5) { win.open = true; win.from = s.year; win.until = s.year + 40; win.n++; win.seen = win.seenS = false; w.pLock = false; log(s, `【方針の変更機会】新しい機能が解放されたため、${win.until}年まで方針を変えられます。`, "major"); }
}

export function stepW9(s, sh, flow) {
  const w = s.w9; if (!w || s.year < PROGRAM9) return;
  const st = gather(s);
  windows(s, unlocks(s, st));
  if (!st.live.length) return;
  structural(s, sh, st, flow);
  episodes(s, sh, st);
  btStep(s, sh, st, flow);
}
// 出来事の個別判断(EVENTSに登録するための定義を作る)
export function askEvents() {
  return Object.entries(EP_ASKS).map(([id, a]) => ({ id: "ep_" + id, minor: false, every: 1, when: s => !!(s.w9 && s.w9.ask === id && s.w9.ep.some(e => e.id === id)), title: a.title,
    body: s => { const ep = s.w9.ep.find(e => e.id === id); return a.body(s, ep); },
    ch: a.ch.map(c => [c[0], c[1], c[2], s => { s.w9.ask = null; c[3](s); }, c[4]]) }));
}

// 旧セーブの読み込み: 条件を満たしている解放は「確認済み」として引き継ぎ、新着の印は出さない
export function retroUnlock(s) {
  const w = s.w9; if (s.year < PROGRAM9) return;
  const st = gather(s); for (const u of UNLOCKS) if (!w.unl[u.id] && u.when(s, st)) { w.unl[u.id] = s.year; w.seen[u.id] = s.year; }
  w.next = Math.max(WIN.first, Math.ceil((s.year + 1) / 50) * 50);
}
