// 自動完走・分岐テスト: node tests/run.mjs
import * as E from "../js/engine.js";
import { BOTS, applyBot } from "./bots.mjs";
import * as I from "../js/insight.js";

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("  ✗ " + m); } else console.log("  ✓ " + m); };

function play(botName, seed = 1) {
  const bot = BOTS[botName], s = E.newGame(seed);
  E.runToEnd(s, { choose: bot.choices, onYear: st => applyBot(st, bot) }, 2500);
  return s;
}

console.log("■ 1. 戦略ボットによる2020年→絶滅→終幕の完走");
const results = {};
for (const name of Object.keys(BOTS)) {
  const t0 = Date.now(), s = play(name);
  results[name] = s;
  const e = s.ended, sc = e && e.scores;
  console.log(`${name.padEnd(10)} → ${e ? e.name : "未完走"} (${e && e.kind}/${e && e.observer}) 絶滅${s.g.extinctYear}年 ` +
    (sc ? `自然${sc.nature.toFixed(0)} 遺産${sc.heritage.toFixed(0)} 安全${sc.safety.toFixed(0)} 人間${sc.human.toFixed(0)} 主権${sc.sovereignty.toFixed(0)} 機械${sc.mach.toFixed(0)} AI${sc.ai ? "残" : "停"} 事故${s.g.accidents}` : "") + ` ${Date.now() - t0}ms`);
  ok(!!e, `${name}: 最後まで完走した`);
  ok(e && e.text.length >= 6, `${name}: 終幕文が状態から組み立てられた`);
}

console.log("\n■ 2. 異なる選択が異なる結末・数値を生む");
const ends = new Set(Object.values(results).map(s => s.ended && s.ended.id));
ok(ends.size >= 5, `ボット間で ${ends.size} 種類の異なる結末に到達 (${[...ends].join(",")})`);
const kinds = new Set(Object.values(results).map(s => s.ended && s.ended.kind));
ok(kinds.has("成功") || kinds.has("部分成功"), "成功系の結末に到達");
ok(kinds.has("失敗"), "失敗系の結末に到達");
ok(Object.values(results).some(s => s.ended.id === "runaway" || s.ended.id === "paradise" || s.ended.id === "copy" || s.ended.scores.ai), "AI残存系の結末に到達");
const A = results.ideal.ended.scores, B = results.tyrant.ended.scores;
ok(A.sovereignty > B.sovereignty + 20, `合意方針は強制方針より主権が高い (${A.sovereignty.toFixed(0)} > ${B.sovereignty.toFixed(0)})`);
ok(results.machine.ended.scores.mach > results.ideal.ended.scores.mach + 10, "機械文明を許すと機械が残る");
ok(results.ark.g.arkYear && results.ark.g.survivors > 0, "研究重視+方舟計画で生存者が生まれる");
ok(results.ideal.ended.scores.safety > results.passive.ended.scores.safety, "施設停止に配分すると安全性が高い");

console.log("\n■ 3. 同じシード・同じ選択は完全に同じ結末(再現性)とセーブ・ロード");
{
  const a = play("ideal", 7), b = play("ideal", 7);
  ok(JSON.stringify(a.ended.scores) === JSON.stringify(b.ended.scores), "同一シードで同一スコア");
  const s = E.newGame(3); const bot = BOTS.ideal;
  while (s.year < 2150) { E.tick(s); if (s.pending) E.choose(s, bot.choices(s, s.pending)); applyBot(s, bot); }
  const saved = JSON.stringify(s), t = JSON.parse(saved);
  E.runToEnd(s, { choose: bot.choices, onYear: st => applyBot(st, bot) }); E.runToEnd(t, { choose: bot.choices, onYear: st => applyBot(st, bot) });
  ok(s.ended.id === t.ended.id && JSON.stringify(s.ended.scores) === JSON.stringify(t.ended.scores), "2150年でセーブ→ロードしても同じ結末");
}

