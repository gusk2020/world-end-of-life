// ピクトグラム: 危険・安全・政策効果の可視化。表示専用で、シミュレーションには一切影響しない。
// 状態色(緑=安全 / 黄=注意 / 赤=危険)に加え、バッジの形(丸=安全 / 三角=注意 / 八角形=危険)とラベルでも区別する。
import * as E from "./engine.js";
import { wildAlive } from "./life.js";

const ICONS = {
  nuc: '<circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 3.5a8.5 8.5 0 0 1 7.4 4.3l-4.5 2.6M19.4 16.2A8.5 8.5 0 0 1 12 20.5V15.3M4.6 16.2a8.5 8.5 0 0 1 0-8.4l4.5 2.6"/>',
  chem: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3M8 15h8"/>',
  mil: '<circle cx="12" cy="12" r="6.5"/><path d="M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21"/>',
  ai: '<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M9.5 3v4M14.5 3v4M9.5 17v4M14.5 17v4M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/>',
  space: '<path d="M12 3c3.2 3 4.2 7.200 3 12l-3 3-3-3c-1.200-4.800-.2-9 3-12zM9 18l-3 3M15 18l3 3"/><circle cx="12" cy="10" r="1.300"/>',
  dam: '<path d="M4 5h16v5l-3 10H7L4 10zM4 10h16M9 10v10M15 10v10"/>',
  energy: '<path d="M13 2.500L5 14h6l-1 7.500L18 10h-6z"/>',
  resource: '<path d="M12 3l8 4.500v9L12 21l-8-4.500v-9zM12 12l8-4.500M12 12v9M12 12L4 7.500"/>',
  logistics: '<path d="M2.500 7h10.500v9H2.500zM13 10h4l3.500 3v3H13"/><circle cx="6.500" cy="18" r="2"/><circle cx="16.500" cy="18" r="2"/>',
  decomstall: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>',
  pollution: '<path d="M4 20h16M6 20V10h4v10M10 14h5v6M7.500 7c0-2 3-2 3-4.500M15 12V8"/>',
  heritage: '<path d="M3 9l9-5.500L21 9M5 9v9M9.500 9v9M14.500 9v9M19 9v9M3 20.500h18"/>',
  mammal: '<circle cx="6.500" cy="10" r="1.900"/><circle cx="10.500" cy="6" r="1.900"/><circle cx="15.500" cy="6" r="1.900"/><circle cx="19" cy="10" r="1.900"/><path d="M7.500 17.500c0-3 2.200-5 4.500-5s4.500 2 4.500 5c0 2-2 3-4.500 3s-4.500-1-4.500-3z"/>',
  pop: '<circle cx="12" cy="7.500" r="3.200"/><path d="M5.500 21v-3.500a6.500 6.500 0 0 1 13 0V21"/>',
  unrest: '<path d="M12 2.500c1.200 4.500 5.500 6 5.500 11a5.500 5.500 0 0 1-11 0c0-3 2-4.500 2.500-7 1.300 1 2.200 1 3-4z"/>',
  conflict: '<path d="M5 5l14 14M19 5L5 19"/><circle cx="12" cy="12" r="9"/>',
};
export const LEVEL_NAME = { ok: "安全", warn: "注意", bad: "危険" };
const BADGE = { // 形で区別: 丸=安全 / 三角=注意 / 八角形=危険
  ok: '<circle cx="19" cy="19" r="5" class="bg"/><path d="M16.500 19l2 2 3.500-4" class="bm"/>',
  warn: '<path d="M19 13.500l6 10.500H13z" class="bg"/><path d="M19 17.500v3M19 22.500v.1" class="bm"/>',
  bad: '<path d="M16 14h6l4 4v6l-4 4h-6l-4-4v-6z" transform="translate(-7 -6.500) scale(.95)" class="bg"/><path d="M16.500 16.500l5 5M21.500 16.500l-5 5" class="bm"/>',
};
export const KINDS = [
  ["nuc", "原子力", true], ["chem", "化学", true], ["mil", "軍事", false], ["ai", "AI施設", false], ["space", "宇宙", false], ["dam", "ダム", false],
  ["energy", "電力", true], ["resource", "資源", true], ["logistics", "物流", true], ["decomstall", "解体", true],
  ["pollution", "汚染", true], ["heritage", "遺産", false], ["mammal", "哺乳類", false], ["pop", "人口", false], ["unrest", "不安", true], ["conflict", "対立", false],
];
export const kindLabel = (k) => (KINDS.find(x => x[0] === k) || [0, k])[1];
export function icon(k, level = "ok", size = 26, withBadge = true) {
  return `<svg class="pico lv-${level}" viewBox="0 0 28 28" width="${size}" height="${size}" role="img" aria-label="${kindLabel(k)}:${LEVEL_NAME[level]}"><g class="ic" transform="translate(0 0) scale(.92)">${ICONS[k] || ""}</g>${withBadge ? BADGE[level] : ""}</svg>`;
}
const lv = (v, warn, bad, hi = true) => hi ? (v >= bad ? "bad" : v >= warn ? "warn" : "ok") : (v <= bad ? "bad" : v <= warn ? "warn" : "ok");
const wmean = (s, f) => { let w = 0, t = 0; for (const c of s.countries) { const p = E.cpop(c); w += f(c) * p; t += p; } return t ? w / t : 0; };
const facStat = (s, t, ci) => { let run = 0, low = 0; for (const f of s.facs) { if (f.t !== t || (ci !== undefined && f.c !== ci)) continue; if (f.st === 0 || f.st === 1) { run++; if (f.safety < .4) low++; } } return { run, low }; };
const FACK = { nuc: 0, chem: 1, dam: 2, mil: 3, ai: 4, space: 5 };
function facLevel(st) { return !st.run ? "ok" : st.low / st.run > .1 || st.low > 8 ? "bad" : st.low > 0 ? "warn" : "ok"; }
// 世界全体の状態(実際の内部状態から算出。存在しない影響値は作らない)
export function assess(s) {
  const out = [], P = E.total(s), pr = P / s.g.P0, w = wildAlive(s), prog = s.year >= E.PROGRAM;
  const add = (k, level, txt) => out.push({ k, label: kindLabel(k), level, txt });
  for (const k of ["nuc", "chem", "mil", "ai", "space", "dam"]) { const st = facStat(s, FACK[k]); add(k, facLevel(st), st.run ? `稼働${st.run}基 / 安全余裕が低い${st.low}基` : "稼働なし"); }
  const sup = wmean(s, c => c.sup ?? 1), logi = wmean(s, c => c.logi), unrest = wmean(s, c => c.unrest);
  add("energy", lv(sup, .4, .25, false), `発電能力 ${(sup * 100).toFixed(0)}%`);
  add("resource", lv(s.g.res, 45, 30, false), `残り ${s.g.res.toFixed(0)}/100`);
  add("logistics", lv(logi, .6, .4, false), `物流 ${(logi * 100).toFixed(0)}%`);
  const rs = s.reach && prog ? Math.min(...s.reach.filter((r, i) => !s.countries[i].extinct && s.facs.some(f => f.c === i && f.st < 2))) : null;
  add("decomstall", rs === null || !isFinite(rs) ? "ok" : lv(rs, .9, .6, false), rs === null || !isFinite(rs) ? "解体は未開始/完了" : `最も遅い国の実効力 ${rs.toFixed(2)}`);
  add("pollution", lv(s.g.pl + s.g.scar * .5, 35, 60), `汚染 ${s.g.pl.toFixed(0)} / 傷跡 ${s.g.scar.toFixed(0)}`);
  add("heritage", lv(s.g.her, 60, 40, false), `遺産 ${s.g.her.toFixed(0)}`);
  add("mammal", lv(w.alive / w.n0, .7, .4, false), `大型哺乳類 ${(w.alive / w.n0 * 100).toFixed(0)}%`);
  add("pop", lv(pr, .5, .2, false), `人口 ${(pr * 100).toFixed(0)}%(自然な減少)`);
  add("unrest", lv(unrest, .35, .6), `社会不安 ${(unrest * 100).toFixed(0)}`);
  const coop = s.coop ?? 1; add("conflict", lv(coop, .85, .6, false), `国家間の協力度 ${(coop * 100).toFixed(0)}%`);
  return out;
}
const ORDER = { bad: 0, warn: 1, ok: 2 };
export function visible(items, density) {
  if (density === "min") return items.filter(x => x.level === "bad");
  if (density === "full") return items;
  return items.filter(x => KINDS.find(y => y[0] === x.k)[2] || x.level !== "ok");
}
export function boardHTML(s, density, detail) {
  const items = assess(s), vis = visible(items, density).sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  const worst = items.reduce((a, x) => ORDER[x.level] < ORDER[a] ? x.level : a, "ok");
  const head = `<div class="pbh lv-${worst}">${icon(worst === "ok" ? "pop" : "unrest", worst, 18)}<b>${LEVEL_NAME[worst]}</b><span class="small"> ${items.filter(x => x.level === "bad").length}危険 ${items.filter(x => x.level === "warn").length}注意</span></div>`;
  const grid = vis.length ? vis.map(x => `<button class="pi lv-${x.level}" data-pk="${x.k}" aria-label="${x.label} ${LEVEL_NAME[x.level]} ${x.txt}">${icon(x.k, x.level, 26)}<span>${x.label}</span></button>`).join("") : `<div class="small">${density === "min" ? "重大な危険はありません" : "表示する項目がありません"}</div>`;
  const d = detail && items.find(x => x.k === detail);
  return head + `<div class="pgrid">${grid}</div><div class="pdet small">${d ? `${icon(d.k, d.level, 16)} <b>${d.label}</b> ${LEVEL_NAME[d.level]}: ${d.txt}` : "アイコンをタップで詳細"}</div>`;
}
// 国ごとの危険(地図用)。実在する施設・指標だけから作る
export function countryIssues(s, i) {
  const c = s.countries[i], out = []; if (c.extinct) return out;
  const add = (k, level, txt) => { if (level !== "ok") out.push({ k, label: kindLabel(k), level, txt }); };
  for (const k of ["nuc", "chem", "mil", "dam"]) { const st = facStat(s, FACK[k], i); const l = !st.run ? "ok" : st.low > 2 ? "bad" : st.low > 0 ? "warn" : "ok"; add(k, l, `${st.run}基稼働 / 余裕低${st.low}基`); }
  add("unrest", lv(c.unrest, .35, .6), `社会不安 ${(c.unrest * 100).toFixed(0)}`);
  if (s.reach && s.year >= E.PROGRAM && s.facs.some(f => f.c === i && f.st < 2)) add("decomstall", lv(s.reach[i], .9, .6, false), `解体の実効力 ${s.reach[i].toFixed(2)}`);
  add("energy", lv(c.sup ?? 1, .4, .25, false), `発電能力 ${((c.sup ?? 1) * 100).toFixed(0)}%`);
  add("logistics", lv(c.logi, .6, .4, false), `物流 ${(c.logi * 100).toFixed(0)}%`);
  add("pop", lv(E.cpop(c) / c.P0, .5, .2, false), `人口 ${(E.cpop(c) / c.P0 * 100).toFixed(0)}%`);
  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
export function mapMarkers(s, density) { // 集約: 1国1マーカー(最も重い項目+件数)。重なりを避け、タップで詳細
  const out = [];
  s.countries.forEach((c, i) => {
    let is = countryIssues(s, i); if (density === "min") is = is.filter(x => x.level === "bad"); else if (density === "std") is = is.filter(x => x.level !== "ok" && (x.level === "bad" || ["nuc", "chem", "unrest", "decomstall", "mil"].includes(x.k)));
    if (is.length) out.push({ i, id: c.id, top: is[0], n: is.length, all: is });
  });
  return out;
}
export function resultChips(diff) { // 判断の結果(実際の指標差分)をピクトグラム付きで
  const map = { pop: "pop", happy: "unrest", safety: "nuc", env: "pollution", res: "resource", ai: "ai", her: "heritage" };
  const names = { pop: "人口", happy: "幸福", safety: "安全性", env: "環境", res: "資源", ai: "AI安定性", her: "遺産保護" };
  return Object.entries(diff).filter(([, v]) => Math.abs(v) >= .5).map(([k, v]) => ({ k: map[k], name: names[k], v: Math.round(v) })).filter(x => x.k);
}
