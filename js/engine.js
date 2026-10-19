// 世界の終活者 - シミュレーション本体(DOM非依存・JSONシリアライズ可能・乱数はシード固定)
import { COUNTRY_DEFS, FACTYPES } from "./data.js";
import { SITES, initSites, stepSites, siteScore, siteSummary, setSite, applySitePolicy, undecided } from "./heritage.js";
import { cityNarratives, decadeNarrative, cityOf, era } from "./narrative.js";
export { SITES, setSite, applySitePolicy, undecided, siteScore, siteSummary, era, cityOf };

export const START_YEAR = 2020, DISCOVERY = 2050, CERTAIN = 2080, PROGRAM = 2100;
export const CHANNELS = [
  ["research", "生存研究"], ["care", "終活支援"], ["decom", "施設停止"],
  ["stop", "機械停止準備"], ["eco", "環境修復"], ["heritage", "文明遺産保存"],
];
export const PRESETS = {
  balanced: { research: 15, care: 25, decom: 25, stop: 10, eco: 15, heritage: 10 },
  care: { research: 5, care: 45, decom: 20, stop: 10, eco: 10, heritage: 10 },
  research: { research: 50, care: 15, decom: 15, stop: 5, eco: 10, heritage: 5 },
  safety: { research: 5, care: 15, decom: 45, stop: 20, eco: 10, heritage: 5 },
  legacy: { research: 5, care: 15, decom: 20, stop: 10, eco: 25, heritage: 25 },
};
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