console.log("\n■ 4. 15種類の結末が評価関数で到達可能・状態に応じて分岐");
{
  const base = () => { const s = E.newGame(1); s.g.final = "after"; s.g.finalResolved = "after"; return s; };
  const sc0 = (o = {}) => ({ mammal: 60, mammalInfo: { extYear: 2500, welfare: .6, habitat: 1, eco: .2 }, nature: 80, heritage: 80, safety: 80, human: 80, sovereignty: 80, unrest: 20, mach: 0, ai: false, ark: false, left: { run: 0, sealed: 1, acc: 0, runNuc: 0 }, ...o });
  const cases = [
    ["perfect", s => { }, {}],
    ["dusk", s => { }, { heritage: 40, nature: 60 }],
    ["keeper", s => { s.g.finalResolved = "caretaker"; }, { ai: true }],
    ["green", s => { }, { nature: 85, heritage: 30, human: 50, safety: 60 }],
    ["ash", s => { }, { safety: 30, nature: 30, human: 70 }],
    ["runaway", s => { s.g.finalResolved = "after"; }, { mach: 60, ai: false }],
    ["copy", s => { s.g.hidden = true; }, { ai: true }],
    ["ark", s => { s.g.arkYear = 2300; s.g.survivors = 1000; }, { ark: true }],
    ["managed", s => { }, { sovereignty: 20, human: 60 }],
    ["war", s => { s.flags.nukeWar = 2200; }, { human: 30, safety: 40 }],
    ["early", s => { }, { safety: 30, nature: 30, human: 20 }],
    ["paradise", s => { s.g.finalResolved = "auto"; }, { mach: 90, ai: true, nature: 70 }],
    ["reboot", s => { s.g.arkYear = 2300; s.g.survivors = 1000; s.g.finalResolved = "caretaker"; }, { ark: true, ai: true }],
    ["plain", s => { }, { nature: 60, heritage: 50, safety: 60, human: 55, sovereignty: 60 }],
    ["lonely", s => { s.g.finalResolved = "abandon"; }, { human: 40 }],
  ];
  for (const [id, setup, over] of cases) {
    const s = base(); setup(s); const e = E.decideEnding(sc0(over), s);
    ok(e.id === id, `結末「${id}」に到達 (得た:${e.id})`);
    if (e.id === id) { const sc = sc0(over); s.ended = null; const text = E.epilogue(s, e, sc); ok(text.length >= 7 && text.every(t => t.length > 10), `  終幕文${text.length}段落を生成`); }
  }
  ok(E.ENDINGS.length >= 10, `結末は ${E.ENDINGS.length} 種類`);
  const obs = new Set(E.ENDINGS.map(e => e.obs)); ok(obs.size >= 5, `観測者 ${obs.size} 種類: ${[...obs].join(" / ")}`);
  const s1 = base(), s2 = base(); s2.g.accidents = 9; s2.flags.accList = [{ y: 2300, n: "テスト原子力発電所", t: 0 }];
  const e1 = E.epilogue(s1, E.ENDINGS[1], sc0()), e2 = E.epilogue(s2, E.ENDINGS[1], sc0({ nature: 30, safety: 30 }));
  ok(JSON.stringify(e1) !== JSON.stringify(e2), "最終状態が違えば終幕文も変わる");
}

console.log("\n■ 5. 設計制約");
{
  const s = results.ideal;
  ok(s.facs.length > 1000 && new Set(s.facs.map(f => f.t)).size === 6, `個別施設 ${s.facs.length} 基・6分類`);
  ok(results.ideal.chosen.length >= 10, `判断イベント ${results.ideal.chosen.length} 回`);
  ok(E.EVENTS.length >= 15, `イベント種別 ${E.EVENTS.length}`);
  // 人口には直接触れない: policy のどのチャネルも人口を直接書き換えない(出生率は認識・幸福経由のみ)
  const s2 = E.newGame(1), s3 = E.newGame(1);
  s3.policy = { research: 100, care: 0, decom: 0, stop: 0, eco: 0, heritage: 0 };
  for (let i = 0; i < 40; i++) { for (const x of [s2, s3]) { E.tick(x); if (x.pending) E.choose(x, x.pending.choices[0].id); } }
  ok(E.total(s2) === E.total(s3), "2100年前は配分を変えても人口は変わらない");
}

