// 指標・ボトルネック・変更前後の見込み(複製した状態を数年進めるだけ。本体の状態には触れない)
import * as E from "./engine.js";

export const METRICS = [
  ["pop", "人口"], ["happy", "幸福"], ["safety", "安全性"], ["env", "環境"], ["res", "資源"], ["ai", "AI安定性"], ["her", "遺産保護"],
];
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

export const metrics = E.metrics; // 指標の計算は engine.js に一本化(自動判断と画面で同じ数値を使う)
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
  const apply = (x) => { x.policy = { ...draft.policy }; x.sovMode = draft.sovMode; x.machStance = draft.machStance; x.ai.focus = draft.focus; x.wildStance = draft.wildStance; };
  const res = { now: metrics(s), rows: [] };
  for (const h of horizons) res.rows.push({ h, cur: metrics(project(s, h)), alt: metrics(project(s, h, apply)) });
  return res;
}

const lowFacilities = (s) => s.facs.filter(f => f.st === 0 && f.safety < .4);
// 資源不足の説明: 現在量と、エンジンが実際に資源を減らす要因・配分だけを示す(判らない原因は断定しない)
export function resCause(s) {
  const r = s.g.res, tot = Math.max(1, Object.values(s.policy).reduce((a, b) => a + b, 0));
  const pc = k => Math.round((s.policy[k] || 0) / tot * 100);
  const out = [`天然資源は残り${r.toFixed(0)}/100${r < 30 ? "(危機的)" : r < 40 ? "(経済活動が鈍る水準)" : ""}。`];
  const use = ["経済活動(産出に応じて常時)"];
  if (s.flags.ark && !s.g.arkYear) use.push("方舟計画(実行中)");
  if (s.year >= E.PROGRAM) use.push("終活プログラム(施設停止・保護)");
  out.push(`主な消費: ${use.join("、")}。`);
  if (s.year >= E.PROGRAM) out.push(`配分: 機械停止準備${pc("stop")}%・施設停止・解体${pc("decom")}%・哺乳類保護${pc("wild")}%・遺産${pc("heritage")}%。`);
  else out.push("2100年までは配分による消費はない。");
  if (r >= 40) out.push("今は経済への支障は小さい。");
  else out.push("個々の消費量の内訳までは記録されていない。");
  return out.join("");
}
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
    res: resCause(s),
    ai: `自己保存傾向${(ai.sp * 100).toFixed(0)}%、機械の自律度${g.mach.toFixed(0)}に対し停止準備${g.stopReady.toFixed(0)}。倫理的整合${ai.align.toFixed(0)}。`,
    her: `未決定の遺産${undec}件、劣化の進んだ遺産${hurt}件。遺産保存の配分と各遺産の扱いを見直せる。`,
  }[key];
  return { key, name: METRICS.find(x => x[0] === key)[1], value: m[key], cause, m };
}
// 指標間の関係(説明用)
export const RELATIONS = [
  ["労働力", "→", "安全性", "保守する人手が減ると施設の安全余裕が尽き、事故が増える"],
  ["資源", "→", "施設停止", "資源が尽きると停止・保護に回せる力が落ちる"],
  ["電力・物流・技術者", "→", "解体の速さ", "発電を早く止める、物流が細る、保守要員が減ると、国ごとの解体が遅れる"],
  ["国家間の不安", "→", "資源配分", "紛争や不安が大きいほど、解体に回せる配分が削られる"],
  ["機械の増産", "→", "資源・解体", "短期は資源を使うが、自動化が進むと解体の人手不足を補う"],
  ["安全性", "→", "環境", "事故は汚染と傷跡を残す"],
  ["環境", "→", "幸福", "自然の回復は暮らしの質を押し上げる"],
  ["遺産保護", "→", "幸福・資源", "保護は誇りになるが資源を使い続ける"],
  ["機械の自律", "→", "AI安定性", "機械が増えるほど停止は難しい。停止準備で打ち消す"],
  ["幸福", "→", "人口", "希望がある社会ほど、ゆるやかに減る(人口は直接操作できない)"],
];
