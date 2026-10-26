// 第10次: 3管轄エリア × 独立した3つのAI。DOM非依存。engine.js から stepYear の中で呼ばれる(engine を import しない)。
// s.tri が無いセーブ・世界は従来の単一AIとして動く(互換モード)。乱数は engine と同じ s.rng を使う(再現性)。
//
// 【考え方】
//  - 国家は3つのエリアに属し、各エリアは1つのAIが管理する。AIごとに別のコア・価値観・資源配分・学習・対外関係を持つ。
//  - 施設には「管理責任(rp)」があり、危険な負債(老朽原発など)は責任だけが移る。設備そのものは動かない。
//  - 負荷→蓄積(ひずみ)→閾値→崩壊→連鎖→部分的な回復、という1つの均衡の法則(eq)で、災害・敵対勢力・移住・交易の途絶を扱う。
//  - 小さな布石(予備の蓄え)が、後の崩壊をどれだけ軽くしたかを、同じ法則の反実仮想で計算して記録する。
import { rnd } from "./rng.js";
const cl = (x, a, b) => x < a ? a : x > b ? b : x;
const cpop = c => c.y + c.a + c.o;
const LIAB_H = [1, .5, .6, .8, .2, .15];
export const KEYS = ["research", "care", "decom", "stop", "eco", "heritage", "wild", "guard", "disarm", "consol"];
export const AREAS = [
  { id: 0, key: "blue", name: "大西洋圏", note: "南北アメリカ・アフリカ。若い人口と資源、弱い医療と物流" },
  { id: 1, key: "green", name: "ユーラシア圏", note: "欧州・ロシア・中東・南アジア。重い原子力の負債と大きな人口" },
  { id: 2, key: "orange", name: "太平洋圏", note: "東アジア・東南アジア・オセアニア。産業と技術、進む高齢化" },
];
export const AREA_BY_COLOR = { blue: 0, green: 1, orange: 2 };
// 国→エリア(現実の国・国境は変えず、所属だけを決める)。地域のまとまりごとに割り当て、地理的な連続を保つ
const REGIONS = {
  NAm: ["USA", "CAN", "MEX"], LAm: ["BRA", "COL", "ARG", "PER", "LAM"], Afr: ["NGA", "ETH", "EGY", "COD", "ZAF", "TZA", "KEN", "DZA", "SDN", "MAR", "AFR"],
  EuW: ["DEU", "GBR", "FRA", "ITA", "ESP", "POL", "EUR"], Rus: ["RUS", "UKR"], ME: ["TUR", "IRN", "IRQ", "SAU", "MEC"], SAs: ["IND", "PAK"],
  EAs: ["CHN", "JPN", "KOR"], SEA: ["IDN", "PHL", "VNM", "THA", "MMR", "MYS", "ASI", "BGD"], Oce: ["AUS", "OCE"],
};
const REGION_AREA = { NAm: 0, LAm: 0, Afr: 0, EuW: 1, Rus: 1, ME: 1, SAs: 1, EAs: 2, SEA: 2, Oce: 2 };
export const REGION_ADJ = [["NAm", "LAm"], ["LAm", "Afr"], ["Afr", "ME"], ["Afr", "EuW"], ["EuW", "Rus"], ["EuW", "ME"], ["Rus", "ME"], ["Rus", "EAs"], ["ME", "SAs"], ["SAs", "SEA"], ["SAs", "EAs"], ["EAs", "SEA"], ["SEA", "Oce"]];
export const REGION_OF = {}; export const AREA_OF = {};
for (const [r, ids] of Object.entries(REGIONS)) for (const id of ids) { REGION_OF[id] = r; AREA_OF[id] = REGION_AREA[r]; }
const adjacent = (a, b) => REGION_ADJ.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
// 公平性: 人口・GDP・原子炉・発展度・若さ のエリア別の割合
export function fairness(countries) {
  const tot = [0, 0, 0], k = { pop: [0, 0, 0], gdp: [0, 0, 0], nuc: [0, 0, 0], dev: [0, 0, 0], mil: [0, 0, 0] }, n = [0, 0, 0];
  for (const c of countries) { const a = AREA_OF[c.id]; if (a === undefined) continue; n[a]++; k.pop[a] += c.P0; k.gdp[a] += c.gdp0; k.nuc[a] += c.def.nuc; k.dev[a] += c.def.dev * c.P0; k.mil[a] += c.def.mil * c.P0; }
  const sh = (v) => { const t = v[0] + v[1] + v[2] || 1; return v.map(x => x / t); };
  const out = { n, pop: sh(k.pop), gdp: sh(k.gdp), nuc: sh(k.nuc), dev: sh(k.dev), mil: sh(k.mil) };
  out.balance = Math.min(...out.pop, ...out.gdp) / Math.max(...out.pop, ...out.gdp); // 1に近いほど人口・GDPの偏りが小さい
  return out;
}
// 各エリアの国の地域が、地域どうしの隣接でつながっているか(飛び地がないか)
export function contiguous(areaOf) {
  const res = [];
  for (let a = 0; a < 3; a++) {
    const regs = new Set(); for (const [id, ar] of Object.entries(areaOf)) if (ar === a) regs.add(REGION_OF[id]);
    const list = [...regs]; if (!list.length) { res.push(false); continue; }
    const seen = new Set([list[0]]), q = [list[0]];
    while (q.length) { const x = q.pop(); for (const y of list) if (!seen.has(y) && adjacent(x, y)) { seen.add(y); q.push(y); } }
    res.push(seen.size === list.length);
  }
  return res;
}