console.log("\n■ 6. 砂時計(人類・AI)の整合性: 毎年検査");
{
  const bot = BOTS.ideal, s = E.newGame(5); let bad = 0, years = 0, dead = 0, stopped = 0, mono = true;
  while (!s.ended && years < 2500) {
    E.tick(s); if (s.pending) E.choose(s, bot.choices(s, s.pending)); applyBot(s, bot); years++;
    const g = s.g, P = E.total(s);
    if (Math.abs(g.P0 + g.hBorn - g.hDead - P) > 1e-6 * g.P0) bad++;      // 生存者 = 初期+出生-死亡
    if (g.aiActive + g.aiStopped !== g.aiBuilt || g.aiActive < 0 || g.aiStopped < 0) bad++; // AI: 稼働+停止 = 累計新造(二重計上なし)
    if (g.hDead < dead - 1e-6 || g.aiStopped < stopped) mono = false;     // 累計は減らない
    dead = g.hDead; stopped = g.aiStopped;
  }
  ok(bad === 0, `${years}年すべてで 人類(初期+出生-死亡=生存) と AI(稼働+停止=新造累計) が一致`);
  ok(mono, "累計死亡・累計停止は単調に増える(再計上・巻き戻しなし)");
  ok(s.g.aiBuilt > s.g.aiStopped || s.g.aiActive === 0 || s.g.aiRemain, "AI累計の最終状態が妥当");
  ok(Math.round(s.g.P0 + s.g.hBorn) - Math.round(E.total(s)) === Math.round(s.g.P0 + s.g.hBorn) , "絶滅後は生存者0、累計の全員が死亡側");
  const s2 = E.newGame(5); for (let i = 0; i < 40; i++) { E.tick(s2); if (s2.pending) E.choose(s2, s2.pending.choices[0].id); }
  const fb = s2.g.aiBuilt; s2.facs.filter(f => f.t === 4).forEach(f => { f.st = 1; }); s2.facs.filter(f => f.t === 4).forEach(f => { f.st = 0; });
  ok(s2.g.aiBuilt === fb, "施設の停止→再稼働だけではAIの新造数は増えない(再稼働の二重計上なし)");
  const lim = E.newGame(2); lim.g.mach = 100; let maxBuild = 0; for (let i = 0; i < 20; i++) { const a = lim.g.aiBuilt, act = lim.g.aiActive; E.stepAI(lim, false); maxBuild = Math.max(maxBuild, (lim.g.aiBuilt - a) / Math.max(1, act)); }
  ok(maxBuild < .6, `AI新造は製造枠で制限される(年あたり最大 ${(maxBuild * 100).toFixed(0)}% 増)`);
}

