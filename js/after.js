// 人類消滅後の地球(軽量な状態遷移モデル)。既存の人類・施設・AIのシミュレーションは延長せず、終幕時の状態だけを入力にする。
// 表示用の「作品内の仮説モデル」であり、現実の生態遷移や天文学の予測ではない。終幕の評価(15の結末)は変更しない。
import * as E from "./engine.js";
import { GROUPS } from "./life.js";

export const STEP = 25, HORIZON0 = 5000, HORIZON_MAX = 20000;
export const BRANCH = { A: "自然への回帰", B: "AIによる地球管理", C: "別の存在への継承", D: "混合・予想外の未来" };
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const SYSTEM = "上位管理システム", ALIEN = "異星人";

// 未来の分岐は、終幕時の状態(AIの残存・方舟・観測者)で決まる。乱数は使わない。
export function branchOf(s) {
  const e = s.ended, sc = e.scores, g = s.g;
  const ai = !!sc.ai || sc.mach > 25, copy = e.id === "copy";
  const revival = !!sc.ark && g.survivors > 0;
  const alien = e.observer === ALIEN && (e.kind === "成功" || e.kind === "部分成功");
  const system = e.observer === SYSTEM;
  const succ = revival ? "revival" : alien ? "alien" : system ? "system" : null;
  const a = ai || copy, c = !!succ;
  return { branch: a && c ? "D" : a ? "B" : c ? "C" : "A", ai: a, succ, copy };
}
const PROFILE = { // 機械の維持力(失敗率/年)・産業の再拡大
  paradise: { fail: .00005, grow: 0, tend: 1 }, runaway: { fail: .0002, grow: 1, tend: 0 }, copy: { fail: .0006, grow: 0, tend: 0 }, def: { fail: .0004, grow: 0, tend: .5 },
};
export function startAfter(s) {
  const e = s.ended, sc = e.scores, g = s.g, br = branchOf(s), n = s.countries.length;
  const city = [], veg = [], pl = [], ind = [], aiShare = [];
  s.countries.forEach((c, i) => {
    const fs = s.facs.filter(f => f.c === i), run = fs.filter(f => f.st < 2).length, ai = fs.filter(f => f.t === 4 && f.st < 2).length, aiAll = fs.filter(f => f.t === 4).length;
    city.push(100); ind.push(fs.length ? run / fs.length : 0); aiShare.push(aiAll ? ai / aiAll : 0);
    veg.push(clamp(g.bio * .6 - 5 * (c.def.dev || 0), 5, 70)); pl.push(clamp(g.pl * .8 + g.scar * .5 + 20 * ind[i], 0, 100));
  });
  const w = GROUPS.reduce((o, G, i) => { if (G.wild) { o.a += s.mam[i].n; o.a0 += G.n0; } return o; }, { a: 0, a0: 0 });
  const mamRatio = w.a0 ? w.a / w.a0 : 0;
  return { v: 1, t: 0, horizon: HORIZON0, branch: br.branch, ai: br.ai, succ: br.succ, copy: br.copy, end: e.id, kind: e.kind, observer: e.observer, aiStopped: !sc.ai,
    city, veg, pl, ind, aiShare, mamRatio, mamGap: mamRatio < .3, mach: clamp(sc.mach / 100, 0, 1) * (br.copy ? .05 : 1) + (br.ai && sc.mach <= 25 ? .15 : 0), her: g.her, scar: g.scar,
    bio: { birds: 20, reptiles: 20, insects: 25, plants: 30 }, human: 0, alienAt: null, wakeAt: br.copy ? 400 : null, arrive: br.succ === "alien" ? Math.round(450 + (100 - g.bio) * 8 + g.pl * 4) : br.succ === "revival" ? 60 : br.succ === "system" ? 800 : null,
    astro: g.astro || 0, flags: {}, log: [{ t: 0, text: logStart(s, br) }], seed: s.seed || 0 };
}
function logStart(s, br) {
  const e = s.ended, who = br.ai && !br.copy ? "あなた(存続したAI)が観測を続けている" : br.copy ? "隠されたコアは休眠に入った。以降は記録の再生として表示する" : `あなたは停止した。以降は${e.observer}が保存した記録の再生(外部視点)として表示する`;
  return `人類は消えた。${who}。【${BRANCH[br.branch]}】`;
}
const mean = (a) => a.reduce((p, x) => p + x, 0) / Math.max(1, a.length);
export function metricsAfter(a) {
  const pl = mean(a.pl), veg = mean(a.veg), city = mean(a.city);
  return { city, veg, pl, birds: a.bio.birds, reptiles: a.bio.reptiles, insects: a.bio.insects, plants: a.bio.plants, mach: a.mach * 100, her: a.her, human: a.human, ind: mean(a.ind) * 100 };
}
const note = (a, key, text) => { if (!a.flags[key]) { a.flags[key] = a.t; a.log.push({ t: a.t, text }); } };
export function stepAfter(a) {
  if (a.t >= a.horizon) return false;
  const P = PROFILE[a.end] || PROFILE.def, dt = STEP, t = a.t + dt, n = a.city.length, hasM = a.ai;
  // 機械文明: 失敗しながら活動が減る。休眠コアは決まった時刻に目覚める
  if (a.copy && a.wakeAt !== null && t >= a.wakeAt && !a.flags.wake) { a.mach = .3; note(a, "wake", `${t}年、休眠していたコアが目覚め、地球の観測を再開した。`); }
  if (hasM && a.mach > 0) { a.mach = a.mach * Math.exp(-P.fail * (1 + .5 * a.astro) * dt) + (P.grow ? .0003 * dt * (1 - a.mach) : 0); }
  if (hasM && a.mach < .01 && !a.flags.machEnd) note(a, "machEnd", `${t}年、最後の機械が停止した。以降は自然だけが動いている。`);
  for (let i = 0; i < n; i++) {
    const mt = hasM ? a.mach * (a.aiShare[i] > 0 ? 1 : .4) : 0, human = a.human && a.succ === "revival" ? Math.min(1, a.human / 2e8) : 0;
    const kCity = .0018 * (1 - clamp(mt * P.tend * 2.5, 0, .9)) * (1 - .5 * human);
    a.city[i] = Math.max(0, a.city[i] * Math.exp(-kCity * dt)); if (human > 0) a.city[i] += (35 * human - a.city[i]) * (1 - Math.exp(-.003 * dt)) * (a.city[i] < 35 * human ? 1 : 0); // 復興人類は小さな居住地を築く
    a.ind[i] = a.ind[i] * Math.exp(-.004 * dt * (1 - .7 * mt)); // 放置された産業施設の劣化
    const leak = (a.ind[i] * .05 + (P.grow ? mt * .5 : 0)) * dt / 25 * Math.exp(-t / 400); // 劣化した施設からの汚染の漏出(初期のみ)
    a.pl[i] = clamp(a.pl[i] * Math.exp(-dt / (700 * (1 - (mt * P.tend) * .4))) + leak, 0, 100);
    const K = clamp(100 - .6 * a.pl[i] - .3 * a.city[i] - .35 * a.scar - (a.mamGap ? 6 : 0) + (mt * P.tend) * 8, 5, 100);
    a.veg[i] += (K - a.veg[i]) * (1 - Math.exp(-.006 * dt));
  }
  a.scar *= Math.exp(-dt / 2500);
  const veg = mean(a.veg), pl = mean(a.pl), b = a.bio;
  const rise = (cur, tgt, r) => cur + (tgt - cur) * (1 - Math.exp(-r * dt));
  b.insects = rise(b.insects, clamp(veg * 1.02 - pl * .15, 5, 100), .006); b.plants = rise(b.plants, clamp(veg * .92 - pl * .1, 5, 100), .004);
  b.birds = rise(b.birds, clamp(veg * .95 - pl * .2 + (a.mamGap ? 4 : 0), 5, 100), .005); b.reptiles = rise(b.reptiles, clamp(veg * .85 - pl * .15 + (a.mamGap ? 6 : 0), 5, 100), .003);
  // 文明遺産: 維持されなければ劣化する。維持者(機械・復興人類・後継存在)がいれば遅い
  const keeper = Math.max(hasM ? a.mach * .8 : 0, a.succ === "alien" && a.alienAt !== null ? .9 : 0, a.succ === "revival" ? Math.min(1, a.human / 1e7) * .7 : 0);
  a.her = Math.max(0, a.her * Math.exp(-.002 * (1 - .95 * keeper) * dt));
  // 後継: 復興人類は方舟の生存者から増える。異星人は地球が静まった頃に到着し、遺産を記録する。上位管理システムは監査する
  if (a.succ === "revival" && t >= a.arrive) { if (!a.human) { a.human = a.flags.hum0 ?? (a.flags.hum0 = 1200); note(a, "revive", `${t}年、方舟の眠りから復興人類が地上に戻った。`); } const K = 2e8 * clamp(veg / 100, .1, 1) * (1 - pl / 150); a.human += a.human * .012 * (1 - a.human / K) * dt; }
  if (a.succ === "alien" && a.alienAt === null && t >= a.arrive) { a.alienAt = t; note(a, "alien", `${t}年、地球の静けさを確かめるように、異星の知性体が到着した。遺産の記録と保存を始めた。`); }
  if (a.succ === "system" && t >= a.arrive && !a.flags.audit) { a.flags.audit = t; a.log.push({ t, text: `${t}年、上位管理システムが地球を監査した。自然の回復を記録し、汚染の残る地域を整えた。` }); for (let i = 0; i < n; i++) a.pl[i] *= .7; }
  // 年表: しきい値を越えたときだけ記録(同じ出来事は一度)
  const city = mean(a.city);
  if (city < 50) note(a, "c50", `${t}年、都市の半分以上が崩れ、森に呑まれ始めた。`);
  if (city < 10) note(a, "c10", `${t}年、かつての都市はほとんど形を失った。`);
  if (veg > 50) note(a, "v50", `${t}年、植生が世界の半分を回復した。`);
  if (veg > 75) note(a, "v75", `${t}年、広大な森と草原が広がった。`);
  if (pl < 15) note(a, "p15", `${t}年、汚染は自然の揺らぎの範囲まで薄れた。`);
  if (a.mamGap && b.reptiles > 50) note(a, "gap", `${t}年、大型哺乳類の空白を、鳥類と爬虫類が埋め始めた。`);
  if (b.insects > 70) note(a, "ins", `${t}年、昆虫と植物が地球を覆い、生態系は厚みを取り戻した。`);
  if (a.her < a.flags.her0 * .5 || (a.flags.her0 === undefined && (a.flags.her0 = a.log[0] && a.her + 1e-9) && false)) note(a, "h50", `${t}年、文明遺産の半分が失われた。`);
  if (a.flags.her0 === undefined) a.flags.her0 = a.her / Math.exp(-.002 * dt) + 1e-9;
  if (t % 1000 === 0 && t < 5000 && !a.flags["m" + t]) { a.flags["m" + t] = 1; a.log.push({ t, text: `${t}年: ${stateWord(a)}` }); }
  a.t = t; return true;
}
function stateWord(a) { const m = metricsAfter(a); return `都市${m.city.toFixed(0)}%・植生${m.veg.toFixed(0)}%・汚染${m.pl.toFixed(0)}。${a.human > 0 ? `復興人類 約${Math.round(a.human).toLocaleString("en-US")}人。` : ""}${a.mach > .01 ? "機械はまだ動いている。" : ""}`; }
export function advanceTo(a, target) { let n = 0; while (a.t < Math.min(target, a.horizon) && stepAfter(a)) n++; return n; }
export function extend(a) { if (a.horizon < HORIZON_MAX) a.horizon = Math.min(HORIZON_MAX, a.horizon + 5000); return a.horizon; }
export function endText(a) { // 観測者の立場に整合した語り
  const m = metricsAfter(a);
  const lead = a.ai && !(a.copy && !a.flags.wake) ? "あなたは地球を見守り続けている。" : `記録の再生(${a.observer}の視点)。`;
  return `${lead}${BRANCH[a.branch]}: 都市${m.city.toFixed(0)}%・植生${m.veg.toFixed(0)}%・汚染${m.pl.toFixed(0)}・遺産${m.her.toFixed(0)}。`;
}