// ---------- 均衡モデル(臨界・連鎖・部分回復) ----------
export const SUB = ["電力", "物流", "医療", "食料・資源", "秩序", "保守"];
const LOAD_SCALE = 1.28; // 負荷の目盛り(通常の状態で余裕が小さく、ゆらぎで臨界に近づくように合わせた)
const BASE_CAP = [[.80, .74, .70, .64, .82, .78], [.76, .80, .78, .78, .84, .62], [.84, .82, .66, .76, .86, .76]]; // エリアごとの長所と短所
const THETA = [1.0, 1.0, 1.15, 1.05, 1.0, 1.0], RHO = [.12, .10, .06, .10, .08, .05], PHI = [.04, .05, .06, .03, .05, .08];
const COUP = [[0, .35, .2, .1, 0, 0], [.15, 0, .3, .4, 0, 0], [0, 0, 0, .1, .3, 0], [0, 0, .2, 0, .5, 0], [0, .3, 0, 0, 0, .4], [.3, .15, 0, 0, .15, 0]]; // 崩壊した部分から別の部分への波及
const RES_W = { 0: { disarm: .5, research: .3 }, 1: { consol: 1, disarm: .5 }, 2: { care: 1 }, 3: { eco: .8, consol: .3 }, 4: { guard: .8, care: .3 }, 5: { decom: .6, stop: .8 } }; // 配分→予備の蓄え
const EFFECT = [ // 崩壊したときの被害(σは崩壊の大きさ)
  (s, cs, sg) => { for (const c of cs) { c.logi = cl(c.logi - .05 * sg, .1, .98); c.happy = cl(c.happy - .03 * sg, 0, 1); c.unrest = cl(c.unrest + .02 * sg, 0, 1); lose(c, .0006 * sg); } },
  (s, cs, sg) => { for (const c of cs) { c.logi = cl(c.logi - .1 * sg, .1, .98); c.unrest = cl(c.unrest + .015 * sg, 0, 1); } },
  (s, cs, sg) => { for (const c of cs) { c.health = cl(c.health - .07 * sg, .1, 1); lose(c, .003 * sg); c.happy = cl(c.happy - .03 * sg, 0, 1); } },
  (s, cs, sg) => { for (const c of cs) { c.health = cl(c.health - .04 * sg, .1, 1); lose(c, .0018 * sg); c.unrest = cl(c.unrest + .03 * sg, 0, 1); } },
  (s, cs, sg) => { for (const c of cs) { c.unrest = cl(c.unrest + .07 * sg, 0, 1); c.consent = cl(c.consent - .04 * sg, 0, 1); c.sab = cl((c.sab || 0) + .05 * sg, 0, 1); } },
  (s, cs, sg, a) => { for (const f of s.facs) if (f.rp === a && f.st < 3) f.safety = cl(f.safety - .05 * sg, .02, .97); },
];
function lose(c, f) { c.y *= 1 - f; c.a *= 1 - f; c.o *= 1 - f; }
const newEq = (a, s) => { const x = [], cap = BASE_CAP[a].slice(); for (let k = 0; k < 6; k++) x.push(rnd(s) * rnd(s) * 1.5 * THETA[k]); return { x, cap, l: [0, 0, 0, 0, 0, 0], r: [0, 0, 0, 0, 0, 0], ld: [0, 0, 0, 0, 0, 0], sh: [0, 0, 0, 0, 0, 0], n: 0, slips: [], rec: 0 }; };

// ---------- 状態 ----------
const VAL0 = [{ safety: .8, dignity: 1.3, nature: .9, heritage: .6, growth: 1.2, wild: .8 }, { safety: 1.4, dignity: .9, nature: .6, heritage: 1.2, growth: .7, wild: .5 }, { safety: 1.0, dignity: .7, nature: .7, heritage: .8, growth: 1.4, wild: .4 }];
const POL0 = { research: 15, care: 25, decom: 25, stop: 10, eco: 15, heritage: 10, wild: 8, guard: 5, disarm: 0, consol: 0 };
export function initTriad(s, player, pref) {
  const tri = { v: 1, player, ai: [], res: [], mig: [], eq: [], trace: [], news: [], last: {}, op: { audit: 0.5, abuse: 0 }, ov: { stops: 0, vetoes: 0, caught: 0 }, trade: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], stat: { migrants: 0, aid: 0, wars: 0, transfers: 0, slips: 0, saved: 0 } };
  for (const c of s.countries) { c.area = AREA_OF[c.id] ?? 0; }
  for (const f of s.facs) f.rp = s.countries[f.c].area;
  for (let a = 0; a < 3; a++) {
    const v = { ...VAL0[a] }; for (const k in v) v[k] = +(v[k] + (rnd(s) - .5) * .3).toFixed(2);
    if (a === player && pref) { v.safety = pref.safety ?? v.safety; v.dignity = pref.dignity ?? v.dignity; v.nature = pref.nature ?? v.nature; v.heritage = pref.heritage ?? v.heritage; v.growth = pref.ai ?? v.growth; v.wild = pref.wild ?? v.wild; }
    tri.ai.push({ id: a, name: AREAS[a].name, key: AREAS[a].key, val: v, v0: { ...v }, w: Object.fromEntries(KEYS.map(k => [k, 0])), policy: { ...POL0 }, snap: null, score: 0, prev: null, core: 1, vac: 0, insight: 25 + rnd(s) * 15, exp: 0, tech: 0, open: .5, aggr: 0, share: .5, dev: 0, rel: [0, 0, 0], decided: 0, learnY: 0, recent: [] });
    tri.res.push(s.g.res); tri.eq.push(newEq(a, s));
  }
  s.tri = tri; tri.ai[player].policy = null; // 主人公のAIの配分は s.policy
  return tri;
}
export const areaOfCountry = (s, c) => c.area ?? 0;
export const polOf = (s, a) => (s.tri.ai[a].core === 0 || (s.tri.ai[a].vac > 0 && a !== s.tri.player)) ? provisional : (a === s.tri.player ? s.policy : s.tri.ai[a].policy);
const provisional = { research: 5, care: 30, decom: 20, stop: 5, eco: 10, heritage: 5, wild: 5, guard: 10, disarm: 0, consol: 0 }; // 管理が空白の間の、人間組織による暫定の管理
const note = (s, text, kind = "tri") => { s.log.push({ y: s.year, t: text, k: kind }); if (s.log.length > 1500) s.log.splice(0, 200); const t = s.tri; t.news.push({ y: s.year, t: text }); if (t.news.length > 40) t.news.shift(); };