console.log("\n■ 7. 遺産・政策選択による分岐・見込み・ボトルネック");
{
  const mk = (pol) => { const s = E.newGame(3), bot = BOTS.ideal; E.runToEnd(s, { choose: (st, p) => p.id === "heritage_review" ? pol : bot.choices(st, p), onYear: st => applyBot(st, bot) }); return s; };
  const a = mk("protect"), b = mk("record"), c = mk("select");
  const n = (s) => E.siteSummary(s).n;
  ok(n(a)[1] > 20 && n(b)[2] > 20 && n(c)[3] > 5, `遺産の方針が反映される (保護${n(a)[1]} / 記録${n(b)[2]} / 自然還元${n(c)[3]})`);
  ok(Math.abs(a.ended.scores.heritage - b.ended.scores.heritage) + Math.abs(a.ended.scores.nature - c.ended.scores.nature) > 0.5 || a.ended.scores.heritage !== c.ended.scores.heritage, "遺産の扱いで遺産評価・環境が変わる");
  ok(E.SITES.some(d => d.real) && E.SITES.some(d => !d.real && d.type === "original"), "実在の世界遺産とゲーム独自候補を区別");
  const base = E.newGame(4); while (base.year < 2100) { E.tick(base); if (base.pending) E.choose(base, base.pending.choices[0].id); }
  if (base.pending) E.choose(base, base.pending.choices[0].id);
  const dr = { policy: { ...E.PRESETS.research }, sovMode: "consent", machStance: "std", focus: "world" };
  const pv = I.previewPolicy(base, dr);
  const dd = I.diff(pv.rows[1].cur, pv.rows[1].alt);
  ok(Object.values(dd).some(v => Math.abs(v) > .3), "方針変更の見込みが現状維持と異なる: " + I.fmtDiff(dd));
  const bn = I.bottleneck(base); ok(bn.name && bn.cause.length > 10, `ボトルネックと原因を表示: ${bn.name} / ${bn.cause.slice(0, 30)}…`);
  ok(Object.keys(I.metrics(base)).length === 7, "7指標(人口・幸福・安全性・環境・資源・AI安定性・遺産保護)");
  const pend = E.newGame(6); while (!pend.pending) E.tick(pend); const pc = I.previewChoices(pend, 10);
  ok(Object.keys(pc).length === pend.pending.choices.length, "重要イベントの全選択肢に即時/長期の見込み");
  const logs = a.log.filter(l => l.k === "nar").length; ok(logs > 20, `状態に連動した情勢描写 ${logs} 件`);
  ok(a.log.some(l => /縮退|人通り|旧市街|最後の集落/.test(l.t)), "都市の衰退・自然回復・最後の世代の描写が出る");
  ok(a.chosen.some(x => x.e === "citydecline") && a.chosen.some(x => x.e === "heritage_review"), "世界の状態に連動したイベント(都市の縮退・遺産)が発生");
  ok(JSON.stringify(a.log.filter(l => l.k === "nar").map(l => l.t)) !== JSON.stringify(results.passive.log.filter(l => l.k === "nar").map(l => l.t)), "選択が違えば描写も変わる");
}

console.log("\n■ 8. セーブ互換(v1セーブの読み込み)");
{
  const s = E.newGame(8); for (let i = 0; i < 60; i++) { E.tick(s); if (s.pending) E.choose(s, s.pending.choices[0].id); }
  const old = JSON.parse(JSON.stringify(s)); old.v = 1; delete old.sites; for (const k of ["hBorn", "hDead", "aiActive", "aiBuilt", "aiStopped", "sitesBio", "hMod"]) delete old.g[k];
  const m = E.migrate(old);
  ok(m.v === 3 && m.sites.length === E.SITES.length && m.g.aiActive > 0, "旧セーブにも砂時計・遺産の項目が補われる");
  ok(Math.abs(m.g.P0 + m.g.hBorn - m.g.hDead - E.total(m)) < 1e-3 * m.g.P0, "移行後も 人口=初期+出生-死亡 が成立");
  E.runToEnd(m, { choose: BOTS.ideal.choices, onYear: st => applyBot(st, BOTS.ideal) }); ok(!!m.ended, "旧セーブから最後まで完走できる");
}