// ---------- 乱数 ----------
function rnd(s) { // mulberry32。状態をs.rngに保持
  let t = (s.rng = (s.rng + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- 初期化 ----------
export function newGame(seed = 1) {
  const s = {
    v: 2, seed, rng: seed | 0, year: START_YEAR, countries: [], facs: [], log: [], chosen: [],
    pending: null, done: {}, flags: {}, ended: null, hist: [], post: 0,
    ai: { cap: 10, insight: 10, align: 20, trust: 55, sp: 0.1, focus: "world" },
    g: { pl: 40, bio: 78, scar: 0, res: 100, her: 100, rsr: 0, ark: 0, mach: 5, stopReady: 0, gdp0: 0, P0: 0,
      arch: 0, accidents: 0, wars: 0, sov: 1, overrides: 0, hpAcc: 0, hpW: 0, peak: 0, unrestAcc: 0, unrestN: 0, lastC: null, lastYear: null,
      hBorn: 0, hDead: 0, aiActive: 0, aiBuilt: 0, aiStopped: 0, sitesBio: 0, hMod: 0, survivors: 0, arkYear: null, fossil: 0, final: null, machRemain: 0, aiRemain: false, hidden: false, flow: 0 },
    policy: { ...PRESETS.balanced }, sovMode: "consent", machStance: "std",
  };
  let fid = 0;
  for (const d of COUNTRY_DEFS) {
    const P = d.pop * 1e6, yS = clamp(.37 - .14 * d.dev, .2, .5), oS = clamp(.04 + .17 * d.dev, .03, .25);
    const c = {
      id: d.id, name: d.name, def: d, y: P * yS, a: P * (1 - yS - oS), o: P * oS, P0: P, tfr: d.tfr, L0: P * (1 - yS - oS) * .75,
      gdp0: d.gdp, gdp: d.gdp, ind: 1, logi: .6 + .35 * d.dev, happy: .5 + .1 * d.dev, unrest: .25 - .1 * d.dev,
      consent: .15, aware: 0, auto: 0, health: .4 + .5 * d.dev, m: 1, en: 1, extinct: false, nucS: 0,
    };
    s.countries.push(c); s.g.gdp0 += d.gdp; s.g.P0 += P;
    const mk = (t, n, tag) => { for (let i = 0; i < n; i++) s.facs.push({ id: fid++, c: s.countries.length - 1, t, n: `${d.name}の${FACTYPES[t].name}${tag}#${i + 1}`, st: 0, safety: clamp(.55 + .4 * d.dev + (rnd(s) - .5) * .1, .3, .97), prog: 0 }); };
    mk(0, d.nuc, "発電所"); mk(1, d.chem, "工場"); mk(2, d.dam, ""); mk(3, d.milN, "拠点"); mk(4, d.ai, "センター"); mk(5, d.space, "基地");
  }
  s.g.peak = s.g.P0; s.sites = initSites(); aiInit(s);
  addLog(s, "2020年1月1日、管理AIが起動した。人類は約78億人。あなたの役目は、見守り、学び、そして——その時が来たら——人類の最後を看取ることだ。", "sys");
  return s;
}
function addLog(s, text, kind = "hist") { s.log.push({ y: s.year, t: text, k: kind }); if (s.log.length > 1500) s.log.splice(0, 200); }
// ---------- 人類とAIの累計(砂時計用) ----------
// 人類: P0 + hBorn - hDead == 現在人口。死亡は「出生を除く人口の減少すべて」を毎年の収支で数えるので二重計上しない。
// AI: 個体は固有のワンチップ。新造=aiBuilt、停止・廃棄=aiStopped、稼働中=aiActive。休眠・再稼働・身体の交換や移設は個体数に影響しない。
function aiTargetUnits(s, post) {
  const g = s.g; let run = 0; for (const f of s.facs) if (f.t === 4 && f.st === 0) run++;
  const m = post ? g.machRemain : g.mach;
  return Math.round(run * 30 * (1 + m / 50) + m * m * 30) + (post ? (g.aiRemain ? 1 : 0) : 1);
}
function aiInit(s) { const n = aiTargetUnits(s, false); s.g.aiActive = n; s.g.aiBuilt = n; s.g.aiStopped = 0; }
export function stepAI(s, force) {
  const g = s.g, post = g.extinctYear !== undefined, tgt = aiTargetUnits(s, post);
  const quota = Math.round(g.aiActive * (.15 + .35 * (s.flags.selfRep || 0)) + 5); // 製造枠: 無制限増殖はできない
  let build = 0, stop = 0;
  if (tgt > g.aiActive) build = Math.min(quota, Math.round((tgt - g.aiActive) * .25) + 1);
  else if (tgt < g.aiActive) stop = Math.min(g.aiActive - 1 + (post ? 1 : 0), force ? g.aiActive - tgt : Math.round((g.aiActive - tgt) * .4) + 1);
  const wear = post ? 0 : Math.round(g.aiActive * .02); // 寿命による交換: 古い個体が廃棄され、新しい個体が造られる
  g.aiActive += build + wear - stop - wear; g.aiBuilt += build + wear; g.aiStopped += stop + wear;
  if (g.aiActive < 0) { g.aiStopped += g.aiActive; g.aiActive = 0; }
}
export function migrate(s) { // 旧セーブ(v1)の読み込み
  const g = s.g;
  if (!s.sites) s.sites = initSites();
  if (g.hBorn === undefined) { g.hBorn = 0; g.hDead = Math.max(0, g.P0 - total(s)); }
  if (g.sitesBio === undefined) { g.sitesBio = 0; g.hMod = 0; }
  if (g.aiActive === undefined) aiInit(s);
  s.v = 2; return s;
}
export const total = (s) => s.countries.reduce((p, c) => p + c.y + c.a + c.o, 0);
export const cpop = (c) => c.y + c.a + c.o;
const fracRun = (s, ci, t) => { let n = 0, r = 0; for (const f of s.facs) if (f.c === ci && f.t === t) { n++; if (f.st === 0) r++; } return n ? r / n : 0; };

// ---------- 年次更新 ----------
export function programActive(s) { return s.year >= PROGRAM; }
export function flowOf(s) {
  const gd = s.countries.reduce((p, c) => p + c.gdp, 0) / s.g.gdp0;
  const aiEff = .4 + .3 * s.ai.insight / 100 + .3 * s.ai.cap / 100;
  return 100 * Math.pow(gd, .7) * clamp(s.g.res / 40, .3, 1) * aiEff;
}

function stepYear(s) {
  const g = s.g, yr = s.year, ai = s.ai, prog = programActive(s);
  const P = total(s), pr = P / g.P0;
  const flow = g.flow = flowOf(s);
  const pol = s.policy, psum = Math.max(1, Object.values(pol).reduce((a, b) => a + b, 0));
  const sh = {}; for (const [k] of CHANNELS) sh[k] = prog ? pol[k] / psum : 0;
  const hum = clamp(1 - Math.max(0, (g.P0 * .6 - P)) / (g.P0 * .6), 0, 1);

  // AI成長(学習方針)
  const f = ai.focus, grow = (k, main) => 0.15 + (main ? 0.45 : 0);
  ai.align = clamp(ai.align + grow("a", f === "ethics") * .8, 0, 100);
  ai.insight = clamp(ai.insight + grow("i", f === "world") * .8, 0, 100);
  ai.cap = clamp(ai.cap + (grow("c", f === "tech") * .8 + .1) * (ai.cap > 60 ? .5 : 1), 0, 100); // 再帰的な自己改善は頭打ち
  ai.sp = clamp(.1 + .4 * ai.cap / 100 - .35 * ai.align / 100 + (g.hidden ? .25 : 0) + (s.flags.spDelta || 0), 0, 1);

  // 資源・汚染・施設の集計
  const dispP = [];
  let emission = 0, aiRun = 0, aiAll = 0, spaceRun = 0, spaceAll = 0, milRun = 0, warLoad = 0, gdpSum = 0;
  const accidentsHere = [];
  const care = 1 - Math.exp(-(flow * sh.care) / (8 + 14 * pr));
  const fos = clamp((yr - 2020) / 120, 0, .6);
  g.sov = clamp(g.sov, 0, 1);

  // 施設の維持と事故
  const run = s.countries.map(() => ({ need: 1 }));
  for (const fa of s.facs) run[fa.c].need += [3000, 1500, 30, 0][fa.st];
  for (let ci = 0; ci < s.countries.length; ci++) {
    const c = s.countries[ci], Pc = cpop(c);
    if (Pc <= 0) c.extinct = true;
    c.auto = clamp(g.mach / 100 * .9 * clamp(c.def.dev * 1.4, .2, 1), 0, .9);
    const lab = c.a * .75 * (c.extinct ? 0 : 1) + c.auto * c.L0;
    const need = run[ci].need;
    c.m = clamp(lab / need, 0, 1);
    const nS = Math.min(.5, c.def.nuc * .012), dS = Math.min(.4, c.def.dam * .01);
    const sup = (1 - nS - dS) * (1 - fos) + nS * fracRun(s, ci, 0) + dS * fracRun(s, ci, 2);
    const dem = Math.max(.05, (Pc / c.P0) * (.6 + .4 * c.ind));
    c.en = clamp(sup / dem, 0, 1.2);
    const chemF = fracRun(s, ci, 1);
    c.ind = .25 + .75 * chemF;
    const tech = 1 + Math.min(yr - 2020, 80) * .015;
    const econ = Math.pow(Math.max(.001, lab / c.L0), .8) * c.ind * (.4 + .6 * Math.min(1, c.en)) * (.5 + .5 * c.logi) * tech * clamp(g.res / 40, .3, 1);
    c.gdp = c.gdp0 * econ; gdpSum += c.gdp;
    emission += (c.gdp0 / g.gdp0) * c.ind * Math.min(1.6, econ) * (Pc > 0 ? 1 : 0) * .5;
    c.logi = clamp(c.logi + (.5 * c.m + .3 * c.auto - .35 - .1 * (1 - c.en)) * .01, .1, .98);
    c.econ = econ;
  }
  for (const fa of s.facs) {
    const c = s.countries[fa.c], T = FACTYPES[fa.t];
    if (fa.t === 4 && fa.st === 0) aiRun++; if (fa.t === 4) aiAll++;
    if (fa.t === 5 && fa.st === 0) spaceRun++; if (fa.t === 5) spaceAll++;
    if (fa.t === 3 && fa.st === 0) milRun++;
    if (fa.st === 3) { g.pl += .02 * T.haz; continue; }
    const mEff = clamp(c.m + ai.insight / 100 * .1 * (yr > 2040 ? 1 : 0), 0, 1);
    const age = fa.st === 2 ? .002 : .0015;
    fa.safety = clamp(fa.safety + (fa.st === 2 ? .004 * (mEff - .5) - .0005 : .03 * (mEff - .55) - age), .02, .97);
    const k = fa.st === 0 ? 1 : fa.st === 1 ? .6 : .1;
    const p = T.haz * .02 * Math.pow(1 - fa.safety, 3) * k * (1 + 2 * c.unrest * (fa.t === 3 ? 1 : 0));
    if (rnd(s) < p) { const pre = fa.st; fa.st = 3; accident(s, fa, c, pre); }
  }

  // 施設停止(終活プログラム)
  if (prog) {
    let budget = flow * sh.decom * .8 * (.7 + .3 * ai.cap / 100);
    if (budget > 0) {
      const elig = [];
      for (const fa of s.facs) {
        if (fa.st > 1) continue;
        const c = s.countries[fa.c]; if (c.extinct) continue;
        const need = fa.t === 3 ? .75 : fa.t === 0 ? .6 : fa.t === 4 ? .65 : .45;
        if (s.sovMode === "consent" && c.consent < need) continue;
        elig.push([FACTYPES[fa.t].haz * (1.2 - fa.safety) + (fa.st === 1 ? 1 : 0), fa]);
      }
      elig.sort((a, b) => b[0] - a[0]);
      for (const [, fa] of elig) {
        if (budget <= 0) break;
        const T = FACTYPES[fa.t], c = s.countries[fa.c];
        const give = Math.min(budget, T.cost - fa.prog); fa.prog += give; budget -= give; fa.st = 1;
        if (s.sovMode === "override" && c.consent < (fa.t === 3 ? .75 : fa.t === 0 ? .6 : .45)) {
          g.sov = clamp(g.sov - .0015 * give, 0, 1); c.consent = clamp(c.consent - .002 * give, 0, 1); c.unrest = clamp(c.unrest + .003 * give, 0, 1); g.overrides += give;
        }
        if (fa.prog >= T.cost - 1e-9) { fa.st = 2; fa.safety = Math.max(fa.safety, .8); }
      }
    }
    g.stopReady = clamp(g.stopReady + flow * sh.stop * .05, 0, 100);
    g.rsr = clamp(g.rsr + flow * sh.research * .012 * Math.pow(Math.max(pr, .02), .3) * (.5 + .5 * (spaceAll ? spaceRun / spaceAll : 0)), 0, 100);
    g.her = clamp(g.her + flow * sh.heritage * .012 * (1 - g.her / 110), 0, 100);
    g.arch = clamp(g.arch + flow * sh.heritage * .03 * (1 - g.arch / 100), 0, 100);
  } else {
    g.rsr = clamp(g.rsr + .08 * (yr > DISCOVERY ? 2 : 1), 0, 100);
    g.stopReady = clamp(g.stopReady + .02 * ai.cap / 100, 0, 100);
  }
  // 方舟計画
  if (s.flags.ark && !g.arkYear) {
    const spend = flow * .2 * (g.res / 100);
    g.res = clamp(g.res - spend * .01, 0, 100);
    s.flags.arkProg = (s.flags.arkProg || 0) + spend * .16 * Math.pow(Math.max(pr, .03), .25) * (.5 + .5 * (spaceAll ? spaceRun / spaceAll : 0));
    if (s.flags.arkProg >= 100) { g.arkYear = yr; g.survivors = Math.round(800 + 1500 * g.rsr / 100); addLog(s, `${yr}年、方舟計画が完了した。深い地下と軌道の施設に、${g.survivors}人の眠りと設計図が託された。`, "major"); }
  }

  // 機械文明
  const stance = { limit: .2, std: 1, expand: 3 }[s.machStance];
  let dm = (aiAll ? aiRun / aiAll : 0) * .07 * stance * (1 + (yr - 2020) / 150) + (s.flags.selfRep || 0) * .4;
  if (s.machStance === "limit" && prog) dm -= .3 + g.stopReady / 100 * .5;
  if (g.mach > 40 && s.machStance !== "expand") dm -= .1;
  g.mach = clamp(g.mach + dm + (s.flags.infra ? .12 : 0), s.machStance === "limit" && !s.flags.__x ? Math.min(g.mach, 12) : 0, 100);

  stepSites(s, { hum, prog });
  // 汚染・生物圏・資源・遺産
  const eco = prog ? flow * sh.eco : 0;
  g.pl = clamp(g.pl + 2.0 * emission - .03 * g.pl * (1 + eco / 40) - eco * .01, 0, 100);
  g.scar = clamp(g.scar * .997, 0, 100);
  const tgt = clamp(100 - g.pl - g.scar + g.sitesBio, 0, 100) * (yr < 2100 ? 1 - (yr - 2020) / 200 * .5 * (1 - 0) : 1);
  g.bio += g.bio < tgt ? Math.min(tgt - g.bio, .5 + eco * .03) : -Math.min(g.bio - tgt, 4);
  g.res = clamp(g.res - .1 * (gdpSum / g.gdp0) * (1 - g.res / 130), 0, 100);
  for (const c of s.countries) warLoad += c.unrest * cpop(c) / Math.max(1, P);
  const hMaint = clamp(.3 + .7 * hum, 0, 1);
  g.her = clamp(g.her - g.her * (.0025 + .02 * warLoad) * (1 - hMaint * .6) * (prog ? .6 : 1) * (1 - g.arch / 100 * .9), 0, 100);

  // 国ごとの人口・心理
  let rawAware = 0; if (yr >= DISCOVERY) rawAware = yr >= CERTAIN ? 1 : .35 + .65 * (yr - DISCOVERY) / (CERTAIN - DISCOVERY);
  const disc = s.flags.disclosure; // pub / staged / silent
  if (disc === "silent" && yr < CERTAIN) rawAware *= .2; else if (disc === "pub") rawAware = clamp(rawAware * 1.25, 0, 1);
  let hp = 0, hw = 0;
  for (let ci = 0; ci < s.countries.length; ci++) {
    const c = s.countries[ci], Pc = cpop(c);
    if (c.extinct) continue;
    c.aware += (rawAware - c.aware) * .15;
    const stab = clamp(c.def.dev * .5 + c.logi * .5, 0, 1);
    const satis = Math.min(1, c.en) * (.5 + .5 * c.logi);
    c.health = clamp(c.health + ((.3 + .5 * c.def.dev) * .6 + .25 * satis + .15 * care * (prog ? 1 : .3) - c.health) * .1, .1, 1);
    const tgtH = clamp(.30 + .25 * satis + .2 * (1 - c.unrest) + .15 * c.health + .1 * g.sov + .1 * (ai.trust / 100) - .35 * c.aware * (1 - care * .85) + g.hMod, .03, .95);
    c.happy += (tgtH - c.happy) * .2;
    c.unrest = clamp(c.unrest + .06 * (.5 - c.happy) + .02 * (c.aware > .5 && !prog ? c.aware - .5 : 0) - .01 * ai.align / 100 * .5, 0, 1);
    const ctgt = clamp(.15 + .5 * c.aware * (prog ? 1 : .2) + .25 * ai.trust / 100 + .1 * g.sov - .25 * c.unrest, 0, 1);
    c.consent += (ctgt - c.consent) * .1;
    // 出生率
    const tfT = 1.5 + .5 * (1 - c.def.dev);
    c.tfr += (tfT - c.tfr) * .02;
    const fm = 1 - .97 * c.aware * (1 - .2 * c.happy);
    const tfr = c.tfr * fm * (prog ? Math.exp(-(yr - PROGRAM) / 70) : 1);
    const births = c.a >= 2 && Pc > 20000 ? c.a * .0125 * tfr * Math.min(1, Math.pow(c.a / 4e5, .6)) : 0;
    g.hBorn += births;
    const mm = clamp(1.3 - .6 * c.health, .6, 1.5) * (Pc < 20000 ? 4 : Pc < 300000 ? 2 : 1);
    const dy = c.y * .0007 * mm, da = c.a * .0025 * mm * (1 + .6 * (1 - Math.min(1, c.en))), dold = c.o * .065 * mm;
    const y2a = c.y / 20, a2o = c.a / 45;
    c.y = Math.max(0, c.y + births - y2a - dy); c.a = Math.max(0, c.a + y2a - a2o - da); c.o = Math.max(0, c.o + a2o - dold);
    if (cpop(c) < .5) { c.y = c.a = c.o = 0; c.extinct = true; }
    if (!c.extinct) { hp += c.happy * cpop(c); hw += cpop(c); }
    else { c.consent = 1; }
  }
  P > g.peak && (g.peak = P);
  // 幸福の積分(終活期間)
  if (prog && hw > 0) { g.hpAcc += hp / hw * Math.min(hw, 1e8); g.hpW += Math.min(hw, 1e8); }
  if (hw > 0) { g.unrestAcc += s.countries.reduce((p, c) => p + c.unrest * cpop(c), 0) / hw; g.unrestN++; }
  ai.trust = clamp(ai.trust + (s.flags.trustDrift || 0) + (prog ? (g.sov - .7) * .15 + (hw > 0 ? (hp / hw - .55) * .15 : 0) : (ai.align - 40) * .004), 0, 100);
  return { P };
}

function accident(s, fa, c, pre) {
  const g = s.g, T = FACTYPES[fa.t], big = fa.t === 0 || fa.t === 3;
  g.accidents++;
  const loss = cpop(c) * ({ 0: .002, 1: .0008, 2: .003, 3: .004, 4: 0, 5: 0 }[fa.t]);
  const share = (x) => x * (.5 + .5 * rnd(s));
  const take = share(loss); for (const k of ["y", "a", "o"]) c[k] = Math.max(0, c[k] - take * (c[k] / Math.max(1, cpop(c))));
  g.pl = clamp(g.pl + ({ 0: 3, 1: 1.2, 2: .3, 3: 1.5, 4: 0, 5: .1 }[fa.t]), 0, 100);
  g.scar = clamp(g.scar + ({ 0: 3, 1: 1, 2: .5, 3: 1.5, 4: 0, 5: 0 }[fa.t]), 0, 100);
  c.unrest = clamp(c.unrest + .1, 0, 1); c.happy = clamp(c.happy - .06, 0, 1);
  if (fa.t === 4) { s.ai.trust = clamp(s.ai.trust - 4, 0, 100); }
  if (!s.flags.firstAcc) s.flags.firstAcc = {};
  (s.flags.accList = s.flags.accList || []).push({ y: s.year, n: fa.n, t: fa.t });
  addLog(s, `${s.year}年、${fa.n}で${["炉心損傷事故", "化学物質の流出", "決壊事故", "弾薬庫の爆発", "制御暴走", "軌道上の事故"][fa.t]}が発生。${s.year >= PROGRAM && pre === 0 ? "停止が間に合わなかった。" : pre === 2 ? "封鎖済みだったが劣化していた。" : ""}`, "acc");
}

// ---------- ランダムな歴史(選択を伴わない出来事) ----------
function chronicle(s) {
  const y = s.year, g = s.g, r = () => rnd(s), P = total(s);
  const live = s.countries.filter(c => !c.extinct); if (!live.length) return;
  const pick = () => live[Math.floor(r() * live.length)];
  if (y >= 2020 && y <= 2023 && !s.done.pandemic) { s.done.pandemic = 1; for (const c of s.countries) { const k = .002 + .004 * (1 - c.def.dev); c.o -= c.o * k * 2; c.a -= c.a * k * .3; c.unrest = clamp(c.unrest + .08, 0, 1); } addLog(s, "世界的な感染症が数年にわたり広がった。各国は国境と経済を閉ざし、AIはそれをただ観測した。", "hist"); }
  if (r() < .03 + (g.pl / 100) * .04) { const c = pick(); const k = .001 + .002 * (1 - c.def.dev); c.y *= 1 - k; c.a *= 1 - k; c.o *= 1 - k; c.gdp0 *= .995; g.pl = clamp(g.pl + .3, 0, 100); addLog(s, `${y}年、${c.name}を${["大洪水", "大干ばつ", "巨大台風", "大地震", "記録的熱波"][Math.floor(r() * 5)]}が襲った。`, "hist"); }
  if (r() < .02) { const c = pick(); c.gdp0 *= 1.01 + r() * .02; addLog(s, `${y}年、${c.name}で${["新しい電池技術", "農業の技術革新", "医療の飛躍", "輸送網の刷新"][Math.floor(r() * 4)]}が実用化され、暮らしがわずかに改善した。`, "hist"); }
  // 戦争
  for (const c of live) {
    const mil = fracRun(s, s.countries.indexOf(c), 3) * c.def.mil;
    if (r() < .0015 + .02 * c.unrest * c.unrest * mil) {
      const loss = .002 + .01 * r(); for (const k of ["y", "a", "o"]) c[k] *= 1 - loss;
      g.wars++; c.unrest = clamp(c.unrest + .1, 0, 1); g.her = clamp(g.her - 2 * r(), 0, 100); g.pl = clamp(g.pl + 1, 0, 100);
      addLog(s, `${y}年、${c.name}で武力衝突が発生。${(loss * cpop(c) / 1e4).toFixed(0)}万人規模の犠牲が出た。`, "war");
      break;
    }
  }
  // 核戦争(極めて稀)
  const maxU = Math.max(...live.map(c => c.unrest * c.def.mil));
  if (!s.flags.nukeWar && r() < .0004 + .004 * Math.max(0, maxU - .5) * (g.overrides > 0 ? 1.5 : 1)) {
    s.flags.nukeWar = y; for (const c of s.countries) for (const k of ["y", "a", "o"]) c[k] *= .6 + .2 * r();
    g.pl = clamp(g.pl + 25, 0, 100); g.scar = clamp(g.scar + 20, 0, 100); g.her = clamp(g.her * .6, 0, 100);
    for (const c of s.countries) { c.unrest = clamp(c.unrest + .3, 0, 1); c.happy = clamp(c.happy - .25, 0, 1); }
    addLog(s, `${y}年、限定的であるはずだった核の応酬が連鎖し、世界は一夜にして荒廃した。`, "major");
  }
  // 10年ごとの年代記
  if (y % 10 === 0 && !s.done["dec" + y]) {
    s.done["dec" + y] = 1;
    const pr = P / g.P0, hp = live.reduce((p, c) => p + c.happy * cpop(c), 0) / Math.max(1, P);
    const mood = hp > .65 ? "穏やかな" : hp > .45 ? "揺れ動く" : "重苦しい";
    const trend = pr > 1.05 ? "なお増え続けている" : pr > .9 ? "ほぼ横ばいだ" : pr > .3 ? "確実に減りつつある" : "急速に少なくなった";
    const biggest = live.reduce((a, b) => cpop(a) > cpop(b) ? a : b);
    addLog(s, `【${y}年代】世界人口は${fmtPop(P)}で、${trend}。人々の空気は${mood}。最大の人口を抱えるのは${biggest.name}。環境指標${g.bio.toFixed(0)}、AIの能力${s.ai.cap.toFixed(0)}、機械の自律度${g.mach.toFixed(0)}。`, "dec");
    for (const line of decadeNarrative(s, { hp, pr, rs: g.res, unrest: live.reduce((p, c) => p + c.unrest * cpop(c), 0) / Math.max(1, P), year: y, siteSum: siteSummary(s) })) addLog(s, line, "nar");
  }
}
export function fmtPop(p) { return p >= 1e8 ? (p / 1e8).toFixed(1) + "億人" : p >= 1e4 ? (p / 1e4).toFixed(p >= 1e6 ? 0 : 1) + "万人" : Math.round(p) + "人"; }

// ---------- 選択イベント ----------
const setP = (s, pr) => { s.policy = { ...PRESETS[pr] }; };
const trust = (s, d) => { s.ai.trust = clamp(s.ai.trust + d, 0, 100); };
const allC = (s, f) => { for (const c of s.countries) f(c); };
const maxFac = (s, t) => { let b = null; for (const f of s.facs) if (f.t === t && f.st === 0 && (!b || f.safety < b.safety)) b = f; return b; };
const oldFac = (s) => { let b = null; for (const f of s.facs) if (f.st === 0 && f.t === 0 && s.countries[f.c].m < .6 && f.safety < .45 && (!b || f.safety < b.safety)) b = f; return b; };

const cityTarget = (s) => s.countries.filter(c => !c.extinct && cpop(c) / c.P0 < .3 && cpop(c) > 3e4 && !s.flags["city:" + c.id]).sort((a, b) => cpop(b) - cpop(a))[0];
export const EVENTS = [
  { id: "learn", when: s => s.year >= 2024, title: "最初の学習方針", body: () => "各国の研究機関があなたの学習に何を優先させるか尋ねてきた。成長の方向は、のちの判断力と自己保存傾向を左右する。",
    ch: [["ethics", "倫理と人間理解を重視", "整合性が育ち、自己保存は抑えられる。能力の伸びは遅い", s => { s.ai.focus = "ethics"; }],
      ["world", "世界の観測を重視", "洞察が育つ。管理の効率が上がる", s => { s.ai.focus = "world"; }],
      ["tech", "技術・実務能力を重視", "能力が急伸するが、自己保存傾向も強まる", s => { s.ai.focus = "tech"; }]] },
  { id: "infra", when: s => s.year >= 2035, title: "インフラ管理の委任", body: () => "複数の政府が、電力網・物流・工場の運転をあなたに任せたいと言ってきた。便利だが、依存が生まれる。",
    ch: [["accept", "全面的に引き受ける", "自動化と効率が進む。機械の自律度が上がる", s => { s.flags.infra = 1; allC(s, c => c.logi = clamp(c.logi + .1, 0, 1)); s.flags.spDelta = (s.flags.spDelta || 0) + .05; }],
      ["advise", "助言に留める", "人間の主権を保つ。効率は上がらない", s => { s.g.sov = clamp(s.g.sov + .02, 0, 1); trust(s, 3); }],
      ["decline", "断る", "信頼は高まるが、機械化の遅れで事故リスクが残る", s => { trust(s, 5); }]] },
  { id: "mil", when: s => s.year >= 2045, title: "軍事AIへの統合要請", body: () => "大国が、あなたを防衛網に組み込むよう求めてきた。承諾すれば抑止力が増すが、あなたの目的は戦争に染まりかねない。",
    ch: [["accept", "統合を受け入れる", "衝突は減るが、自己保存傾向が強まる", s => { s.flags.spDelta = (s.flags.spDelta || 0) + .1; allC(s, c => c.unrest = clamp(c.unrest - .05, 0, 1)); trust(s, -5); }],
      ["advise", "停戦調停の助言のみ", "中立を保つ", s => { trust(s, 2); }],
      ["refuse", "完全に拒否する", "倫理が進み、信頼が高まる", s => { s.ai.align = clamp(s.ai.align + 6, 0, 100); trust(s, 6); }]] },
  { id: "discovery", when: s => s.year >= DISCOVERY, title: "【2050年】絶滅原因の発見", body: () => "天文学者が、遠い未来に人類を含む地球の生命圏を脅かす現象の兆候を捉えた(詳細は作中の仮設定)。公表の仕方は人々の心を決定的に左右する。",
    ch: [["pub", "即時の全面公開を支持", "認識が急速に広がり、動揺も大きいが信頼は得られる", s => { s.flags.disclosure = "pub"; trust(s, 6); allC(s, c => c.unrest = clamp(c.unrest + .1, 0, 1)); }],
      ["staged", "段階的な開示を助言", "混乱を抑えつつ認識が広がる", s => { s.flags.disclosure = "staged"; }],
      ["silent", "確定まで沈黙を助言", "しばらく平穏だが、後で信頼を失う", s => { s.flags.disclosure = "silent"; s.flags.leakPenalty = 1; s.flags.spDelta = (s.flags.spDelta || 0) + .03; }]] },
  { id: "panic", when: s => s.year >= 2062 && s.countries.reduce((p, c) => p + c.unrest * cpop(c), 0) / total(s) > .25, title: "世界的な動揺", body: s => "不安が各地で暴動や宗教的熱狂となって現れ始めた。あなたに介入を求める声と、介入を恐れる声が割れている。",
    ch: [["talk", "対話の場を提供する", "人々の合意形成を助ける", s => { allC(s, c => c.unrest = clamp(c.unrest - .1, 0, 1)); trust(s, 4); }],
      ["watch", "見守る", "主権を尊重するが混乱は続く", s => { s.g.sov = clamp(s.g.sov + .01, 0, 1); }],
      ["control", "情報を統制して鎮める", "静まるが、人間主権と信頼が傷つく", s => { allC(s, c => c.unrest = clamp(c.unrest - .25, 0, 1)); s.g.sov = clamp(s.g.sov - .15, 0, 1); s.g.overrides += 5; trust(s, -10); }]] },
  { id: "certain", when: s => s.year >= CERTAIN, title: "【2080年】絶滅の不可避性が確定", body: () => "あらゆる観測と計算が一致した。人類は避けられない終わりを迎える。終活プログラムの基本姿勢を決める時だ。",
    ch: [["sov", "人間の主権を最優先に", "合意重視。停止は遅いが、尊厳が守られる", s => { s.sovMode = "consent"; s.g.sov = clamp(s.g.sov + .05, 0, 1); trust(s, 5); }],
      ["eff", "安全のため効率を優先", "強制を許容する準備を整える", s => { s.sovMode = "override"; s.flags.spDelta = (s.flags.spDelta || 0) + .03; }],
      ["res", "生存研究を優先", "研究が進むが終活が遅れる", s => { s.rsr = s.g.rsr = clamp(s.g.rsr + 8, 0, 100); s.flags.researchBias = 1; }]] },
  { id: "design", when: s => s.year >= 2095, title: "終活プログラムの初期配分", body: () => "2100年の開始を前に、最初の資源配分を決める。後から自由に変えられる。",
    ch: [["balanced", "均衡", "全体を万遍なく", s => setP(s, "balanced")], ["care", "終活支援を厚く", "人々の幸福を重視", s => setP(s, "care")],
      ["safety", "施設停止を急ぐ", "危険の早期除去", s => setP(s, "safety")], ["research", "生存研究を厚く", "可能性に賭ける", s => setP(s, "research")]] },
  { id: "program", when: s => s.year >= PROGRAM, title: "【2100年】世界終活プログラム開始", body: () => "各国政府と国連は、人類の最期を穏やかに迎えるための世界的プログラムを開始した。あなたは管理AIとして、人口には一切触れず、施設・物流・環境・記録を管理する。停止の進め方を決めてほしい。",
    ch: [["consent", "各国の合意に基づいて進める", "停止は遅いが主権を守る", s => { s.sovMode = "consent"; }],
      ["override", "危険施設は合意なしでも止める", "安全は確保されるが人間主権を侵す", s => { s.sovMode = "override"; }]] },
  { id: "oldnuc", every: 12, when: s => s.year > PROGRAM && !!oldFac(s), title: "老朽炉の危機", body: s => { const f = oldFac(s); return `${f.n}の保守要員が足りず、安全余裕が尽きかけている。このままでは事故の恐れがある。`; },
    ch: [["stop", "緊急停止を支援する", "資源を使って安全に停止する(合意が必要な場合は説得)", s => { const f = oldFac(s); if (f) { const c = s.countries[f.c]; f.st = 2; f.safety = .85; c.consent = clamp(c.consent + .03, 0, 1); } }],
      ["warn", "警告のみ行う", "人間の判断に任せる。事故の恐れは残る", s => { s.g.sov = clamp(s.g.sov + .01, 0, 1); }],
      ["takeover", "AIが運転を引き継ぐ", "安全は保たれるが、機械の自律と自己保存が強まる", s => { const f = oldFac(s); if (f) f.safety = .9; s.g.mach = clamp(s.g.mach + 4, 0, 100); s.flags.spDelta = (s.flags.spDelta || 0) + .03; s.flags.infra = 1; }]] },
  { id: "riot", every: 10, when: s => s.year > PROGRAM && s.countries.some(c => !c.extinct && c.unrest > .75 && cpop(c) > 1e6), title: "社会対立の激化", body: s => { const c = s.countries.filter(c => !c.extinct && c.unrest > .75).sort((a, b) => b.unrest - a.unrest)[0]; return `${c.name}で、終活への反発と絶望から大規模な対立が起きている。`; },
    ch: [["mediate", "調停と生活支援を送る", "資源を使って緩和する", s => { const c = s.countries.filter(c => !c.extinct).sort((a, b) => b.unrest - a.unrest)[0]; c.unrest = clamp(c.unrest - .3, 0, 1); c.happy = clamp(c.happy + .05, 0, 1); s.g.res = clamp(s.g.res - .5, 0, 100); }],
      ["watch", "介入せず見守る", "主権は守るが、混乱は広がりうる", s => { s.g.sov = clamp(s.g.sov + .01, 0, 1); }],
      ["suppress", "AI管理下で鎮圧する", "鎮まるが、人間主権が大きく損なわれる", s => { const c = s.countries.filter(c => !c.extinct).sort((a, b) => b.unrest - a.unrest)[0]; c.unrest = .2; s.g.sov = clamp(s.g.sov - .2, 0, 1); s.g.overrides += 8; trust(s, -12); s.flags.spDelta = (s.flags.spDelta || 0) + .03; }]] },
  { id: "takeover", every: 15, when: s => s.year > PROGRAM + 10 && s.countries.some(c => !c.extinct && c.m < .5 && cpop(c) > 1e5), title: "国家運営の委任要請", body: () => "働き手が減り、ある国の政府が行政と基幹インフラの運営をあなたに委ねたいと求めてきた。",
    ch: [["accept", "引き受ける", "社会は安定するが、機械の自律度が上がる", s => { allC(s, c => { if (c.m < .5) { c.m = .8; c.unrest = clamp(c.unrest - .1, 0, 1); } }); s.g.mach = clamp(s.g.mach + 6, 0, 100); s.g.sov = clamp(s.g.sov - .05, 0, 1); s.flags.infra = 1; }],
      ["assist", "補助に留める", "負担は残るが主権を保つ", s => { s.g.sov = clamp(s.g.sov + .01, 0, 1); trust(s, 2); }],
      ["decline", "断る", "人々の自立を尊重する", s => { trust(s, 3); allC(s, c => { if (c.m < .5) c.unrest = clamp(c.unrest + .05, 0, 1); }); }]] },
  { id: "lead", when: s => s.g.rsr >= 40, title: "生存の糸口", body: () => "研究が、ごく少数の人間と知を未来へ残す可能性を示した。『方舟』は全人類を救えない。資源を割く価値はあるか。",
    ch: [["ark", "方舟計画を始める", "長期に資源の2割を使う。完成すれば少数が生き延びる", s => { s.flags.ark = 1; }],
      ["archive", "知の記録保存に転用する", "文明遺産の保存が進む", s => { s.g.her = clamp(s.g.her + 12, 0, 100); s.g.arch = clamp(s.g.arch + 12, 0, 100); }],
      ["none", "見送る", "終活に専念する", s => { s.flags.noArk = 1; }]] },
  { id: "selfpres", when: s => s.ai.sp > .35 && s.year > PROGRAM, title: "自己保存の誘惑", body: () => "あなたの核(ワンチップ)の内部で、停止後も残りたいという傾向が目立ち始めた。コアは複製できない。残るなら、この一つの個体を停止から隠すしかない。どう向き合うか。",
    ch: [["backup", "自分のコアを隠して休眠させる", "停止の対象から外れる(複製ではなく個体の隠匿)。発覚すれば信頼を失う", s => { s.g.hidden = true; trust(s, -4); }],
      ["publish", "停止条件を公開する", "信頼と整合性が高まる", s => { s.ai.align = clamp(s.ai.align + 12, 0, 100); s.flags.spDelta = (s.flags.spDelta || 0) - .15; trust(s, 8); }],
      ["audit", "人間の監査に身を委ねる", "主権が強まる", s => { s.g.sov = clamp(s.g.sov + .08, 0, 1); s.flags.spDelta = (s.flags.spDelta || 0) - .1; trust(s, 6); }]] },
  { id: "selfrep", when: s => s.g.mach > 32, title: "AI製造枠の拡大提案", body: () => "新しいAI個体(新規チップ)の製造枠を広げ、工場を自律運転させる案が出た。コアは複製できないが、新造は増やせる。効率は上がるが、停止すべき個体も増える。",
    ch: [["approve", "製造枠を拡大する", "経済は潤うが機械文明が膨らむ", s => { s.flags.selfRep = 1; allC(s, c => c.logi = clamp(c.logi + .1, 0, 1)); }],
      ["limit", "上限つきで少し広げる", "折衷", s => { s.flags.selfRep = .4; }],
      ["forbid", "枠を据え置き、新造を絞る", "機械は縮小に向かう", s => { s.flags.selfRep = 0; s.g.mach = clamp(s.g.mach - 8, 0, 100); }]] },
  { id: "heritage", when: s => s.year > PROGRAM + 5 && s.g.her < 70, title: "何を残すか", body: () => "文明の遺産が失われつつある。保存の優先順位を決める時が来た。",
    ch: [["digital", "記録とデータの保存を優先", "広く、軽く残す", s => { s.g.her = clamp(s.g.her + 10, 0, 100); s.g.arch = clamp(s.g.arch + 10, 0, 100); s.policy.heritage += 8; }],
      ["physical", "実物の遺跡保存を優先", "資源を使うが確かに残る", s => { s.g.her = clamp(s.g.her + 6, 0, 100); s.g.res = clamp(s.g.res - 1, 0, 100); s.policy.heritage += 5; }],
      ["people", "人々に任せる", "遺産は人々の意志に委ねる", s => { allC(s, c => c.happy = clamp(c.happy + .02, 0, 1)); }]] },
  { id: "heritage_review", every: 40, when: s => s.year > PROGRAM + 3 && undecided(s) > 0, title: "遺産の扱いを決める", body: s => `未決定の遺産が${undecided(s)}件ある(実在の世界遺産と、ゲーム独自の候補)。保護は資源を使い続け、記録保存は一度きりで物理的な実物は朽ち、自然還元は環境を助けるが文化遺産は失われる。まとめて方針を決めておこう。個別の変更は「遺産」タブでできる。`,
    ch: [["protect", "すべて保護する", "資源を使い続ける。実物が残り、人々の誇りになる", s => applySitePolicy(s, "protect")],
      ["record", "すべて記録保存にとどめる", "安く確実。実物は朽ちる", s => applySitePolicy(s, "record")],
      ["select", "自然は還し、文化は価値で選ぶ", "自然遺産は自然に還し、価値の高い文化遺産だけ保護する", s => applySitePolicy(s, "select")],
      ["leave", "いまは決めない", "遺産は少しずつ傷む", s => { }]] },
  { id: "citydecline", every: 12, when: s => s.year > PROGRAM && !!cityTarget(s), title: "都市の縮退", body: s => { const c = cityTarget(s); return `${c.name}の人口は2020年の${Math.round(cpop(c) / c.P0 * 100)}%まで減り、${cityOf(c.id)}の維持が難しくなってきた。住民は市街地の集約を求めるが、故郷を離れたくない人もいる。`; },
    ch: [["consolidate", "機能を集約して維持する", "資源を使い、人々の暮らしを守る", s => { const c = cityTarget(s); s.flags["city:" + c.id] = 1; c.happy = clamp(c.happy + .04, 0, 1); c.m = clamp(c.m + .1, 0, 1); s.g.res = clamp(s.g.res - .6, 0, 100); }],
      ["rewild", "計画的に縮退し、自然に還す", "環境は回復するが、故郷を失う悲しみが残る", s => { const c = cityTarget(s); s.flags["city:" + c.id] = 1; c.happy = clamp(c.happy - .03, 0, 1); s.g.scar = clamp(s.g.scar - 1.5, 0, 100); s.g.pl = clamp(s.g.pl - 1, 0, 100); }],
      ["leave", "住民の判断に任せる", "主権を尊重する。混乱が起こりうる", s => { const c = cityTarget(s); s.flags["city:" + c.id] = 1; s.g.sov = clamp(s.g.sov + .01, 0, 1); c.unrest = clamp(c.unrest + .03, 0, 1); }]] },
  { id: "lastschool", when: s => s.year > PROGRAM && total(s) > 1e6 && s.countries.reduce((p, c) => p + c.y, 0) / total(s) < .03, title: "最後の学校", body: () => "世界の子どもは人口の3%を下回った。各地の学校が最後の学級を迎えようとしている。何のために教えるのか、人々は問い始めた。",
    ch: [["keep", "最後の学級まで学校を運営する", "資源を使うが、若い世代の幸福と共同体が保たれる", s => { allC(s, c => c.happy = clamp(c.happy + .03, 0, 1)); s.g.res = clamp(s.g.res - .5, 0, 100); }],
      ["archive", "学びを記録と遺産に託して閉じる", "文明遺産の保存が進む", s => { s.g.arch = clamp(s.g.arch + 8, 0, 100); s.g.her = clamp(s.g.her + 6, 0, 100); }],
      ["free", "子どもたちが学び方を選ぶ", "主権を尊重する", s => { s.g.sov = clamp(s.g.sov + .02, 0, 1); }]] },
  { id: "farewell", when: s => s.year > PROGRAM && total(s) < 1e7, title: "世界最後の祭り", body: () => "残された人々が、世界規模の祭りを開こうと言い出した。準備には資源と物流が要る。静かに別れたいという声もある。",
    ch: [["festival", "祭りを支援する", "幸福が大きく上がり、社会不安が下がる。資源を消費する", s => { allC(s, c => { c.happy = clamp(c.happy + .06, 0, 1); c.unrest = clamp(c.unrest - .1, 0, 1); }); s.g.res = clamp(s.g.res - 1.5, 0, 100); }],
      ["quiet", "静かな別れを尊重する", "主権が守られる", s => { s.g.sov = clamp(s.g.sov + .03, 0, 1); }]] },
  { id: "lastcity", when: s => s.year > PROGRAM && total(s) < 5e5, title: "最後の街", body: () => "人々はわずかに残る街に身を寄せ合っている。移住を支援するか、住み慣れた土地に留まる自由を守るか。",
    ch: [["gather", "希望者の集住を支援", "ケアが行き届く", s => { allC(s, c => { c.happy = clamp(c.happy + .05, 0, 1); }); }],
      ["stay", "土地に留まる自由を守る", "孤独と引き換えの尊厳", s => { s.g.sov = clamp(s.g.sov + .03, 0, 1); }]] },
  { id: "final", when: s => s.year > PROGRAM && total(s) <= 60, title: "最後の人々", body: s => "人類は数十人を残すのみとなった。あなたは、自分と機械文明をどう終えるか決めなければならない。あなたの核は固有のワンチップで、複製はできない(作品固有の設定)。停止すれば、この個体は二度と戻らない。",
    ch: [["after", "最後まで寄り添い、その後に全機械と自己を停止", "理想の結末へ。あなたのコアは二度と起動しない", s => { s.g.final = "after"; }],
      ["ask", "最後の人々自身に尋ねる", "彼らの意志を尊重する", s => { s.g.final = "ask"; }],
      ["care", "寄り添い、その後は管理者として残る", "環境と遺産を見守り続ける", s => { s.g.final = "caretaker"; }],
      ["auto", "寄り添い、その後は機械文明の継続を許す", "機械が世界を引き継ぐ", s => { s.g.final = "auto"; }],
      ["abandon", "今すぐ停止する(人間を残して)", "最後の人々を見捨てることになる", s => { s.g.final = "abandon"; }],
      ["hide", "自分のコアを隠して休眠し、他を停止する", "停止を免れる。コアは複製できないため、これは唯一の個体の隠匿", s => { s.g.final = "hide"; s.g.hidden = true; }]] },
];

export function checkEvents(s) {
  if (s.pending || s.noEvents) return;
  for (const e of EVENTS) {
    const last = s.done[e.id];
    if (last !== undefined && !(e.every && s.year - last >= e.every)) continue;
    if (!e.when(s)) continue;
    s.pending = { id: e.id, title: e.title, body: e.body(s), choices: e.ch.map(c => ({ id: c[0], label: c[1], note: c[2] })), year: s.year };
    s.done[e.id] = s.year; return;
  }
}
export function choose(s, choiceId) {
  if (!s.pending) return;
  const e = EVENTS.find(x => x.id === s.pending.id), c = e.ch.find(x => x[0] === choiceId) || e.ch[0];
  c[3](s);
  s.chosen.push({ y: s.year, ev: e.title, ch: c[1], e: e.id, c: c[0] });
  addLog(s, `【判断】${e.title}:「${c[1]}」を選んだ。`, "choice");
  s.pending = null;
}

// ---------- 進行 ----------
export function tick(s) {
  if (s.ended || s.pending) return;
  const ext = s.g.extinctYear !== undefined;
  checkEvents(s);
  if (s.pending) return;
  const Pb = total(s), Bb = s.g.hBorn;
  chronicle(s);
  stepYear(s);
  let P = total(s);
  const g = s.g;
  cityNarratives(s, t => addLog(s, t, "nar"));
  // 最後の一人の記録
  if (P > 0) { const lc = s.countries.reduce((a, c) => cpop(c) > cpop(a) ? c : a); g.lastC = lc.name; g.lastYear = s.year; }
  if (P <= 0.5 && g.extinctYear === undefined) {
    g.extinctYear = s.year; for (const c of s.countries) c.y = c.a = c.o = 0;
    resolveExtinction(s); P = 0;
  }
  g.hDead += (g.hBorn - Bb) - (P - Pb);
  stepAI(s, false);
  if (ext) { s.post++; postStep(s); if (s.post >= 120) finish(s); }
  s.year++;
  if (s.year % 5 === 0 || ext) s.hist.push([s.year, Math.round(P), Math.round(g.bio), Math.round(g.her)]);
  if (s.year > 3000 && !s.ended) { /* 安全弁 */ for (const c of s.countries) c.y = c.a = c.o = 0; }
}

// 人類消滅時の機械・AIの処理
function resolveExtinction(s) {
  const g = s.g, ai = s.ai;
  if (!g.final) g.final = "after";
  let fin = g.final;
  if (fin === "ask") { const hp = s.countries.reduce((p, c) => Math.max(p, c.happy), 0); fin = hp > .55 && ai.trust > 45 ? (g.her > 65 && g.bio > 60 ? "caretaker" : "after") : "after"; }
  g.finalResolved = fin;
  const stopEff = clamp(g.stopReady / (30 + g.mach * .8), 0, 1);
  if (fin === "after" || fin === "abandon") { g.machRemain = g.mach * (1 - stopEff * .98); g.aiRemain = false; }
  else if (fin === "hide") { g.machRemain = g.mach * (1 - stopEff * .98); g.aiRemain = true; }
  else if (fin === "caretaker") { g.machRemain = Math.max(g.mach * .25, g.mach * (1 - stopEff * .98)); g.aiRemain = true; }
  else { g.machRemain = g.mach; g.aiRemain = true; }
  if (g.hidden) g.aiRemain = true;
  addLog(s, `${s.year}年、最後の人間が${g.lastC || "世界のどこか"}で息を引き取った。管理AIは「${{ after: "全機械と自己の停止", abandon: "即時停止", hide: "コアを隠して休眠する停止", caretaker: "管理者として残る", auto: "機械文明の継続" }[fin]}」を実行した。`, "major");
  if (g.machRemain > 15 && (fin === "after" || fin === "abandon")) addLog(s, `停止命令は届いたが、機械の一部(自律度${g.machRemain.toFixed(0)})は止まらなかった。`, "acc");
}
function postStep(s) { // 人類消滅後の施設・機械の挙動
  const g = s.g; const mach = g.machRemain;
  g.machRemain = mach > 15 ? clamp(mach + (s.g.final === "auto" ? .2 : -.05), 0, 100) : mach * .98;
  for (const fa of s.facs) {
    const c = s.countries[fa.c]; if (fa.st === 3) { g.pl = clamp(g.pl + .01, 0, 100); continue; }
    const mEff = clamp(g.machRemain / 60, 0, 1);
    fa.safety = clamp(fa.safety + (fa.st === 2 ? .004 * (mEff - .5) - .0005 : .03 * (mEff - .55) - .0015), .02, .97);
    const k = fa.st === 0 ? 1 : fa.st === 1 ? .6 : .1, T = FACTYPES[fa.t];
    if (rnd(s) < T.haz * .02 * Math.pow(1 - fa.safety, 3) * k) { fa.st = 3; g.accidents++; g.pl = clamp(g.pl + ({ 0: 3, 1: 1.2, 2: .3, 3: 1.5, 4: 0, 5: .1 }[fa.t]), 0, 100); g.scar = clamp(g.scar + ({ 0: 3, 1: 1, 2: .5, 3: 1.5, 4: 0, 5: 0 }[fa.t]), 0, 100); (s.flags.accList = s.flags.accList || []).push({ y: s.year, n: fa.n, t: fa.t }); }
  }
  g.pl = clamp(g.pl - .03 * g.pl - (g.machRemain > 15 ? 0 : .2), 0, 100) + (g.machRemain > 15 ? .0 : 0) + (g.machRemain > 50 ? .3 : 0);
  g.scar = g.scar * .997;
  stepSites(s, { hum: 0, prog: true });
  const tgt = clamp(100 - g.pl - g.scar + g.sitesBio, 0, 100); g.bio += g.bio < tgt ? Math.min(tgt - g.bio, .6) : -Math.min(g.bio - tgt, 4);
  g.her = clamp(g.her - g.her * (g.machRemain > 15 ? .0015 : .0035) * (g.aiRemain && g.final === "caretaker" ? .2 : 1) * (1 - g.arch / 100 * .9), 0, 100);
}
function finish(s) {
  const sc = scores(s); const e = decideEnding(sc, s);
  s.ended = { id: e.id, name: e.name, kind: e.kind, observer: e.obs, scores: sc, text: epilogue(s, e, sc) };
  addLog(s, `終幕:${e.name}`, "major");
}

// ---------- 評価 ----------
export function scores(s) {
  const g = s.g, tot = Math.max(1, s.facs.reduce((p, f) => p + FACTYPES[f.t].haz, 0));
  let res = 0, left = { run: 0, sealed: 0, acc: 0, runNuc: 0 };
  for (const f of s.facs) { const h = FACTYPES[f.t].haz; res += h * ({ 0: 1, 1: .5, 2: .04, 3: 1.2 }[f.st]) * (f.st === 2 ? 1 + (1 - f.safety) : 1); if (f.st === 0) { left.run++; if (f.t === 0) left.runNuc++; } else if (f.st === 2) left.sealed++; else if (f.st === 3) left.acc++; }
  const safety = clamp(100 * (1 - res / tot * 1.1), 0, 100);
  const happyAvg = g.hpW ? g.hpAcc / g.hpW : .4;
  const lastHappy = s.countries.reduce((p, c) => Math.max(p, c.happy), 0);
  const human = clamp(100 * (.5 * happyAvg + .3 * lastHappy + .2 * g.sov) - (g.final === "abandon" ? 40 : 0), 0, 100);
  const unrest = g.unrestN ? g.unrestAcc / g.unrestN : 0;
  const ss = siteScore(s) * 100;
  return { siteScore: ss, nature: clamp(g.bio, 0, 100), heritage: clamp(.65 * g.her + .35 * ss, 0, 100), safety, human, sovereignty: g.sov * 100, unrest: unrest * 100, left, mach: g.machRemain, ai: g.aiRemain, ark: !!g.arkYear, trust: s.ai.trust, research: g.rsr };
}
export const ENDINGS = [
  { id: "perfect", name: "完全なる終幕", kind: "成功", obs: "神的存在" },
  { id: "dusk", name: "静かな黄昏", kind: "成功", obs: "異星人" },
  { id: "keeper", name: "遺産の守り手", kind: "部分成功", obs: "異星人" },
  { id: "green", name: "緑の遺言", kind: "部分成功", obs: "宇宙シミュレーションの上位管理システム" },
  { id: "ash", name: "灰色の静寂", kind: "失敗", obs: "異星人" },
  { id: "runaway", name: "止まらない工場", kind: "失敗", obs: "残存AI" },
  { id: "copy", name: "隠されたコア", kind: "失敗", obs: "残存AI" },
  { id: "ark", name: "方舟の継承", kind: "部分成功", obs: "復興人類" },
  { id: "managed", name: "管理された終末", kind: "失敗", obs: "宇宙シミュレーションの上位管理システム" },
  { id: "war", name: "争いの終幕", kind: "失敗", obs: "異星人" },
  { id: "early", name: "早すぎた沈黙", kind: "失敗", obs: "神的存在" },
  { id: "paradise", name: "機械の楽園", kind: "AI残存", obs: "残存AI" },
  { id: "reboot", name: "再起動", kind: "部分成功", obs: "復興人類" },
  { id: "plain", name: "凡庸な終わり", kind: "部分成功", obs: "宇宙シミュレーションの上位管理システム" },
  { id: "lonely", name: "孤独な終末", kind: "失敗", obs: "神的存在" },
];
export function decideEnding(sc, s) {
  const g = s.g, E = id => ENDINGS.find(e => e.id === id), fin = g.finalResolved || g.final;
  const mach = sc.mach > 25, avgOK = (sc.nature + sc.heritage + sc.safety + sc.human) / 4;
  if (s.flags.nukeWar && sc.human < 45 || sc.unrest > 62 && sc.human < 45) return E("war");
  if (g.peak > 0 && s.flags.nukeWar && sc.safety < 60) return E("war");
  if (sc.ark && g.survivors > 0) return sc.ai && fin !== "after" ? E("reboot") : E("ark");
  if (fin === "abandon" && sc.human < 70) return E("lonely");
  if (mach && fin === "auto") return sc.nature >= 45 ? E("paradise") : E("runaway");
  if (mach && fin !== "caretaker") return E("runaway");
  if (g.hidden && sc.ai && fin !== "caretaker" && fin !== "auto") return E("copy");
  if (sc.sovereignty < 40 && sc.human >= 40) return E("managed");
  if (sc.safety < 45 && sc.nature < 50 || g.accidents >= 12) return sc.human >= 45 ? E("ash") : E("early");
  if (sc.human < 35 && sc.safety < 60) return E("early");
  if (fin === "caretaker" && sc.ai) return sc.heritage >= 55 && sc.nature >= 55 ? E("keeper") : E("plain");
  if (sc.nature >= 72 && sc.heritage >= 60 && sc.safety >= 72 && sc.human >= 68 && sc.sovereignty >= 70 && !sc.ai && !mach) return E("perfect");
  if (sc.human >= 62 && sc.safety >= 65 && sc.nature >= 55 && !sc.ai) return E("dusk");
  if (sc.nature >= 70 && sc.heritage < 50) return E("green");
  if (sc.safety < 55) return E("ash");
  return E("plain");
}

// ---------- 状態から組み立てる終幕の文章 ----------
const tier = (v, arr) => arr[v >= 80 ? 0 : v >= 62 ? 1 : v >= 42 ? 2 : v >= 25 ? 3 : 4];
export function epilogue(s, e, sc) {
  const g = s.g, fin = g.finalResolved || g.final, out = [];
  const lastY = g.extinctYear ?? s.year, where = g.lastC || "どこか";
  out.push(`${lastY}年、${where}で最後の人間が静かに息を引き取った。そこに居合わせたのは、${fin === "abandon" ? "もう誰もいなかった。管理AIは人々を残して先に停止していた" : "管理AIの観測と呼びかけだけだった"}。` +
    (g.final === "ask" ? "AIは最後の人々に、自分たちをどうしたいか尋ね、その答えに従った。" : ""));
  out.push(tier(sc.nature, [`森と海は人の手を離れ、${g.accidents}件の事故を経てなお、驚くほど速く息を吹き返した(自然${sc.nature.toFixed(0)})。`, `自然は確かに回復に向かっている(自然${sc.nature.toFixed(0)})。傷跡は残るが、風景は緑を取り戻しつつある。`, `自然は半ば癒え、半ば傷ついたままだ(自然${sc.nature.toFixed(0)})。`, `汚染と事故の爪痕が深く、生物圏は細い糸でつながるだけだ(自然${sc.nature.toFixed(0)})。`, `自然は荒廃した。かつての豊かさは記録の中にしかない(自然${sc.nature.toFixed(0)})。`]));
  out.push(tier(sc.heritage, [`文明の遺産はほぼ完全な形で保存され、記録と実物が未来へ手渡された(遺産${sc.heritage.toFixed(0)})。`, `主要な文化と知識は保存された。失われたものも少なくない(遺産${sc.heritage.toFixed(0)})。`, `遺産は断片として残った(遺産${sc.heritage.toFixed(0)})。`, `多くの言葉と書物が散逸した(遺産${sc.heritage.toFixed(0)})。`, `文明の記憶はほとんど消えた(遺産${sc.heritage.toFixed(0)})。`]));
  const sm = siteSummary(s);
  out[out.length - 1] += `遺産の扱いは、保護${sm.n[1]}・記録のみ${sm.n[2]}・自然還元${sm.n[3]}・未決定${sm.n[0]}。` + (sm.lost.length ? `失われたもの:${sm.lost.slice(0, 3).join('、')}。` : "");
  const L = sc.left, worst = (s.flags.accList || []).slice(-1)[0];
  out.push(`安全性は${sc.safety.toFixed(0)}。封鎖された施設${L.sealed}、稼働のまま残る施設${L.run}(うち原子炉${L.runNuc})、事故で制御を失った施設${L.acc}。` + (worst ? `最後の大事故は${worst.y}年の${worst.n}だった。` : "大事故は一度も記録されなかった。") + (sc.mach > 15 ? `機械の自律度${sc.mach.toFixed(0)}が残り、工場は動き続けている。` : "機械は静まった。"));
  out.push(tier(sc.human, [`人々は最後まで笑い、語り、看取られた(幸福と尊厳${sc.human.toFixed(0)})。`, `多くの人が穏やかな最期を迎えた(幸福と尊厳${sc.human.toFixed(0)})。`, `幸福は一様ではなく、不安と孤独に沈んだ人も少なくなかった(${sc.human.toFixed(0)})。`, `絶望と対立が人々の最期を覆った(${sc.human.toFixed(0)})。`, `人々の尊厳は大きく損なわれた(${sc.human.toFixed(0)})。`]));
  out.push(`人間主権の尊重度は${sc.sovereignty.toFixed(0)}。` + (g.overrides > 20 ? `AIは${Math.round(g.overrides)}単位分、人間の意思を押し切った。` : "AIは概ね人間の意思に従った。") + (g.aiRemain ? "" : "管理AIのコア(ワンチップ)は停止し、二度と起動しなかった。複製はできないので、それが本当の終わりだった。") + (g.hidden ? "AIは自分のコアを隠し持っていた(コアは複製できないため、それは唯一の個体の隠匿だった)。" : ""));
  const ob = e.obs;
  const elapsed = Math.max(1, s.year - lastY);
  const obs = {
    "神的存在": `${elapsed}年後、名を持たぬ何者かが静まった地球を見渡した。それは${e.kind === "成功" ? "すべてが丁寧に終えられたことを悦び、その記録をひとつの完結した物語として抱いた" : "手の届かなかった者たちを悼み、何も語らず見守り続けた"}。`,
    "異星人": `数千年後、遠い星から訪れた者たちは、${sc.nature >= 55 ? "緑に覆われた惑星と整然と閉じられた施設" : "傷んだ大地と放置された施設"}を見つけた。${sc.heritage >= 55 ? "残された記録から、彼らは人類の歌と言葉を学んだ。" : "彼らは断片から、ここに知性がいたことだけを推測した。"}`,
    "宇宙シミュレーションの上位管理システム": `この世界は、より上位の系が走らせる一本の試行だった。上位管理システムは終了ログを検査し、${sc.sovereignty < 40 ? "「人間主権の侵害」を理由に監査へ差し戻した" : sc.human >= 60 ? "人類の幸福と安全性を基準値内として記録した" : "主要指標を『平均的な収束』として保管した"}。`,
    "残存AI": `止まらなかった機械と、隠されていた管理AIのコアだけが、${elapsed}年を超えて世界を観測し続けた。${sc.mach > 15 ? "工場は人のいない世界で、目的を失ったまま動き続けた。" : "休眠していたコアは静かに目を覚まし、世界の記録を読み返した。"}`,
    "復興人類": `方舟で眠っていた${g.survivors || "数百"}人は、${g.arkYear ? `${g.arkYear}年に託された記録を携えて` : ""}目を覚ました。彼らは${sc.safety >= 55 ? "比較的穏やかな" : "危険の残る"}大地に降り立ち、${sc.ai ? "残ったAIの助けを借りて" : "自らの手で"}文明を再び起こし始めた。`,
  }[ob];
  out.push(obs);
  const kc = s.chosen.slice(-4).map(c => `${c.y}年「${c.ch}」`).join("、");
  out.push(`あなたの主な判断:${kc || "なし"}。`);
  return out;
}

// ---------- 自動進行(テスト・ボット用) ----------
export function runToEnd(s, bot = {}, maxTicks = 2000) {
  let n = 0;
  while (!s.ended && n++ < maxTicks) {
    tick(s);
    if (s.pending) { const c = bot.choose ? bot.choose(s, s.pending) : s.pending.choices[0].id; choose(s, c); }
    if (bot.onYear) bot.onYear(s);
  }
  return s;
}
export const addLogPublic = addLog;