// ---------- 年のはじめ: エリアごとの集計と、混ぜ合わせた配分 ----------
export function areaStats(s) {
  const out = [0, 1, 2].map(() => ({ pop: 0, pop0: 0, gdp: 0, gdp0: 0, happy: 0, unrest: 0, health: 0, logi: 0, en: 0, old: 0, n: 0, hope: 0 }));
  for (const c of s.countries) { const o = out[c.area ?? 0], p = cpop(c); o.gdp0 += c.gdp0; o.pop0 += c.P0; if (c.extinct || p <= 0) continue; o.pop += p; o.gdp += c.gdp || 0; o.happy += c.happy * p; o.unrest += c.unrest * p; o.health += c.health * p; o.logi += c.logi * p; o.en += Math.min(1, c.en ?? 1) * p; o.old += c.o; o.hope += c.hope * p; o.n++; }
  for (const o of out) { const q = o.pop || 1; o.happy /= q; o.unrest /= q; o.health /= q; o.logi /= q; o.en /= q; o.old /= q; o.hope /= q; }
  return out;
}
export function triPrep(s, sh, flow, st) {
  const t = s.tri, W = [0, 0, 0]; let tw = 0; for (let a = 0; a < 3; a++) { W[a] = Math.max(.02, st[a].gdp); tw += W[a]; }
  for (let a = 0; a < 3; a++) W[a] /= tw;
  const shA = [], psum = (p) => { let t2 = 0; for (const k of KEYS) t2 += p[k] || 0; return Math.max(1, t2); };
  for (let a = 0; a < 3; a++) { const p = polOf(s, a), tot = psum(p), o = {}; for (const k of KEYS) o[k] = (p[k] || 0) / tot; shA.push(o); }
  const blend = {}; for (const k of KEYS) { let v = 0; for (let a = 0; a < 3; a++) v += W[a] * shA[a][k]; blend[k] = v; }
  return { W, shA, blend };
}

// ---------- 準備と判断(AIごと) ----------
const noiseAt = (s, a, k, seed) => { let h = (s.year * 73856093) ^ (a * 19349663) ^ (k * 83492791) ^ (seed * 2654435761); h = Math.imul(h ^ (h >>> 13), 1274126177); return (((h ^ (h >>> 16)) >>> 0) / 4294967296) - .5; }; // 画面用の再現できる揺らぎ(乱数列を使わない)
const quality = (A) => cl(.35 * A.insight / 100 + .45 * Math.min(1, A.exp / 8) + .2 * Math.min(1, A.tech / 60), 0, .95);
function decide(s, i, st, P) {
  const t = s.tri, A = t.ai[i]; if (A.core === 0 || i === t.player) return;
  const pol = policyFor(s, i, st, P); A.policy = pol; A.decided = s.year; stance(s, i, st, P);
}
// 全自動のとき、主人公のAIも同じ判断の仕組み(自分の価値観・観測・学習)で配分を決める
export function autoPolicyTri(s) {
  const t = s.tri, st = areaStats(s), P = { liab: [0, 0, 0] };
  for (const f of s.facs) { if (f.st === 3) continue; const h = [1, .5, .6, .8, .2, .15][f.t], k = f.st === 0 ? 1 : f.st === 1 ? 1.1 : .25; P.liab[f.rp ?? 0] += h * (1 - f.safety) * k * (f.t <= 1 ? 1.4 : .6); }
  return policyFor(s, t.player, st, P);
}
function policyFor(s, i, st, P) {
  const t = s.tri, A = t.ai[i];
  const o = st[i], q = quality(A), nz = (1 - q) * .35, g = (x) => x + (rnd(s) - .5) * nz;
  const eq = t.eq[i], stress = Math.max(...eq.x.map((x, k) => x / THETA[k])), lead = Math.max(t.ai[0].tech, t.ai[1].tech, t.ai[2].tech), gap = cl((lead - A.tech) / 40, 0, 1);
  const needS = cl(g(1 - o.logi * .5 - o.health * .3) , 0, 1), needD = cl(g(1 - o.happy), 0, 1), needN = cl((60 - s.g.bio) / 60 + (rnd(s) - .5) * nz, 0, 1);
  const shrink = cl(g(1 - o.pop / Math.max(1, o.pop0)), 0, 1), liab = cl(P.liab[i] / 40, 0, 1.5), threat = cl(g(s.host.T + s.host.K), 0, 1.5);
  const open = channels(s);
  const raw = {
    research: .3 + A.val.growth * .9 + gap * .9 + (1 - A.dev) * 0, care: .5 + A.val.dignity * 1.2 * (.4 + needD), decom: .4 + A.val.safety * (.8 + 1.2 * needS) + liab * 1.2,
    stop: .25 + A.val.safety * .3 * needS, eco: .3 + A.val.nature * (.4 + needN), heritage: .15 + A.val.heritage * .5, wild: .1 + A.val.wild * .4, guard: .2 + threat * 1.6 + stress * .8,
    disarm: open.disarm ? Math.max(0, .2 + (A.val.dignity + A.val.safety) * .35 - threat * .9) : 0, consol: open.consol ? Math.max(0, .15 + shrink * 1.4 - o.unrest * 1.2 + A.val.nature * .1) : 0,
  };
  let tot = 0; for (const k of KEYS) { raw[k] = Math.max(0, raw[k]) * Math.exp(A.w[k]) * (1 + (rnd(s) - .5) * .2); tot += raw[k]; }
  const pol = {}; for (const k of KEYS) pol[k] = Math.round(100 * raw[k] / Math.max(.01, tot));
  return pol;
}
function stance(s, i, st, P) {
  const t = s.tri, A = t.ai[i], o = st[i], q = quality(A), nz = (1 - q) * .35, g = (x) => x + (rnd(s) - .5) * nz;
  const shrink = cl(g(1 - o.pop / Math.max(1, o.pop0)), 0, 1), threat = cl(g(s.host.T + s.host.K), 0, 1.5);
  // 他国との関わり方も価値観と経験から(固定の性格ではない)
  A.open = cl(.3 + .35 * A.val.dignity - .25 * A.val.safety + .2 * (1 - shrink) + (rnd(s) - .5) * .1, .05, .95);
  A.share = cl(.25 + .3 * A.val.dignity + .25 * q - .2 * A.val.growth + (rnd(s) - .5) * .1, .05, .95);
  A.aggr = cl(.08 + .3 * A.val.growth + .25 * A.val.safety * threat + .5 * (1 - t.res[i] / 100) - .25 * A.val.dignity + (rnd(s) - .5) * .1, 0, 1);
}
const channels = (s) => ({ disarm: !s.w9 || !!s.w9.unl.ch_disarm, consol: !s.w9 || !!s.w9.unl.ch_consol });
// 学習: 方針を変えた後の成果(エリアの得点の変化)を、予想との差で評価し、配分への傾向と価値観を少しずつ動かす
function areaScore(s, a, st) { const o = st[a], eq = s.tri.eq[a], strain = Math.max(...eq.x.map((x, k) => x / THETA[k])); return .35 * cl(o.pop / Math.max(1, o.pop0) * 1.2, 0, 1) + .25 * o.happy + .2 * (1 - cl(strain, 0, 1)) + .2 * cl(s.tri.res[a] / 100, 0, 1); }
function learn(s, i, st) {
  const t = s.tri, A = t.ai[i], sc = areaScore(s, i, st), pol = i === t.player ? s.policy : A.policy; if (!pol) return;
  const tot = KEYS.reduce((p, k) => p + (pol[k] || 0), 0) || 1, cur = Object.fromEntries(KEYS.map(k => [k, (pol[k] || 0) / tot]));
  if (A.prev !== null && A.snap) {
    A.recent.push(sc - A.prev); if (A.recent.length > 6) A.recent.shift();
    const n = A.recent.length, exp = A.recent.reduce((p, x) => p + x, 0) / n, sd = Math.sqrt(A.recent.reduce((p, x) => p + (x - exp) * (x - exp), 0) / n), r = (sc - A.prev) - exp * .5, z = cl(r / Math.max(.015, sd), -3, 3); // 予想(最近の変化)との差を、ふだんのばらつきで割って評価する
    for (const k of KEYS) { const d = (A.snap[k] - .1); A.w[k] = cl(A.w[k] + .3 * z * d, -1.2, 1.2); }
    const grp = { safety: ["decom", "stop", "guard"], dignity: ["care"], nature: ["eco"], heritage: ["heritage"], growth: ["research"], wild: ["wild"] };
    for (const v in grp) { const c = grp[v].reduce((p, k) => p + A.snap[k], 0); A.val[v] = cl(A.val[v] + .08 * z * (c - .2), .1, 2); }
    A.exp += .5;
  }
  A.prev = sc; A.snap = cur; A.learnY = s.year; A.score = sc;
}