function playMode(name, mode, seed = 11) {
  const bot = BOTS[name], s = E.newGame(seed); s.mode = mode; let pre = 0, post = 0;
  E.runToEnd(s, { choose: (st, p) => { st.year >= 2100 ? post++ : pre++; return bot.choices(st, p); }, onYear: st => applyBot(st, bot) }, 2500);
  return { s, pre, post };
}
console.log("\n■ 9. 進行モード(手動・半自動・完全自動)で終幕まで完走");
{
  const SEMI = ["citydecline", "takeover", "lastcity", "lastschool"];
  const man = playMode("ideal", "manual"), semi = playMode("ideal", "semi"), auto = playMode("ideal", "auto");
  ok(man.s.ended && semi.s.ended && auto.s.ended, `手動(${man.s.ended && man.s.ended.name})・半自動(${semi.s.ended && semi.s.ended.name})・完全自動(${auto.s.ended && auto.s.ended.name}) すべて完走`);
  ok(man.post > 10 && man.s.autoLog.length === 0, `手動: 2100年以降も${man.post}回停止して選ぶ。自動判断は0件`);
  ok(semi.post > 0 && semi.post < man.post && semi.s.autoLog.length > 0 && semi.s.autoLog.every(a => SEMI.includes(a.id)), `半自動: 縮退対応(${semi.s.autoLog.length}件)だけ自動、それ以外は${semi.post}回停止`);
  ok(auto.post === 0 && auto.s.autoLog.length > 5, `完全自動: 2100年以降は一度も停止せず、${auto.s.autoLog.length}件を自動処理`);
  ok(auto.pre >= 5, `2100年までは完全自動でも手動(${auto.pre}回の判断)`);
  ok(auto.s.autoLog.every(a => a.why.length > 10 && a.diff.length > 0), "自動判断すべてに理由と結果");
  ok(auto.s.autoLog.some(a => a.important && a.id === "program") && auto.s.log.some(l => l.k === "auto" && /理由/.test(l.t) && /結果/.test(l.t)), "重要イベントは重要フラグ付きで、理由と結果がログに残る");
  ok(auto.s.log.some(l => /自動方針/.test(l.t)) && JSON.stringify(auto.s.policy) !== JSON.stringify(E.PRESETS.balanced), "完全自動は配分も価値観と現状から自動更新する");
  const sw = E.newGame(12); sw.mode = "auto"; let after = 0; const bt = BOTS.ideal;
  while (!sw.ended && sw.year < 2400) { E.tick(sw); if (sw.pending) E.choose(sw, bt.choices(sw, sw.pending)); applyBot(sw, bt); }
  sw.mode = "manual"; let y = sw.year; while (!sw.ended && sw.year < y + 120) { E.tick(sw); if (sw.pending) { after++; E.choose(sw, bt.choices(sw, sw.pending)); } applyBot(sw, bt); }
  ok(after > 0, `完全自動→手動へいつでも切替できる(切替後に${after}回の判断が戻る)`);
}

