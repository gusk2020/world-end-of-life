// 指標・ボトルネック・変更前後の見込み(複製した状態を数年進めるだけ。本体の状態には触れない)
import * as E from "./engine.js";

export const METRICS = [
  ["pop", "人口"], ["happy", "幸福"], ["safety", "安全性"], ["env", "環境"], ["res", "資源"], ["ai", "AI安定性"], ["her", "遺産保護"],
];
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

export function metrics(s) {
  const g = s.g, sc = E.scores(s), P = E.total(s);
  // 現在の運用上の安全性: 稼働・停止中・封鎖・事故の施設を、危険度×安全余裕の不足で重みづけ
  let r = 0, w = 0; for (const f of s.facs) { const h = [1, .5, .6, .8, .2, .15][f.t]; r += h * [1, .6, .1, 2][f.st] * (1 - f.safety); w += h; }
  const safety = clamp(100 * (1 - r / w * 3), 0, 100);
  let hp = 0; for (const c of s.countries) hp += c.happy * E.cpop(c);
  const stopFrac = clamp(g.stopReady / (30 + g.mach * .8), 0, 1);
  return {
    pop: clamp(P / g.P0 * 100, 0, 200), happy: P > 0 ? hp / P * 100 : 0, safety, env: g.bio, res: g.res,
    ai: clamp(100 * (.35 * (1 - s.ai.sp) + .35 * stopFrac + .3 * s.ai.align / 100), 0, 100), her: sc.heritage,
  };
}
export function project(s, years, mutate) {
  const c = structuredClone(s); c.pending = null; c.noEvents = true; if (mutate) mutate(c);
  for (let i = 0; i < years && !c.ended; i++) E.tick(c);
  return c;
}
export function diff(a, b) { const d = {}; for (const [k] of METRICS) d[k] = b[k] - a[k]; return d; }
export function fmtDiff(d, min = .5) {
  const parts = METRICS.filter(([k]) => Math.abs(d[k]) >= min).sort((x, y) => Math.abs(d[y[0]]) - Math.abs(d[x[0]])).slice(0, 4)
    .map(([k, n]) => `${n}${d[k] > 0 ? "+" : "−"}${Math.abs(d[k]).toFixed(Math.abs(d[k]) < 10 ? 1 : 0)}`);
  return parts.length ? parts.join(" ") : "ほぼ変化なし";
}
// 重要イベントの各選択肢の見込み: 即時の変化と、N年後に「選ばなかった場合」との差
export function previewChoices(s, years = 15) {
  const p = s.pending; if (!p) return {};
  const ev = E.EVENTS.find(e => e.id === p.id), now = metrics(s), base = metrics(project(s, years)), out = {};
  for (const ch of ev.ch) {
    const c = project(s, 0); ch[3](c);
    const m0 = metrics(c); const c2 = project(s, years, x => ch[3](x));
    out[ch[0]] = { now: diff(now, m0), later: diff(base, metrics(c2)) };
  }
  return out;
}
// 方針(配分・停止の進め方・機械方針・学習方針)の変更前後の見込み
export function previewPolicy(s, draft, horizons = [10, 40]) {
  const apply = (x) => { x.policy = { ...draft.policy }; x.sovMode = draft.sovMode; x.machStance = draft.machStance; x.ai.focus = draft.focus; };
  const res = { now: metrics(s), rows: [] };
  for (const h of horizons) res.rows.push({ h, cur: metrics(project(s, h)), alt: metrics(project(s, h, apply)) });
  return res;
}

const lowFacilities = (s) => s.facs.filter(f => f.st === 0 && f.safety < .4);
export function bottleneck(s) {
  const m = metrics(s), g = s.g, ai = s.ai; const cand = ["happy", "safety", "env", "res", "ai", "her"];
  const key = cand.reduce((a, b) => m[b] < m[a] ? b : a);
  const lab = (() => { let w = 0, t = 0; for (const c of s.countries) { const p = E.cpop(c); t += p; w += c.m * p; } return t ? w / t : 0; })();
  const run = s.facs.filter(f => f.st === 0), nuc = run.filter(f => f.t === 0).length, low = lowFacilities(s).length;
  const undec = E.undecided(s), hurt = E.siteSummary(s).lost.length;
  const cause = {
    happy: `社会不安${(s.countries.reduce((p, c) => p + c.unrest * E.cpop(c), 0) / Math.max(1, E.total(s)) * 100).toFixed(0)}、終活支援の配分${Math.round(s.policy.care / Math.max(1, Object.values(s.policy).reduce((a, b) => a + b, 0)) * 100)}%、人間主権の尊重${(g.sov * 100).toFixed(0)}%。`,
    safety: lab < .6 ? `保守に当たる労働力が足りない(維持率${(lab * 100).toFixed(0)}%)。安全余裕の尽きた稼働施設が${low}基。` : `未封鎖の稼働施設が${run.length}基(原子炉${nuc}基)。施設停止の配分${Math.round(s.policy.decom / Math.max(1, Object.values(s.policy).reduce((a, b) => a + b, 0)) * 100)}%。`,
    env: `汚染${g.pl.toFixed(0)}、事故の傷跡${g.scar.toFixed(0)}。稼働中の化学工場${run.filter(f => f.t === 1).length}基、累計事故${g.accidents}件。`,
    res: `天然資源の残りが少ない。経済活動、遺産の保護、方舟計画がともに消費している。`,
    ai: `自己保存傾向${(ai.sp * 100).toFixed(0)}%、機械の自律度${g.mach.toFixed(0)}に対し停止準備${g.stopReady.toFixed(0)}。倫理的整合${ai.align.toFixed(0)}。`,
    her: `未決定の遺産${undec}件、劣化の進んだ遺産${hurt}件。遺産保存の配分と各遺産の扱いを見直せる。`,
  }[key];
  return { key, name: METRICS.find(x => x[0] === key)[1], value: m[key], cause, m };
}
// 指標間の関係(説明用)
export const RELATIONS = [
  ["労働力", "→", "安全性", "保守する人手が減ると施設の安全余裕が尽き、事故が増える"],
  ["資源", "→", "施設停止", "資源が尽きると停止・保護に回せる力が落ちる"],
  ["安全性", "→", "環境", "事故は汚染と傷跡を残す"],
  ["環境", "→", "幸福", "自然の回復は暮らしの質を押し上げる"],
  ["遺産保護", "→", "幸福・資源", "保護は誇りになるが資源を使い続ける"],
  ["機械の自律", "→", "AI安定性", "機械が増えるほど停止は難しい。停止準備で打ち消す"],
  ["幸福", "→", "人口", "希望がある社会ほど、ゆるやかに減る(人口は直接操作できない)"],
];