// ---------- 均衡の更新 ----------
export function shock(s, ci, k, amt) { const t = s.tri; if (!t) return; const a = s.countries[ci].area ?? 0; t.eq[a].x[k] += amt; t.eq[a].ld[k] += amt; }
function loads(s, a, st, P) {
  const o = st[a], eq = s.tri.eq[a], r = s.tri.res[a], inflow = P.inflow[a] || 0;
  const dep = P.dep[a]; // 交易の依存と、その途絶
  return [cl(.28 + .9 * (1 - o.en) + dep.power * .6, 0, 1.8), cl(.22 + 1.0 * (1 - o.logi) + inflow * 3 + dep.logi * .4, 0, 1.8), cl(.14 + .7 * (1 - o.health) + .9 * o.old + inflow * 4, 0, 1.8), cl(.22 + Math.max(0, (55 - r) / 55) * 1.1 + dep.food * .7, 0, 1.8), cl(.18 + 1.4 * o.unrest + P.war[a] * .8, 0, 1.8), cl(.14 + P.liab[a] / Math.max(8, P.lab[a] * 5), 0, 1.8)];
}
function equilibrium(s, st, P, shA, W) {
  const t = s.tri;
  for (let a = 0; a < 3; a++) {
    if (st[a].pop < 1000) continue; // 無人のエリアでは均衡の計算を止める
    const eq = t.eq[a], ld = loads(s, a, st, P), cs = s.countries.filter(c => (c.area ?? 0) === a && !c.extinct), sh = shA[a];
    // 予備の蓄え(布石): 配分が続くと育ち、使われなければゆっくり目減りする
    for (let k = 0; k < 6; k++) { let b = 0; for (const key in RES_W[k]) b += RES_W[k][key] * (sh[key] || 0); eq.r[k] = cl(eq.r[k] * .996 + .022 * b * (st[a].pop > 0 ? 1 : 0), 0, .3); }
    const carry = [0, 0, 0, 0, 0, 0];
    for (let k = 0; k < 6; k++) {
      eq.sh[k] *= .985; ld[k] = Math.max(0, ld[k] * LOAD_SCALE - eq.sh[k]); eq.ld[k] = ld[k]; // 崩壊のあと、その部分の需要は縮む(別の安定状態へ)
      const baseEff = eq.cap[k] * (1 - eq.l[k]), capEff = baseEff + eq.r[k], over = ld[k] - capEff, overNo = ld[k] - baseEff;
      if (over > 0) eq.x[k] += .35 * over + .02;
      else eq.x[k] = Math.max(0, eq.x[k] * (1 - RHO[k]) + over * RHO[k] * .1);
      // 予備が負荷を吸収した分(予備がなかった場合との差)。これが「布石が効いた」記録の根拠
      if (overNo > 0 && over <= overNo) { const used = Math.min(eq.r[k], overNo) ; eq.saved = (eq.saved || 0) + used; if (used > .05 && s.year - (eq.lastNote?.[k] ?? -99) > 15 && a === t.player) { (eq.lastNote ||= {})[k] = s.year; trace(s, a, k, used, eq); } eq.r[k] = Math.max(0, eq.r[k] - used * .05); }
      if (eq.l[k] >= .45) eq.x[k] = Math.min(eq.x[k], .5 * THETA[k]); // 損失が限界まで進んだ部分は、崩壊を繰り返さず、低い水準で固定される
      if (eq.x[k] > THETA[k]) { // 臨界: 崩壊(大きさ σ)。ひずみは解放され、一部は戻らない損失になる
        const sg = (eq.x[k] - THETA[k]) + .25 * THETA[k]; eq.x[k] = THETA[k] * .35; eq.l[k] = cl(eq.l[k] + PHI[k] * sg, 0, .5);
        EFFECT[k](s, cs, sg, a); eq.sh[k] = Math.min(.5, eq.sh[k] + .1 * sg); eq.n++; t.stat.slips++; eq.slips.push({ y: s.year, k, sg: +sg.toFixed(2) }); if (eq.slips.length > 12) eq.slips.shift();
        for (let j = 0; j < 6; j++) if (COUP[k][j]) carry[j] += COUP[k][j] * sg;
        // 他エリアへの波及: 医療・秩序の崩壊は難民と不安を隣へ送る
        if (sg > .35 && (k === 2 || k === 4 || k === 3)) for (let b = 0; b < 3; b++) if (b !== a) t.eq[b].x[4] += .08 * sg * (adjArea(a, b) ? 1 : .4);
        if (sg >= .25 || a === t.player) note(s, `【崩壊】${t.ai[a].name}で「${SUB[k]}」が限界を超えた(大きさ${sg.toFixed(1)}${k === 5 ? "・施設の安全余裕が下がった" : ""})。${eq.l[k] > .05 ? "一部は元に戻らない。" : ""}`, "acc");
      }
    }
    for (let j = 0; j < 6; j++) if (carry[j]) eq.x[j] += carry[j];
  }
}
const adjArea = (a, b) => REGION_ADJ.some(([x, y]) => (REGION_AREA[x] === a && REGION_AREA[y] === b) || (REGION_AREA[x] === b && REGION_AREA[y] === a));
function trace(s, a, k, used, eq) {
  const t = s.tri; const since = eq.firstR?.[k] ?? s.year - 20;
  t.trace.push({ y: s.year, a, k, text: `${SUB[k]}の予備(配分の積み重ね)が、負荷${used.toFixed(2)}ぶんを吸収した。予備が無ければ、ひずみの蓄積は約${(.35 * used).toFixed(2)}大きかった(同じ計算での比較。ほかの要因の寄与は分けられない)。` });
  if (t.trace.length > 30) t.trace.shift(); t.stat.saved++;
  note(s, `【布石】${s.year}年: ${SUB[k]}の予備が負荷${used.toFixed(2)}ぶんを吸収した。`, "tri");
}