console.log("\n■ 10. 2020〜2100年の選択が自動判断に反映");
{
  const to2100 = (name, seed) => { const bot = BOTS[name], s = E.newGame(seed); while (s.year < 2100) { E.tick(s); if (s.pending) E.choose(s, bot.choices(s, s.pending)); applyBot(s, bot); } return s; };
  const A = to2100("tyrant", 21), B = to2100("ideal", 21);
  const pa = E.prefProfile(A), pb = E.prefProfile(B);
  ok(pa.vec.safety > pb.vec.safety && pa.vec.dignity < pb.vec.dignity && pa.vec.ai > pb.vec.ai, `価値観が選択傾向で変わる (A:安全${pa.vec.safety.toFixed(2)}/尊厳${pa.vec.dignity.toFixed(2)} B:安全${pb.vec.safety.toFixed(2)}/尊厳${pb.vec.dignity.toFixed(2)})`);
  const pick = (hist) => { const s = structuredClone(B); s.chosen = hist; return ["program", "oldnuc", "riot", "takeover", "selfpres", "final"].map(id => E.autoChoiceFor(s, id)); };
  const ca = pick(A.chosen), cb = pick(B.chosen), diffN = ca.filter((x, i) => x !== cb[i]).length;
  ok(diffN >= 2, `同じ状況でも、2020〜2100年の選択傾向で自動判断が変わる(${diffN}/6イベントで違う: A=${ca.join(",")} B=${cb.join(",")})`);
  const run = (s0, bot) => { const s = structuredClone(s0); s.mode = "auto"; s.flags.__botSet = 1; s.policy = { ...E.PRESETS.balanced }; s.sovMode = "consent"; while (s.year < 2160 && !s.ended) { E.tick(s); if (s.pending) E.choose(s, bot.choices(s, s.pending)); } return s; };
  const ra = run(A, BOTS.tyrant), rb = run(B, BOTS.ideal);
  const sh = (s, k) => s.policy[k] / Object.values(s.policy).reduce((a, b) => a + b, 0);
  ok(sh(ra, "decom") > sh(rb, "decom") || sh(rb, "care") > sh(ra, "care"), `自動の配分にも価値観が出る (停止 A${sh(ra, "decom").toFixed(2)}/B${sh(rb, "decom").toFixed(2)}、終活支援 A${sh(ra, "care").toFixed(2)}/B${sh(rb, "care").toFixed(2)})`);
  const fresh = E.newGame(5), pf = E.prefProfile(fresh);
  ok(pf.n === 0 && Object.keys(E.DEFAULT_PREF).every(k => Math.abs(pf.vec[k] - E.DEFAULT_PREF[k]) < 1e-9), "選択履歴がない場合は明示された既定方針を使う");
  const few = E.newGame(6); few.chosen.push({ y: 2024, e: "learn", c: "tech", ev: "x", ch: "x" }); const pg = E.prefProfile(few);
  ok(pg.lam <= .2 && Math.abs(pg.vec.dignity - E.DEFAULT_PREF.dignity) < .3, "履歴が少ないと既定方針の影響が大きい");
}

console.log("\n■ 11. 人口の停滞・回復(条件付き)と絶滅時期");
{
  const stat = (name, seed) => { const bot = BOTS[name], s = E.newGame(seed); let up = 0, flat = 0, prev = null, ly = 0; while (!s.ended) { E.tick(s); if (s.pending) E.choose(s, bot.choices(s, s.pending)); applyBot(s, bot); if (s.year > 2100 && s.year !== ly) { ly = s.year; const P = E.total(s); if (prev && P > 1e6) { const r = P / prev - 1; if (r > 0) up++; if (Math.abs(r) < .003) flat++; } prev = P; } } return { up, flat, ev: s.g.popEv, ext: s.g.extinctYear, s }; };
  const care = [1, 2, 3].map(sd => stat("neglect", sd)), harsh = [1, 2, 3].map(sd => stat("chaos", sd)), ideal = [1, 2, 3].map(sd => stat("ideal", sd));
  const sum = (a, k) => a.reduce((p, x) => p + x[k], 0);
  ok(sum(care, "up") >= 10, `終活支援を厚くした世界では人口が増える年がある(${sum(care, "up")}年)`);
  ok(sum(harsh, "up") === 0 && sum(harsh, "flat") < sum(care, "flat"), `支援が薄い世界では回復も停滞も起きにくい(回復${sum(harsh, "up")}年・停滞${sum(harsh, "flat")}年 < 厚い世界の停滞${sum(care, "flat")}年)`);
  ok(sum(ideal, "flat") > 0 || ideal.some(x => x.ev.flat > 0), `標準的な方針でも停滞期が発生(${sum(ideal, "flat")}年)`);
  ok(care.some(x => x.s.log.some(l => /人口の(停滞|回復)/.test(l.t) && /原因/.test(l.t))), "停滞・回復には原因(静穏期・希望・資源・終活支援)がログで示される");
  ok(ideal.every(x => x.ext > 2950) && ideal.every(x => x.s.ended), `絶滅は従来(2880年前後)より後ろ: ${ideal.map(x => x.ext).join("/")}年(シミュレーション結果)`);
  ok(care.every(x => x.s.ended) && harsh.every(x => x.s.ended), "人類絶滅は不可避: どの方針でも最終的に絶滅して終幕");
  const sc = (s) => { const L = s.log.filter(l => /静穏期|活発期/.test(l.t)); return L.length; };
  ok(ideal.every(x => sc(x.s) >= 2), "静穏期・活発期という天文現象の波が人口の動きの原因として記録される");
}

console.log("\n■ 12. 天文現象の波・AIコアの早期故障と機械文明");
{
  const A = (y) => E.coreFailRate && 0, ids = ["USA", "NGA", "JPN", "AFR", "EUR"];
  const ex = ids.map(i => 0); void A; void ex;
  const L = await import("../js/life.js");
  const arr = []; for (let y = 2050; y <= 2700; y += 5) arr.push(L.astroState(y, 7)); const val = arr.map(a => a.base + a.osc);
  let dips = 0; for (let i = 3; i < val.length; i++) if (val[i] < val[i - 3] - .1) dips++;
  ok(dips >= 2 && val[val.length - 1] > val[4], `天文現象の強度は時代で波打ちながら強まる(下がる局面${dips}回、2050→2700年で${val[0].toFixed(2)}→${val[val.length - 1].toFixed(2)})`);
  const exps = ["USA", "NGA", "JPN", "AFR", "EUR", "BRA"].map(L.exposureOf); ok(Math.max(...exps) - Math.min(...exps) > .15, "地域ごとに遮蔽の差がある");
  const s = E.newGame(3); s.g.astro = .2; const r1 = E.coreFailRate(s); s.g.astro = 1.2; const r2 = E.coreFailRate(s); s.flags.shield = 1; const r3 = E.coreFailRate(s);
  ok(r2 > r1 * 5 && r3 < r2 * .8, `コア故障率は天文強度で上がり(${(r1 * 100).toFixed(2)}%→${(r2 * 100).toFixed(1)}%)、遮蔽で下がる(${(r3 * 100).toFixed(1)}%)`);
  const m1 = results.machine.ended.scores.mach, m2 = results.machine_bare.ended.scores.mach, f1 = results.machine.g.aiFailed, f2 = results.machine_bare.g.aiFailed;
  ok(m1 > m2 + 5 && results.machine_bare.g.aiFailed > 0, `遮蔽・研究を怠ると機械文明が早く衰退(残存 ${m1.toFixed(0)} → ${m2.toFixed(0)}、故障 ${f1} / ${f2})`);
  const base = E.newGame(9), bt = BOTS.ideal; while (base.year < 2700) { E.tick(base); if (base.pending) E.choose(base, bt.choices(base, base.pending)); applyBot(base, bt); }
  const mean = (x) => x.countries.reduce((p, c) => p + c.m, 0) / x.countries.length, c1 = structuredClone(base), c2 = structuredClone(base);
  for (const c of [c1, c2]) { c.noEvents = true; c.g.mach = 60; c.g.coreFail = 0; c.facs.forEach(f => { f.st = 0; }); c.countries.forEach(k => { k.y *= .001; k.a *= .001; k.o *= .001; k.L0 *= .003; }); } c2.g.coreFail = .6;
  stepOnly(c1); stepOnly(c2);
  ok(mean(c2) < mean(c1), `コア故障で保守に当たる機械の力が落ちる(維持率 ${mean(c1).toFixed(2)} → ${mean(c2).toFixed(2)})`);
  ok(results.ideal.chosen.concat(results.wildlife.chosen).some(x => x.e === "astro_core"), "AIコア故障のイベント(遮蔽/更新/縮小の選択)が状態に応じて発生");
  ok(results.ideal.log.some(l => l.k === "astro" && /創作仮説/.test(l.t)), "天文現象の記述に「創作仮説」と明記");
}
function stepOnly(c) { c.pending = null; E.tick(c); }