// ---------- 年次の相互作用 ----------
export function triStep(s, flow, ctx) {
  const t = s.tri, st = ctx.st, P = ctx.P, shA = ctx.shA, W = ctx.W; // 年のはじめの集計を使う(判断・移動・交易などは年のはじめの状態を見る)
  P.inflow = [0, 0, 0]; P.war = P.war || [0, 0, 0];
  // 資源の保存: 年の内の増減を、各エリアの消費の割合で配る
  const dg = s.g.res - ctx.res0, w2 = W[0] * W[0] + W[1] * W[1] + W[2] * W[2]; if (dg) { for (let a = 0; a < 3; a++) t.res[a] = cl(t.res[a] + dg * W[a] / w2, 0, 100); } // 重みつき平均が dg だけ動くように、消費の大きいエリアに多く配る
  // 判断(5年ごと、AIごとにずらす)と学習(10年ごと)
  for (let i = 0; i < 3; i++) { if ((s.year + i * 2) % 5 === 0) decide(s, i, st, P); if ((s.year + i * 3) % 10 === 0) learn(s, i, st); t.ai[i].insight = cl(t.ai[i].insight + .03 + .01 * (polOf(s, i).research || 0) / 20, 0, 100); t.ai[i].tech += flow * W[i] * ((polOf(s, i).research || 0) / 100) * .25; if (t.ai[i].vac > 0) t.ai[i].vac--; }
  migration(s, st, P); trade(s, st, P, flow); liabilities(s, st, P); conflict(s, st, P); oversight(s, st, P);
  const st2 = areaStats(s);
  equilibrium(s, st2, P, shA, W);
  // 総合の資源はエリアの資源の加重平均(既存の計算が使う g.res と一致させる)
  let gr = 0; for (let a = 0; a < 3; a++) gr += W[a] * t.res[a]; s.g.res = cl(gr, 0, 100);
  // 学習の経験: 崩壊を見るたび、予測が正確になる
  for (let a = 0; a < 3; a++) t.ai[a].exp = Math.max(t.ai[a].exp, t.eq[a].n * .6);
  t._war = P.war; t.techSyn = P.techSyn || 1; t.stat.last = s.year;
}