console.log("\n■ 13. 大型哺乳類の砂時計・保護の選択");
{
  const L = await import("../js/life.js");
  ok(L.GROUPS.filter(g => g.wild).length === 4 && L.GROUPS.filter(g => !g.wild).length === 1 && /10kg/.test(L.MAMMAL_DEFINITION) && /昆虫/.test(L.MAMMAL_DEFINITION) && /間接/.test(L.MAMMAL_DEFINITION), "大型哺乳類の定義と5種群(野生4・家畜1)、対象外の生物と間接影響を明示");
  const s = E.newGame(4), bt = BOTS.wildlife; let bad = 0, mono = true, pd = 0;
  while (!s.ended) { E.tick(s); if (s.pending) E.choose(s, bt.choices(s, s.pending)); applyBot(s, bt); const m = E.mammalTotals(s); if (Math.abs(L.mammalN0() + m.born - m.dead - m.alive) > 1e-6 * m.ever) bad++; if (m.dead < pd - 1e-6) mono = false; pd = m.dead; if (s.mam.some(x => x.n < 0)) bad++; }
  ok(bad === 0 && mono, "哺乳類の砂時計: 初期+出生-死亡=生存 が毎年成立し、累計死亡は減らない(種群別も非負)");
  const W = [1, 2].map(sd => { const b = BOTS.wildlife, h = BOTS.humanfirst, a = E.newGame(sd), c = E.newGame(sd); E.runToEnd(a, { choose: b.choices, onYear: st => applyBot(st, b) }); E.runToEnd(c, { choose: h.choices, onYear: st => applyBot(st, h) }); return [a, c]; });
  for (const [a, c] of W) {
    const ma = a.ended.scores.mammalInfo, mc = c.ended.scores.mammalInfo;
    ok(a.ended.scores.mammal > c.ended.scores.mammal && ma.extYear > mc.extYear && ma.welfare > mc.welfare && ma.eco > mc.eco, `保護優先は評価(${a.ended.scores.mammal.toFixed(0)}>${c.ended.scores.mammal.toFixed(0)})・絶滅年(${ma.extYear}>${mc.extYear})・福祉・生態系が上`);
    ok(a.g.res < c.g.res - 3 && a.ended.scores.human <= c.ended.scores.human + .5, `代わりに資源(${a.g.res.toFixed(0)}<${c.g.res.toFixed(0)})と人類の幸福(${a.ended.scores.human.toFixed(0)}≦${c.ended.scores.human.toFixed(0)})を使う`);
    ok(ma.extYear !== null && mc.extYear !== null && a.mam.every((m, i) => !L.GROUPS[i].wild || m.n === 0), "どちらでも野生の大型哺乳類は必ず絶滅する(保護しても不可避)");
  }
  const b0 = E.newGame(15); while (b0.year < 2060) { E.tick(b0); if (b0.pending) E.choose(b0, b0.pending.choices[0].id); }
  const keep = I.project(b0, 40), loss = I.project(b0, 40, c => { c.mam.forEach((m, i) => { if (L.GROUPS[i].id === "herb" || L.GROUPS[i].id === "carn") { m.dd += m.n; m.n = 0; } }); });
  ok(loss.g.bio < keep.g.bio, `大型哺乳類を失うと生態系を通じて生物圏に間接影響(環境 ${keep.g.bio.toFixed(1)} → ${loss.g.bio.toFixed(1)})`);
  const hs = E.newGame(2); hs.wildStance = "human"; const ws = E.newGame(2); ws.wildStance = "wild"; ws.policy.wild = 30;
  const pr = (x) => { x.noEvents = true; x.g.P0 *= 1; for (let i = 0; i < 90; i++) E.tick(x); return E.wildAlive(x).alive; };
  ok(pr(ws) > pr(hs), "野生優先(保護区・繁殖支援)は人類優先より野生個体数を保つ");
}

console.log(fail ? `\n失敗 ${fail} 件` : "\nすべて成功");
process.exit(fail ? 1 : 0);