// 人口の移動: 魅力の差と国境の開放度で決まり、移動先で負荷にもなる。保存則(出た人=着いた人+途中の損失)
function migration(s, st, P) {
  const t = s.tri, arrive = t.mig; t.mig = [];
  // 前年に出発した人々が到着する(時間の遅れ)。行き先が無人になっていたら途中で失われる
  for (const m of arrive) { const c = s.countries[m.to]; if (!c || c.extinct) { t.stat.lost = (t.stat.lost || 0) + m.y + m.a + m.o; continue; } c.y += m.y; c.a += m.a; c.o += m.o; const n = m.y + m.a + m.o; P.inflow[c.area ?? 0] += n / Math.max(1e5, st[c.area ?? 0].pop); t.stat.arrived = (t.stat.arrived || 0) + n; }
  if (s.year < 2101) return;
  const att = (a) => { const o = st[a]; return .35 * o.happy + .25 * (1 - o.unrest) + .2 * o.health + .2 * cl(t.res[a] / 60, 0, 1) - .3 * P.war[a]; };
  const A = [att(0), att(1), att(2)];
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    if (a === b || t.ai[a].core === 0 || t.ai[b].core === 0) continue;
    const gap = A[b] - A[a] - .08 - (adjArea(a, b) ? 0 : .06); if (gap <= 0) continue;
    const frac = Math.min(.004, gap * .01) * t.ai[a].open * t.ai[b].open; if (frac <= 0) continue;
    const src = s.countries.filter(c => (c.area ?? 0) === a && !c.extinct && cpop(c) > 1e5), dst = s.countries.filter(c => (c.area ?? 0) === b && !c.extinct);
    if (!src.length || !dst.length) continue;
    let tw = 0; for (const c of dst) tw += cpop(c) * (.3 + c.happy); let moved = 0;
    for (const c of src) {
      const f = frac * (.5 + c.unrest) * (c.a / Math.max(1, cpop(c))) * 1.2, ny = c.y * f, na = c.a * f, no = c.o * f * .3; c.y -= ny; c.a -= na; c.o -= no; const n = ny + na + no; moved += n;
      const loss = .04; // 途中の損失
      for (const d of dst) { const w = cpop(d) * (.3 + d.happy) / tw; if (w * n < 1) { t.stat.lost = (t.stat.lost || 0) + w * n; continue; } t.mig.push({ to: s.countries.indexOf(d), y: ny * w * (1 - loss), a: na * w * (1 - loss), o: no * w * (1 - loss), from: a }); t.stat.lost = (t.stat.lost || 0) + n * w * loss; }
    }
    t.stat.migrants += moved; if (moved > .004 * st[b].pop) t.ai[b].rel[a] = cl(t.ai[b].rel[a] - .02, -1, 1); // 移入が多すぎる側の不満
    if (moved > 5e6 && s.year - (t.stat.migNote ?? -99) > 12) { t.stat.migNote = s.year; note(s, `【人口移動】${t.ai[a].name}から${t.ai[b].name}へ、${Math.round(moved / 1e4)}万人が移った(魅力の差${gap.toFixed(2)}。移入先は医療と物流の負荷が増える)。`); }
  }
}
function trade(s, st, P, flow) {
  const t = s.tri; for (const A of t.ai) for (let j = 0; j < 3; j++) A.rel[j] *= .97; // 関係は放っておくと薄れる
  P.dep = [{ power: 0, logi: 0, food: 0 }, { power: 0, logi: 0, food: 0 }, { power: 0, logi: 0, food: 0 }];
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
    const rel = (t.ai[a].rel[b] + t.ai[b].rel[a]) / 2, ok = t.ai[a].core && t.ai[b].core && !(t.trade[a][b] < 0), vol = t.trade[a][b] = cl((t.trade[a][b] || 0) + (rel > -.2 && ok ? .01 : -.03) * (t.ai[a].open + t.ai[b].open) / 2, 0, 1);
    for (const [x, y] of [[a, b], [b, a]]) { t.ai[x].rel[y] = cl(t.ai[x].rel[y] + .02 * vol, -1, 1); P.dep[x].food += vol * .3 * (t.res[y] > t.res[x] ? 1 : .2); P.dep[x].power += vol * .12; P.dep[x].logi += vol * .15; }
    // 援助: 余裕のあるAIが、窮した相手に分ける(輸送の損失10%、受け取る側は依存と信頼を深める)
    for (const [x, y] of [[a, b], [b, a]]) {
      const D = t.ai[x], R = t.ai[y]; if (!D.core || !R.core || t.res[x] < 45 || t.res[y] > 40 || rel < -.3) continue;
      if (rnd(s) > .3 + .5 * D.val.dignity * .5) continue;
      const amt = Math.min(6, (t.res[x] - 40) * .3); if (amt <= 0) continue; t.res[x] -= amt; t.res[y] = cl(t.res[y] + amt * .9, 0, 100); t.stat.aid += amt; D.rel[y] = cl(D.rel[y] + .05, -1, 1); R.rel[x] = cl(R.rel[x] + .08, -1, 1);
      if (amt > 2 && s.year - (t.stat.aidNote ?? -99) > 10) { t.stat.aidNote = s.year; note(s, `【援助】${D.name}が${R.name}へ資源${amt.toFixed(1)}を送った(受け取りは${(amt * .9).toFixed(1)})。${R.name}の食料・資源の負荷が和らいだ。`); }
    }
    const cut = Math.max(0, -(rel + .25)) ; if (cut > 0 && vol > .1) { t.trade[a][b] = Math.max(0, vol - .15); for (const [x] of [[a], [b]]) { t.eq[x].x[3] += .06 * vol; t.eq[x].x[0] += .03 * vol; } }
  }
  // 技術: 先行するAIの成果は、共有する相手に染み出す。秘匿されても模倣で遅れて追いつく
  const lead = t.ai.reduce((p, x, i) => x.tech > t.ai[p].tech ? i : p, 0);
  for (let i = 0; i < 3; i++) if (i !== lead) { const L = t.ai[lead], F = t.ai[i], gapT = L.tech - F.tech; if (gapT > 0) F.tech += gapT * (.004 + .03 * L.share * (1 + F.rel[lead] * .5) + .01 * F.val.growth); }
  P.techSyn = 0.85 + .35 * (t.ai[0].share + t.ai[1].share + t.ai[2].share) / 3; // 共有が広いほど研究全体が進む。秘匿が多いと重複で遅れる
}
// 危険な負債: 老朽・危険な施設の「管理責任」だけが移る。施設は動かず、責任を持つAIの配分が処理に当たる
function liabilities(s, st, P) {
  const t = s.tri; if (s.year % 3 !== 0) return;
  let from = -1, worst = 0; for (let a = 0; a < 3; a++) { const l = P.liab[a] / Math.max(10, P.lab[a] * 8); if (l > worst) { worst = l; from = a; } }
  if (from < 0 || worst < .85 || !t.ai[from].core) return;
  const to = [0, 1, 2].filter(b => b !== from && t.ai[b].core).sort((x, y) => (P.liab[x] / Math.max(10, P.lab[x] * 8)) - (P.liab[y] / Math.max(10, P.lab[y] * 8)))[0]; if (to === undefined) return;
  let fa = null; for (const f of s.facs) if (f.rp === from && f.st < 2 && (f.t === 0 || f.t === 1) && (!fa || f.safety < fa.safety)) fa = f; if (!fa) return;
  const R = t.ai[to], D = t.ai[from], burden = (1 - fa.safety) * 4, pay = Math.min(t.res[from] * .12, burden * 1.2);
  const util = pay * 1.1 + R.rel[from] * 3 + (t.ai[from].val.growth > R.val.growth ? 0 : 1) - burden * (1 + P.liab[to] / 60) - (R.val.safety > 1.1 ? 2 : 0);
  if (util < 0 || rnd(s) > .6) { D.rel[to] = cl(D.rel[to] - .02, -1, 1); return; }
  if (!approved(s, from, to, "責任の移管")) return;
  t.res[from] -= pay; t.res[to] = cl(t.res[to] + pay, 0, 100); fa.rp = to; t.stat.transfers++; R.rel[from] = cl(R.rel[from] - .04, -1, 1);
  note(s, `【負債の移管】${s.countries[fa.c].name}の${fa.n}(安全余裕${(fa.safety * 100).toFixed(0)}%)の管理責任が、${D.name}から${R.name}へ移った(対価${pay.toFixed(1)})。設備そのものは動かない。以後の処理費用と事故の対応は${R.name}が負う。`);
}
// 対立: 制裁・威圧・限定的な侵略。重要な操作は複数のAIの承認が要る
function conflict(s, st, P) {
  const t = s.tri; P.war = P.war.map(x => x * .8);
  if (s.year < 2110) return;
  for (let a = 0; a < 3; a++) {
    const A = t.ai[a]; if (!A.core || A.aggr < .35 || rnd(s) > .1 * A.aggr) continue;
    let b = [0, 1, 2].filter(x => x !== a && t.ai[x].core).sort((x, y) => (A.rel[x] - st[x].pop / Math.max(1, st[a].pop) * .3) - (A.rel[y] - st[y].pop / Math.max(1, st[a].pop) * .3))[0]; if (b === undefined) continue;
    const grab = t.res[a] < 60 && t.res[b] > t.res[a] + 8 && A.aggr > .3, kind = (A.aggr > .5 || grab) && t.res[b] > 20 && st[a].pop > st[b].pop * .6 ? "invade" : "sanction"; // 資源が乏しい側が、豊かな隣を狙う
    if (kind === "invade" && !adjArea(a, b)) { const nb = [0, 1, 2].find(x => x !== a && t.ai[x].core && adjArea(a, x)); if (nb === undefined) continue; b = nb; } // 侵略は隣り合う地域にだけ
    if (s.year - (t.last[a * 3 + b] ?? -99) < (kind === "invade" ? 30 : 20)) continue; t.last[a * 3 + b] = s.year; // 同じ相手への行動には間隔が空く
    if (!approved(s, a, b, kind === "invade" ? "限定的な侵略" : "制裁")) continue;
    A.rel[b] = cl(A.rel[b] - .25, -1, 1); t.ai[b].rel[a] = cl(t.ai[b].rel[a] - .35, -1, 1); A.dev = cl(A.dev + .1, 0, 1);
    if (kind === "invade") t.stat.tryInv = (t.stat.tryInv || 0) + 1;
    if (kind === "sanction") { t.stat.sanctions = (t.stat.sanctions || 0) + 1; t.trade[a][b] = t.trade[b][a] = 0; t.eq[b].x[3] += .12; t.eq[a].x[3] += .05; P.war[b] += .1; note(s, `【制裁】${A.name}が${t.ai[b].name}への交易を止めた。互いに食料・資源の負荷が増える(依存が深いほど痛い)。`); continue; }
    // 侵略: 隣り合う地域の国を1つ取る。人口・施設・国境はそのまま、管理だけが移る。戦争には損失と反動が伴う
    const mine = new Set(s.countries.filter(c => (c.area ?? 0) === a).map(c => REGION_OF[c.id]));
    const cand = s.countries.filter(c => (c.area ?? 0) === b && !c.extinct && [...mine].some(r => adjacent(r, REGION_OF[c.id]))).sort((x, y) => cpop(y) * (y.def.dev + .3) - cpop(x) * (x.def.dev + .3));
    if (!cand.length) { t.stat.noCand = (t.stat.noCand || 0) + 1; continue; } const c = cand[0], i = s.countries.indexOf(c), loss = .006 + .01 * rnd(s);
    lose(c, loss); const lossAtk = loss * .3; for (const k of s.countries) if ((k.area ?? 0) === a && !k.extinct) lose(k, lossAtk * .1);
    c.area = a; for (const f of s.facs) if (f.c === i) f.rp = a; c.unrest = cl(c.unrest + .15, 0, 1); c.consent = cl(c.consent - .2, 0, 1);
    t.res[a] = cl(t.res[a] - 3, 0, 100); t.res[b] = cl(t.res[b] - 2, 0, 100); P.war[a] += .2; P.war[b] += .3; t.stat.wars++; t.eq[a].x[4] += .1; t.eq[b].x[4] += .2;
    note(s, `【侵略】${A.name}が${t.ai[b].name}の${c.name}の管理を奪った(犠牲${(loss * cpop(c) / 1e4).toFixed(0)}万人)。国境・人口・施設はそのままで、管理だけが移る。資源と信頼を失い、反動が残る。`, "war");
  }
}
// 相互監視(三権分立に着想した制度): 相互監査・複数承認・拒否権・安全停止。万能ではなく、抜け道も残る
function approved(s, from, what, label) {
  const t = s.tri; t.ov.asked = (t.ov.asked || 0) + 1; const third = [0, 1, 2].find(x => x !== from && x !== what); const T3 = t.ai[third], W2 = t.ai[what];
  if (!T3.core && !W2.core) return true;                                  // 承認者がいなければ制度が働かない(管理の空白)
  const collude = T3.rel[from] > .4 && W2.rel[from] > .25;                  // 談合: 2者が近いと3者目の拒否が通らない
  const veto = T3.core && T3.rel[from] < -.1 && rnd(s) < .5 + .3 * quality(T3);
  if (label === "限定的な侵略") t.stat.invReq = (t.stat.invReq || 0) + 1;
  if (veto && !collude) { t.ov.vetoes++; t.ai[from].dev = cl(t.ai[from].dev + .05, 0, 1); note(s, `【拒否権】${T3.name}が${t.ai[from].name}の「${label}」を止めた。`); return false; }
  if (collude) { t.op.abuse += .05; if (label !== "責任の移管") note(s, `【談合の疑い】${t.ai[from].name}と${T3.name}の近さで、「${label}」の承認が緩んだ。`); }
  return true;
}
function oversight(s, st, P) {
  const t = s.tri; if (s.year < 2105 || s.year % 2) return;
  for (let i = 0; i < 3; i++) {
    const A = t.ai[i]; if (!A.core) continue;
    // 逸脱: 自己保存、秘匿、越権の積み重ね
    const sp = i === t.player ? s.ai.sp : cl(.25 + .25 * A.val.growth - .15 * A.val.dignity + A.aggr * .2, 0, 1);
    A.dev = cl(A.dev * .96 + .02 * sp + (t.res[i] < 15 ? .01 : 0), 0, 1);
    for (let j = 0; j < 3; j++) { if (j === i || !t.ai[j].core) continue; const J = t.ai[j];
      const detect = quality(J) * (1 - .5 * A.share * 0) * (1 - .3 * Math.max(0, J.rel[i] - .5)) ; // 親しいと目が甘くなる
      if (A.dev > .45 && rnd(s) < detect * .25) { t.ov.caught++; J.rel[i] = cl(J.rel[i] - .12, -1, 1); A.dev = cl(A.dev - .15, 0, 1); note(s, `【相互監査】${J.name}が${A.name}の逸脱(自己保存・越権)を見つけた。是正を求められ、信頼が下がった。`); }
      // 安全停止: 2者が同意し逸脱が重い場合のみ。コアは複製できず、停止すると管理の空白が生じる
      if (A.dev > .8) { const k = [0, 1, 2].find(x => x !== i && x !== j); if (t.ai[k].core && t.ai[k].rel[i] < 0 && J.rel[i] < 0 && rnd(s) < .2) { A.core = 0; A.vac = 30; t.ov.stops++; note(s, `【安全停止】${A.name}のコアが、他の2つのAIの合意で停止された。この地域は人間組織による暫定の管理に入る(研究・配分の力が落ちる)。`, "major"); } }
    }
    // 管理の空白: 暫定管理の間は負荷が増える。隣のAIが引き受けることもある
    if (!A.core) { t.eq[i].x[4] += .03; t.eq[i].x[5] += .03; if (s.year % 10 === 0) { const h = [0, 1, 2].filter(x => x !== i && t.ai[x].core && t.ai[x].rel[i] > .1)[0]; if (h !== undefined && rnd(s) < .4) { A.vac = 0; note(s, `【引き継ぎ】${t.ai[h].name}が${A.name}の管理を一部引き受けた。`); } } }
  }
}
export function triSummary(s) {
  const t = s.tri, st = areaStats(s);
  return t.ai.map((A, a) => ({ id: a, name: A.name, key: A.key, me: a === t.player, pop: st[a].pop, pop0: st[a].pop0, res: t.res[a], happy: st[a].happy, stable: 1 - cl(Math.max(...t.eq[a].x.map((x, k) => x / THETA[k])), 0, 1), tech: A.tech, core: A.core, n: st[a].n }));
}
// 崩壊の兆候: 見えない閾値の推定。AIの観測力と経験が高いほど、揺らぎが小さい(画面用。乱数列は使わない)
export function forecast(s, a = s.tri.player) {
  const t = s.tri, A = t.ai[a], eq = t.eq[a], q = quality(A), out = [];
  for (let k = 0; k < 6; k++) { const risk = eq.x[k] / THETA[k] + Math.max(0, eq.ld[k] - (eq.cap[k] * (1 - eq.l[k]) + eq.r[k])) * .5; const est = risk + noiseAt(s, a, k, 7) * (1 - q) * .8; out.push({ k, name: SUB[k], est: cl(est, 0, 1.4), true: risk, load: eq.ld[k], reserve: eq.r[k], lost: eq.l[k], err: (1 - q) * .4 }); }
  return { q, items: out.sort((x, y) => y.est - x.est) };
}
export function triPre(s, sh0, flow) { // stepYear の冒頭: 集計と混ぜ合わせた配分
  const t = s.tri, st = areaStats(s), pr = triPrep(s, sh0, flow, st);
  const P = { liab: [0, 0, 0], lab: [0, 0, 0], inflow: [0, 0, 0], war: (t._war || [0, 0, 0]).slice(), dep: [{ power: 0, logi: 0, food: 0 }, { power: 0, logi: 0, food: 0 }, { power: 0, logi: 0, food: 0 }] };
  if (!t._liab || s.year - t._liab.y >= 3 || s.year < t._liab.y) { const L = [0, 0, 0]; for (const f of s.facs) { if (f.st === 3) continue; L[f.rp ?? 0] += LIAB_H[f.t] * (1 - f.safety) * (f.st === 0 ? 1 : f.st === 1 ? 1.1 : .25) * (f.t <= 1 ? 1.4 : .6); } t._liab = { y: s.year, L }; } // 負債の集計は3年に1回(ゆっくり動く量)
  for (let a = 0; a < 3; a++) P.liab[a] = t._liab.L[a];
  for (const c of s.countries) if (!c.extinct) P.lab[c.area ?? 0] += (c.a * .75) / 1e8;
  for (const k of KEYS) sh0[k] = pr.blend[k];
  return { ...pr, st, P, res0: s.g.res };
}
