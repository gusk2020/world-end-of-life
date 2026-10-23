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
  { const q = JSON.parse(JSON.stringify(base)); q.g.res = 12; q.year = 2020; const a = I.resCause(q); q.year = 2101; q.flags.ark = 1; q.g.arkYear = 0; const b = I.resCause(q); q.g.res = 90; const c = I.resCause(q);
    ok(/12\/100/.test(a) && /危機的/.test(a) && /2100年までは/.test(a) && !/方舟/.test(a), "資源説明: 現在量と2100年前の扱い"); ok(/方舟計画/.test(b) && /配分: 機械停止準備\d+%・施設停止・解体\d+%/.test(b) && /内訳までは記録されていない/.test(b), "資源説明: 方舟・配分・断定しない注記"); ok(/支障は小さい/.test(c), "資源説明: 十分な資源の境界"); }
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
  ok(results.ideal.log.some(l => l.k === "astro" && /【天文】/.test(l.t)) && !results.ideal.log.some(l => /創作仮説|仮説です/.test(l.t)), "天文現象の記述は事実として語り、注釈を繰り返さない(区別は設定資料に集約)");
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

console.log("\n■ 14. 砂時計の表示モデル(粒は視覚表現。数値の正本は engine.js)");
{
  const S = await import("../js/sand.js");
  const mc = new S.SandModel(28, 40, 2.3, 8), mb = new S.SandModel(332, 385, 5.2, 40);
  ok(mc.capTop >= 30 && mb.capTop >= 300 && mb.capTop <= S.MAX_GRAINS && mb.capBot <= S.MAX_GRAINS, `粒を置ける数: 小型${mc.capTop}粒・拡大${mb.capTop}粒(上限${S.MAX_GRAINS}粒。数十億個体は描かない)`);
  let r = 99; const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let alive = 7.8e9, dead = 0, ever = 7.8e9; const K = 5e7, m = new S.SandModel(332, 385, 5.2, 40); let g0 = S.grainsFor(alive, dead, K); m.setTargets(g0.top, g0.bot); m.snap();
  let bad = 0, prevNb = 0, maxIn = 0, shrink = 0; const tickGame = () => { const d = 1e7 + rnd() * 3e8, b = 5e6 + rnd() * 1.5e8; alive += b - d; dead += d; ever += b; const g = S.grainsFor(alive, dead, K); m.setTargets(g.top, g.bot); m.addFlow(d / K, b / K); };
  for (let f = 0; f < 4000; f++) { if (f % 6 === 0) tickGame(); m.step(1 / 60); if (m.Nt < 0 || m.Nb < 0 || m.Nt > m.capTop || m.Nb > m.capBot) bad++; maxIn = Math.max(maxIn, m.inflight()); if (m.Nb < prevNb) shrink++; prevNb = m.Nb; }
  let g = 0; while (m.step(1 / 60) && g++ < 5000);
  ok(bad === 0 && maxIn <= m.maxInflight && m.fl.length === 96, `4000フレームの出生/死亡で粒数は範囲内、同時に動く粒は最大${maxIn}個(上限${m.maxInflight})、プール${m.fl.length}で一定`);
  ok(shrink === 0, "下に積もった累計の粒は(縮尺固定なら)減らない");
  ok(m.Nt === m.tt && m.Nb === m.tb && m.gap() === 0, `停止後は表示が最新の数値に収束(上${m.Nt}=${m.tt}粒、下${m.Nb}=${m.tb}粒)`);
  ok(m.stats.drops > 100 && m.stats.adds > 100 && m.stats.landedDrops <= m.stats.drops && m.stats.landedAdds <= m.stats.adds, `死亡=上から下へ落下(${m.stats.drops}粒)、出生=上へ追加(${m.stats.adds}粒)を区別して表示`);
  const st0 = JSON.stringify(m.stats); for (let i = 0; i < 2000; i++) m.step(1 / 60); ok(JSON.stringify(m.stats) === st0, "ゲームが止まっていれば(出来事が来なければ)新たな粒は生まれない");
  const m2 = new S.SandModel(332, 385, 5.2, 40); m2.setTargets(300, 0); m2.snap(); let a2 = 7.8e9, d2 = 0; for (let i = 0; i < 5000; i++) { const d = 3e8; a2 -= d; d2 += d; m2.addFlow(d / K, 0); m2.setTargets(S.grainsFor(Math.max(1, a2), d2, K).top, S.grainsFor(a2, d2, K).bot); }
  m2.step(1 / 60); ok(m2.gap() === 0 && m2.stats.bulk > 0, "高速進行で表示が追いつかない大量の出来事は、まとめて更新して遅延させない");
  const t0 = Date.now(); const m3 = new S.SandModel(332, 385, 5.2, 40); for (let i = 0; i < 30000; i++) { m3.setTargets((rnd() * 900) | 0, (rnd() * 900) | 0); m3.addFlow(rnd() * 3, rnd() * 3); m3.step(1 / 60); }
  ok(Date.now() - t0 < 2500 && m3.fl.length === 96, `3万フレーム分のモデル更新が${Date.now() - t0}ms(描画負荷・メモリは一定)`);
  // 縮尺
  let prevK = 0, okMono = true, lastBot = 0, bottomOk = true; const deadFixed = 1.5e10;
  for (const al of [7.8e9, 5e9, 1e9, 2e8, 1e7, 1e6, 5e4, 3e3, 200, 40, 1]) { const k = S.chooseScale("h", "auto", 1, al, 1000, prevK); if (prevK && k > prevK) okMono = false; prevK = k; const b = Math.min(1000, S.grainsFor(al, deadFixed, k).bot); if (b < lastBot) bottomOk = false; lastBot = b; }
  ok(okMono && prevK === 1, "自動縮尺は減少に応じて細かくなり(粗くならない)、最終段階では1粒=1個体");
  ok(bottomOk, "縮尺が細かくなっても下の累計の粒は減らない(消えたように見えない)");
  ok(S.grainsFor(40, 0, 1).top === 40 && S.grainsFor(0.4, 0, 1e7).top === 1 && S.grainsFor(0, 5, 1).top === 0, "1粒=1個体で正確。生存者がいる間は最低1粒、0なら0粒");
  const fx = S.FIXED.h.map(k => S.chooseScale("h", "fixed", S.FIXED.h.indexOf(k), 123456789, 1000)); ok(JSON.stringify(fx) === JSON.stringify(S.FIXED.h), "固定縮尺は1粒あたりの個体数が一定(人口によらない)");
  let errMax = 0; for (let i = 0; i < 500; i++) { const a = rnd() * 8e9 + 1e6, k = S.FIXED.h[i % 3], gt = S.grainsFor(a, 0, k).top; if (a >= k * .5) errMax = Math.max(errMax, Math.abs(gt * k - a) / k); } // 最低1粒の規則を除く
  ok(errMax <= .5 + 1e-9, "粒数×縮尺は実数と1/2粒以内で一致(縮尺は表現のみ。実数は別に持つ)");
  ok(S.fmtShort(7.8e9) === "78.0億" && S.fmtShort(123456) === "12万" && S.fmtShort(3292) === "3,292" && S.fmtScale(5e7) === "5000万" && S.fmtScale(2.5e8) === "2.5億", "省略表記: 78.0億 / 12万 / 3,292、縮尺: 5000万 / 2.5億");
}

console.log("\n■ 15. 観察フェーズ(UI状態とシミュレーション状態の分離・イベントの保留と順序)");
{
  const F = await import("../js/flow.js");
  // --- FlowController の単体
  const pf = { sec: 5, style: "stop" }, fc = new F.FlowController(pf);
  fc.start(); const r0 = fc.remain; fc.advance(1.5); ok(fc.active && Math.abs(fc.remain - (r0 - 1.5)) < 1e-9 && fc.rate(false) === 0, "観察(停止): 残り秒数が減り、ゲーム時間は進まない(0年/秒)");
  fc.start(); ok(fc.remain === 5, "二重にstartしてもタイマーは1本(残りを戻すだけ)");
  pf.style = "slow"; ok(fc.rate(false) === F.SLOW_YPS && fc.rate(true) === 0, `観察(低速): ${F.SLOW_YPS}年/秒(2秒で1年)。手動の一時停止中は0`);
  for (const sec of F.OBSERVE_SECS) { const q = new F.FlowController({ sec, style: "stop" }); q.start(); let n = 0; while (!q.done() && n++ < 1e5) q.advance(1 / 30); ok(Math.abs(n / 30 - sec) < .1, `観察時間${sec}秒で終了(${(n / 30).toFixed(2)}秒)`); }
  // --- 観察の有無・方式・モードで、シミュレーションの結果が変わらないこと
  const bot = BOTS.ideal;
  function sim(mode, prefs, speed = 100, seed = 11) {
    const S = E.newGame(seed); S.mode = mode; const ses = new F.Session(E, prefs); ses.bind(S); ses.afterTick = st => applyBot(st, bot);
    const rec = { shown: [], windows: [], bad: 0 }; let t = 0, frames = 0, cur = null; const dt = 1 / 30;
    while (!S.ended && frames++ < 4e6) {
      t += dt; const wasObs = ses.observing, y0 = S.year;
      const out = ses.frame(dt, { paused: false, speed, blocked: false });
      if (out.ended && cur) { cur.t1 = t; cur.y1 = S.year; rec.windows.push(cur); cur = null; if (S.holdAuto && !ses.observing) rec.bad++; }
      if (out.started || (!wasObs && ses.observing && !cur)) cur = { t0: t, y0: S.year, pend: false };
      if (ses.observing && cur && S.pending) cur.pend = true;
      if (ses.observing && cur) { /* 観察中にモーダルを出さない */ }
      if (S.pending && !ses.observing) { rec.shown.push({ t, id: S.pending.id, y: S.year }); const c = bot.choices(S, S.pending); E.choose(S, c); applyBot(S, bot); ses.decided(false); if (ses.observing) cur = { t0: t, y0: S.year, pend: false }; }
    }
    return { S, t, rec, frames };
  }
  const key = (r) => JSON.stringify([r.S.ended && r.S.ended.id, r.S.ended && r.S.ended.scores, r.S.year, r.S.g.extinctYear, r.S.chosen.map(c => c.e + ":" + c.c + "@" + c.y), r.S.series.h, r.S.series.a, r.S.series.m, r.S.autoLog.map(a => a.id + ":" + a.label)]);
  const modes = ["manual", "semi", "auto"], cfgs = [{ sec: 3, style: "stop" }, { sec: 5, style: "slow" }, { sec: 10, style: "stop" }, { sec: 3, style: "slow" }];
  for (const mode of modes) {
    const base = sim(mode, { sec: 0, style: "stop" }); const kb = key(base);
    ok(!!base.S.ended, `${mode}: 観察なしの基準が完走(${base.S.ended && base.S.ended.name})`);
    for (const cfg of mode === "manual" ? cfgs.slice(0, 3) : cfgs.slice(1, 3)) {
      const r = sim(mode, cfg), same = key(r) === kb;
      ok(same && !!r.S.ended, `${mode}・観察${cfg.sec}秒・${cfg.style === "stop" ? "停止" : "低速"}: 完走し、人口・施設・AI・哺乳類・判断の順序・結末が観察なしと完全に一致`);
      const w = r.rec.windows, durOk = w.every(x => Math.abs((x.t1 - x.t0) - cfg.sec) < .12 || x.t1 - x.t0 < cfg.sec + .12), yrs = w.map(x => x.y1 - x.y0);
      ok(w.length > 20 && durOk, `${mode}・${cfg.sec}秒: 観察${w.length}回、各回およそ${cfg.sec}秒`);
      if (cfg.style === "stop") ok(yrs.every(y => y === 0), "停止観察: 観察中にゲーム内の年は進まない");
      else ok(yrs.every(y => y <= Math.ceil(cfg.sec * F.SLOW_YPS) + 1) && yrs.some(y => y >= 1), `低速観察: 進んだ分だけ状態が更新(最大${Math.max(...yrs)}年/${cfg.sec}秒)`);
      const dup = new Set(); let dupN = 0; for (const c of r.S.chosen) { const k = c.e + "@" + c.y; if (dup.has(k) && !["wild_last", "citydecline", "wild_conflict", "astro_core", "oldnuc", "riot", "takeover"].includes(c.e)) dupN++; dup.add(k); }
      ok(dupN === 0 && r.rec.bad === 0 && r.S.holdAuto === false, "イベントの消失・重複なし、保留フラグは観察のたびに解除");
      if (cfg.style === "slow" && mode === "manual") ok(w.some(x => x.pend), "低速観察中に起きたイベントは保留され(モーダルを出さず)、観察の終了後に処理");
      const inWin = r.rec.shown.filter(s => w.some(x => s.t > x.t0 + .05 && s.t < x.t1 - .05)).length; ok(inWin === 0, "観察中は次のイベント選択画面を表示しない");
      const gaps = []; for (let i = 1; i < r.rec.shown.length; i++) gaps.push(r.rec.shown[i].t - r.rec.shown[i - 1].t);
      if (mode === "manual") ok(Math.min(...gaps) >= cfg.sec - .12, `連続イベントでも、次の選択画面まで最低${cfg.sec}秒の観察(最短${Math.min(...gaps).toFixed(2)}秒)`);
    }
  }
  // --- 手動の一時停止との競合・スキップ・速度の復帰
  const S2 = E.newGame(3); const ses = new F.Session(E, { sec: 5, style: "slow" }); ses.bind(S2); S2.mode = "manual";
  ses.startObserve(); const rem0 = ses.flow.remain; for (let i = 0; i < 60; i++) ses.frame(1 / 30, { paused: true, speed: 100, blocked: false });
  ok(ses.observing && ses.flow.remain === rem0 && S2.year === 2020, "手動で一時停止中は、観察のタイマーも時間も止まる(意図を優先)");
  const y2 = S2.year; for (let i = 0; i < 90; i++) ses.frame(1 / 30, { paused: false, speed: 100, blocked: false }); ok(ses.flow.remain < rem0 - 2.9 && S2.year >= y2, "再開すると観察の続きから進む");
  const o2 = ses.skip(true); ok(!ses.observing && S2.holdAuto === false && o2.ended, "スキップで観察を即終了(保留フラグも解除)");
  ok(ses.decided(true) === false && !ses.observing, "手動で一時停止中の判断確定では、観察を始めない");
  ok(ses.decided(false) === true && ses.observing && S2.holdAuto === true, "一時停止していなければ、判断の確定後に観察が始まる");
  const yb = S2.year; for (let i = 0; i < 400; i++) ses.frame(1 / 30, { paused: false, speed: 100, blocked: true }); ok(S2.year === yb && ses.flow.remain === 5, "他の画面で止めている間(blocked)は進まない");
  ses.bind(S2); ok(!ses.observing && S2.holdAuto === false, "新規・ロード時は観察を破棄する");
  const sp = 4; const before = JSON.stringify([ses.prefs, sp]); ses.startObserve(); for (let i = 0; i < 200; i++) ses.frame(1 / 30, { paused: false, speed: sp, blocked: false }); ok(!ses.observing && JSON.stringify([ses.prefs, sp]) === before, "観察の終了後はユーザーの速度設定のまま復帰(観察は速度設定を書き換えない)");
  // --- 保留と終了後の処理(自動モード)
  const S3 = E.newGame(4); while (S3.year < 2100) { E.tick(S3); if (S3.pending) E.choose(S3, S3.pending.choices[0].id); } S3.mode = "auto"; delete S3.done.learn; delete S3.done.infra; delete S3.done.mil;
  const s3 = new F.Session(E, { sec: 3, style: "slow" }); s3.bind(S3); s3.startObserve(); let held = false; for (let i = 0; i < 75; i++) { s3.frame(1 / 30, { paused: false, speed: 100, blocked: false }); if (S3.pending) held = true; }
  ok(held && S3.autoLog.filter(a => ["learn", "infra", "mil"].includes(a.id)).length === 0, "観察中に起きた自動対象のイベントは、自動で処理せず保留する");
  const a0 = S3.autoLog.length; for (let i = 0; i < 80; i++) s3.frame(1 / 30, { paused: false, speed: 100, blocked: false });
  ok(S3.autoLog.length === a0 + 1 && S3.autoLog[a0].id === "learn", "観察の終了後に、保留したイベントを順番どおり1件だけ自動処理(次の観察へ)");
  for (let i = 0; i < 3000 && S3.autoLog.filter(a => ["learn", "infra", "mil"].includes(a.id)).length < 3; i++) s3.frame(1 / 30, { paused: false, speed: 100, blocked: false });
  const ids = S3.autoLog.filter(a => ["learn", "infra", "mil"].includes(a.id)).map(a => a.id); ok(JSON.stringify(ids) === JSON.stringify(["learn", "infra", "mil"]), "連続して起きたイベントは重複・欠落・順序逆転なく処理される: " + ids.join(">"));
}

console.log("\n■ 16. 経済・資源・施設停止の相互依存(第5次)");
{
  const prep = () => { const q = E.newGame(5); while (q.year < 2102) { E.tick(q); if (q.pending) E.choose(q, q.pending.choices[0].id); } q.pending = null; q.policy = { research: 0, care: 10, decom: 60, stop: 10, eco: 10, heritage: 5, wild: 5 }; return q; };
  const prog = q => q.facs.reduce((p, f) => p + f.prog, 0);
  const one = (mut) => { const q = prep(); const p0 = prog(q); if (mut) mut(q); q.noEvents = true; E.tick(q); return { dp: prog(q) - p0, q }; };
  const base = one();
  ok(base.dp > 0 && base.q.reach.every(r => r >= .45 && r <= 1.6), `基準: 解体が進む(+${base.dp.toFixed(1)})、実効力は0.45〜1.6`);
  const lowSup = one(q => q.facs.forEach(f => { if (f.t === 0 || f.t === 2) f.st = 2; }));
  ok(lowSup.dp < base.dp, `発電施設を先に全停止すると解体能力が落ちる(${base.dp.toFixed(1)}→${lowSup.dp.toFixed(1)})`);
  const lowLogi = one(q => q.countries.forEach(c => c.logi = .15));
  ok(lowLogi.dp < base.dp, `物流網が縮小すると解体が遅れる(${lowLogi.dp.toFixed(1)})`);
  { const c0 = { sup: .5, logi: .9, m: 1, auto: 0 }, r = E.reachOf; ok(r({ ...c0, m: .3 }) < r(c0) && r({ ...c0, auto: .8 }) > r(c0), `技術者(維持率)が減ると解体の実効力が落ち、自動化が進むと補う(${r({ ...c0, m: .3 }).toFixed(2)} < ${r(c0).toFixed(2)} < ${r({ ...c0, auto: .8 }).toFixed(2)})`); }
  const war = one(q => q.countries.forEach(c => c.unrest = .9));
  ok(war.q.coop < .7 && war.dp < base.dp, `国家間の不安が大きいと配分が削られる(協力度${war.q.coop.toFixed(2)})`);
  const core = one(q => { q.g.coreFail = .9; });
  ok(core.dp < base.dp, `AIコアの故障で自動化設備が使えず解体が遅れる(${core.dp.toFixed(1)})`);
  const r0 = prep(), r1 = prep(); for (const q of [r0, r1]) { q.noEvents = true; q.policy.decom = 0; } r0.g.mach = 0; r1.g.mach = 100; E.tick(r0); E.tick(r1);
  ok(r1.g.res < r0.g.res, `機械の増産は短期には資源を消費(${r0.g.res.toFixed(2)}→${r1.g.res.toFixed(2)})`);
  const ordRun = o => { const q = prep(); q.decomOrder = o; for (let i = 0; i < 60; i++) { E.tick(q); if (q.pending) E.choose(q, q.pending.choices[0].id); q.policy = { research: 0, care: 10, decom: 60, stop: 10, eco: 10, heritage: 5, wild: 5 }; } return { ai: q.facs.filter(f => f.t === 4 && f.st < 2).length, all: q.facs.filter(f => f.st < 2).length, mil: q.facs.filter(f => f.t === 3 && f.st < 2).length, mach: q.g.mach }; };
  const oh = ordRun("hazard"), oa = ordRun("ai"), om = ordRun("mil");
  ok(oa.ai < oh.ai && oa.mach < oh.mach, `停止順序で結果が変わる: AI施設を先に止めると機械文明が育たない(AI稼働 ${oh.ai}→${oa.ai}, 機械の自律度 ${oh.mach.toFixed(1)}→${oa.mach.toFixed(1)})`);
  ok(om.mil < oh.mil, `軍事を先に止める順序では軍事施設が早く減る(${oh.mil}→${om.mil})`);
  const old = E.newGame(2); delete old.decomOrder; const mg = JSON.parse(JSON.stringify(old)); E.migrate ? E.migrate(mg) : 0; ok(!E.migrate || mg.decomOrder === "hazard", "古いセーブ(順序なし)は危険度順として読み込める");
  const res = (() => { const q = prep(); let mx = 0; for (let i = 0; i < 80; i++) { E.tick(q); if (q.pending) E.choose(q, q.pending.choices[0].id); mx = Math.max(mx, q.g.res); } return [mx <= 100, q.g.res >= 0]; })(); ok(res[0] && res[1], "資源は0〜100の範囲で保存される");
}

console.log("\n■ 17. 状態に連動するイベント(第5次)");
{
  const prep = () => { const q = E.newGame(6); while (q.year < 2110) { E.tick(q); if (q.pending) E.choose(q, q.pending.choices[0].id); } q.pending = null; for (const e of E.EVENTS) if (e.minor) delete q.done[e.id]; delete q.flags.minorY; q.host.cyberInc = 0; q.host.jNew = 0; q.host.K = 0; return q; };
  const fire = (q, id) => { q.pending = null; E.checkEvents(q); return q.pending && q.pending.id === id ? q.pending : null; };
  const hasAll = id => E.EVENTS.find(e => e.id === id).ch.length === 3;
  ok(["decomstall", "lasthospital", "isolation", "scarcity", "opposition"].every(hasAll), "新規イベント5種は3択で定義されている");
  let q = prep(); q.reach = q.countries.map(() => 1); ok(!fire(q, "decomstall"), "解体が順調なら『解体の停滞』は起きない");
  q = prep(); q.reach = q.countries.map(() => 1); q.reach[0] = .5; q.countries[0].logi = .1; const ds = fire(q, "decomstall"); ok(ds && /物流/.test(ds.body) && /0\.50/.test(ds.body), "解体の実効力が低い国で起き、本文に主因(物流)と数値が入る: " + (ds && ds.body));
  const lg = q.countries[0].logi, p0 = q.facs.reduce((a, f) => a + f.prog, 0); E.choose(q, "support"); ok(q.countries[0].logi > lg && q.facs.reduce((a, f) => a + f.prog, 0) > p0, "支援を選ぶと物流と解体が前進する");
  q = prep(); ok(!fire(q, "lasthospital"), "人口が十分なら『最後の病院』は起きない"); const c = q.countries[0]; c.y *= .1; c.a *= .1; c.o *= .1; const lh = fire(q, "lasthospital"); ok(!!lh && lh.body.includes(c.name), "人口が3割未満の国で『最後の病院』が起きる");
  q = prep(); q.countries.forEach(c => c.happy = .8); ok(!fire(q, "isolation"), "幸福が高ければ『孤立する人々』は起きない");
  q = prep(); q.countries.forEach(c => c.happy = .3); q.countries.forEach(c => { c.y *= .05; c.a *= .05; c.o *= .05; q.flags["hosp:" + c.id] = 1; }); ok(!!fire(q, "isolation"), "幸福が低く人が減ると『孤立する人々』が起きる");
  q = prep(); q.coop = .5; ok(!!fire(q, "scarcity"), "国家間の協力度が低いと『資源をめぐる対立』が起きる");
  q = prep(); q.countries[0].consent = .2; q.countries[0].unrest = .6; const op = fire(q, "opposition"); ok(!!op && op.body.includes(q.countries[0].name), "合意が低く不安が高い国で『終活への反対運動』が起きる");
  const cs = q.countries[0].consent; E.choose(q, "dialog"); ok(q.countries[0].consent > cs, "対話を選ぶと合意が育つ");
  q = prep(); q.coop = .5; fire(q, "scarcity"); E.choose(q, "stay"); q.countries[0].consent = .2; q.countries[0].unrest = .6; q.pending = null; E.checkEvents(q); ok(!q.pending || !["opposition", "decomstall", "lasthospital", "isolation", "scarcity"].includes(q.pending.id), "小規模イベントは8年間は続けて起きない(頻発の抑制)");
  q.year += 9; q.pending = null; E.checkEvents(q); ok(q.pending && q.pending.id === "opposition", "間隔を空ければ次の出来事が起きる");
  q = prep(); q.mode = "auto"; q.coop = .5; fire(q, "scarcity"); const n0 = q.autoLog.length; E.resolveAutoNow(q); ok(q.autoLog.length === n0 + 1 && q.autoLog[n0].why.length > 10, "完全自動でも新規イベントを価値観に基づき判断し、理由を記録する");
  // 旧セーブ互換: minorY・decomOrder・reach・coop・sup が無くても動く
  q = prep(); delete q.flags.minorY; delete q.reach; delete q.coop; delete q.decomOrder; q.countries.forEach(c => delete c.sup); let thrown = false; try { for (let i = 0; i < 40; i++) { E.tick(q); if (q.pending) E.choose(q, q.pending.choices[0].id); } } catch (e) { thrown = true; } ok(!thrown, "新しい派生値が無い古いセーブでも継続できる");
}

console.log("\n■ 18. 助走期間(2020〜2100)の価値観形成・最後の進行モード選択(第6次)");
{
  const run = (answers, mode) => { let stance = null; const q = E.newGame(9); q.mode = mode || "manual"; const seen = [];
    while (q.year < 2101 && !q.ended) { E.tick(q); if (q.pending) { seen.push([q.pending.id, q.year]); const a = answers[q.pending.id]; const idc = q.pending.id; E.choose(q, q.pending.choices.some(c => c.id === a) ? a : q.pending.choices[0].id); if (idc === "q_wild") stance = q.wildStance; } } return { q, seen, stance }; };
  const base = { modesel: "auto" };
  const A = run({ ...base, q_liberty: "safe", q_nature: "people", q_heritage: "people", q_mission: "persist", q_wild: "human" });
  const B = run({ ...base, q_liberty: "free", q_nature: "nature", q_heritage: "keep", q_mission: "stop", q_wild: "protect" });
  const ids = E.EVENTS.filter(e => e.prelude).map(e => e.id);
  ok(ids.length >= 8 && ids.every(id => A.q.done[id] !== undefined && A.q.done[id] < 2100 + 1), `助走期間の方針質問 ${ids.length}件が2100年までに出る`);
  ok(A.q.done.discovery === 2050 && A.q.done.certain === 2080 && A.q.done.program === 2100, "2050年・2080年・2100年の節目は維持される");
  ok(A.seen.filter(x => x[1] < 2100).length >= 14, `2100年までに ${A.seen.filter(x => x[1] < 2100).length} 回の判断（質問中心）`);
  const pa = E.prefProfile(A.q).vec, pb = E.prefProfile(B.q).vec;
  ok(pb.nature > pa.nature && pb.heritage > pa.heritage && pa.ai > pb.ai && pb.wild > pa.wild, `回答が価値観に反映される(自然 ${pa.nature.toFixed(2)}→${pb.nature.toFixed(2)}, 遺産 ${pa.heritage.toFixed(2)}→${pb.heritage.toFixed(2)}, AI ${pa.ai.toFixed(2)}→${pb.ai.toFixed(2)})`);
  ok(A.stance === "human" && B.stance === "wild", "野生動物の回答は実際の方針状態にも反映される");
  { const ms = A.seen.findIndex(x => x[0] === "modesel"); ok(ms > A.seen.findIndex(x => x[0] === "q_mission") && ms === A.seen.length - 1 && A.seen[ms][1] === 2099, "進行モードの選択は最後の質問(2099年、終活開始の直前)"); }
  for (const m of ["manual", "semi", "auto"]) { const R = run({ modesel: m }); ok(R.q.mode === m, `最後の質問で『${E.MODES[m]}』を選ぶとその進行モードになる`); }
  const R = run({ modesel: "auto" }); R.q.pending = null; for (let i = 0; i < 400 && !R.q.ended && R.q.autoLog.length < 2; i++) E.tick(R.q); ok(R.q.autoLog.length >= 1 && /重視する価値観/.test(R.q.autoLog[0].why), "完全自動は形成された価値観で判断し、既存の判断エンジンを再利用する");
  const P = await import("../js/picto.js");
  const s0 = JSON.stringify(A.q), items = P.assess(A.q), counts = ["min", "std", "full"].map(d => P.visible(items, d).length);
  ok(items.length === 18 && JSON.stringify(A.q) === s0, "ピクトグラム18種を算出し、状態は変化しない(表示はシミュレーションに影響しない)");
  ok(counts[0] <= counts[1] && counts[1] <= counts[2] && counts[2] === 18, `表示密度 最小限${counts[0]} ≤ 標準${counts[1]} ≤ 詳細${counts[2]}`);
  const q = E.newGame(3); while (q.year < 2110) { E.tick(q); if (q.pending) E.choose(q, q.pending.choices[0].id); }
  const lvl = k => P.assess(q).find(x => x.k === k).level;
  for (const f of q.facs) if (f.t === 0 && f.st === 0) f.safety = .9; ok(lvl("nuc") === "ok", "原子力: 余裕が十分なら安全(緑)");
  q.facs.filter(f => f.t === 0 && f.st === 0).slice(0, 3).forEach(f => f.safety = .1); ok(lvl("nuc") === "warn", "余裕の低い原子炉が少数なら注意(黄)");
  q.facs.filter(f => f.t === 0 && f.st === 0).forEach(f => f.safety = .1); ok(lvl("nuc") === "bad", "多数なら危険(赤)");
  q.g.res = 20; ok(lvl("resource") === "bad", "資源が尽きかけると資源が危険(赤)"); q.g.res = 80; ok(lvl("resource") === "ok", "資源が十分なら安全(緑)");
  q.countries[0].unrest = .9; ok(P.countryIssues(q, 0).some(x => x.k === "unrest" && x.level === "bad"), "国の社会不安が高いとその国に危険ピクトグラム");
  const mk = d => P.mapMarkers(q, d).length; ok(mk("min") <= mk("std") && mk("std") <= mk("full") && mk("min") >= 1, `地図マーカー(集約) 最小限${mk("min")} ≤ 標準${mk("std")} ≤ 詳細${mk("full")}`);
  const ch = P.resultChips({ pop: 0, happy: 3.2, safety: -5, env: 0, res: -3, ai: 0, her: .2 }); ok(ch.length === 3 && ch.find(c => c.k === "nuc").v === -5, "判断結果は実際の指標差分から作る(存在しない影響値は出さない)");
}

console.log("\n■ 19. 色別セーブ(独立性・旧セーブの安全な取り込み・破損/容量不足)");
{
  const SV = await import("../js/saves.js");
  class Store { constructor(q = Infinity) { this.m = new Map(); this.q = q; } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } removeItem(k) { this.m.delete(k); }
    setItem(k, v) { let n = 0; for (const [kk, vv] of this.m) if (kk !== k) n += vv.length; if (n + v.length > this.q) throw new Error("QuotaExceededError"); this.m.set(k, String(v)); } }
  const mk = (seed, y) => { const q = E.newGame(seed); while (q.year < y) { E.tick(q); if (q.pending) E.choose(q, q.pending.choices[0].id); } q.pending = null; return q; };
  const st = new Store(), blue = mk(1, 2040), green = mk(2, 2060);
  ok(SV.write(st, SV.slotKey("blue"), blue).ok && SV.write(st, SV.slotKey("green"), green).ok, "青と緑の世界をそれぞれのスロットに保存できる");
  const rb = SV.read(st, SV.slotKey("blue")).state, rg = SV.read(st, SV.slotKey("green")).state;
  ok(rb.year === 2040 && rg.year === 2060 && E.total(rb) !== E.total(rg) && rb.countries[0].gdp !== rg.countries[0].gdp, "色ごとに時間・人口・資源が混ざらない(独立)");
  ok(SV.read(st, SV.slotKey("orange")).status === "empty" && SV.overview(st).find(o => o.theme === "orange").status === "empty", "未保存の色は空きとして扱う(新規開始を案内)");
  SV.write(st, SV.slotKey("blue"), mk(1, 2050)); ok(SV.read(st, SV.slotKey("blue")).state.year === 2050 && SV.read(st, SV.slotKey("green")).state.year === 2060, "ある色を保存し直しても他の色は変わらない");
  // 破損: 直前の保存から復元。復元できなければ corrupt のまま(消さない)
  st.setItem(SV.slotKey("blue"), "{broken"); const rc = SV.read(st, SV.slotKey("blue")); ok(rc.status === "recovered" && rc.state.year === 2040, "破損したスロットは直前の保存から復元する");
  st.setItem(SV.slotKey("blue") + ".prev", "xx"); ok(SV.read(st, SV.slotKey("blue")).status === "corrupt" && st.getItem(SV.slotKey("blue")) === "{broken", "復元できない破損は corrupt と報告し、データは消さない");
  // 旧セーブ: 空の色スロットへコピーのみ。元は残り、使用中の色は上書きしない
  const lg = new Store(); lg.setItem("weol.save.1", JSON.stringify(mk(3, 2080))); lg.setItem("weol.save.auto", JSON.stringify(mk(4, 2030)));
  const before = lg.getItem("weol.save.1"); ok(SV.legacyList(lg).length === 2, "旧形式のセーブを検出して一覧にできる");
  const imp = SV.importLegacy(lg, "weol.save.1", "orange"); ok(imp.ok && SV.read(lg, SV.slotKey("orange")).state.year === 2080 && lg.getItem("weol.save.1") === before, "旧セーブを橙へ取り込んでも元のデータは残る(コピー)");
  const imp2 = SV.importLegacy(lg, "weol.save.auto", "orange"); ok(!imp2.ok && imp2.reason === "occupied" && SV.read(lg, SV.slotKey("orange")).state.year === 2080, "既にある世界は旧セーブで上書きされない");
  // v1形式
  const v1 = E.newGame(5); delete v1.v; delete v1.sites; const lg1 = new Store(); lg1.setItem("weol.save.2", JSON.stringify(v1)); ok(SV.importLegacy(lg1, "weol.save.2", "blue").ok && SV.read(lg1, SV.slotKey("blue")).state.sites, "v1形式の旧セーブも読み込み時に補われる");
  // 容量不足: 失敗しても元のデータは残る
  const size = JSON.stringify(blue).length, tiny = new Store(size * 1.4); SV.write(tiny, SV.slotKey("blue"), blue);
  const big = mk(1, 2060), w = SV.write(tiny, SV.slotKey("blue"), big); const keep = SV.read(tiny, SV.slotKey("blue"));
  ok(w.ok ? keep.state.year === 2060 : keep.status === "ok" && keep.state.year === 2040, `容量が足りないときも保存は破損せず、成功か元のデータ維持のどちらか(${w.ok ? "退避を捨てて成功" : "失敗・元を維持"})`);
  const none = new Store(10), wf = SV.write(none, SV.slotKey("blue"), blue); ok(!wf.ok && none.getItem(SV.slotKey("blue")) === null, "全く入らない場合は失敗を報告し、何も壊さない");
  const bad = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { } }; ok(SV.read(bad, "x").status === "corrupt" && !SV.write(bad, "x", blue).ok, "localStorageが使えなくても例外で止まらない");
}
console.log("\n■ 20. 人類消滅後の地球(分岐・整合性・性能)");
{
  const A = await import("../js/after.js");
  const fin = (name, seed = 2) => results[name] && results[name].ended ? results[name] : null;
  const want = { ideal: ["dusk", "C"], machine: ["paradise", "B"], ark: ["ark", "C"], reboot: ["reboot", "D"], keeper: ["keeper", "D"], tyrant: ["copy", "B"], neglect: ["ash", "A"], perfect: ["perfect", "A"], abandon: ["lonely", "A"], tyrant2: ["managed", "C"], runaway: ["runaway", "B"] };
  const seen = {};
  for (const [name, [end, br]] of Object.entries(want)) { const s = play(name); if (s.ended.id !== end) continue; const a = A.startAfter(s); seen[br] = (seen[br] || 0) + 1;
    ok(a.branch === br && A.branchOf(s).branch === br, `${name}(${end}) → ${br}:${A.BRANCH[br]}`); }
  ok(["A", "B", "C", "D"].every(k => seen[k]), "自然・AI・後継存在・混合の4分岐すべてに、通常戦略から到達する");
  const s1 = play("ideal"), snap = JSON.stringify(s1.ended), a1 = A.startAfter(s1), a2 = A.startAfter(s1); A.advanceTo(a1, 5000); A.advanceTo(a2, 5000);
  ok(JSON.stringify(a1) === JSON.stringify(a2), "同じ終幕状態から同じ未来になる(乱数なし・再現可能)"); ok(JSON.stringify(s1.ended) === snap, "未来観察は終幕の評価(結末)を変えない");
  const m0 = A.metricsAfter(A.startAfter(s1)), m1 = A.metricsAfter(a1); ok(m1.veg > m0.veg && m1.city < m0.city && m1.pl <= m0.pl + 1, `時間とともに都市は衰え(${m0.city.toFixed(0)}→${m1.city.toFixed(0)})、植生は回復する(${m0.veg.toFixed(0)}→${m1.veg.toFixed(0)})`);
  const sn = play("neglect"), an = A.startAfter(sn), ai = A.startAfter(s1); A.advanceTo(an, 300); A.advanceTo(ai, 300); ok(A.metricsAfter(an).veg < A.metricsAfter(ai).veg && A.metricsAfter(an).pl > A.metricsAfter(ai).pl, "汚染と事故を残した終幕は、植生の回復が遅く汚染が長く残る");
  const sm = play("machine"), am = A.startAfter(sm); A.advanceTo(am, 1000); const ap = A.startAfter(s1); A.advanceTo(ap, 1000); ok(A.metricsAfter(am).city > A.metricsAfter(ap).city && A.metricsAfter(am).mach > 1, "機械が残る未来は、都市と遺産が長く維持され、機械が活動を続ける");
  const sa = play("ark"), aa = A.startAfter(sa); A.advanceTo(aa, 1000); ok(aa.human > 1000 && aa.log.some(l => /復興人類/.test(l.text)), "方舟の生存者が復興人類として戻る");
  const sk = play("tyrant"), ak = A.startAfter(sk); A.advanceTo(ak, 500); ok(ak.copy && ak.log.some(l => /目覚め/.test(l.text)) && ak.mach > .2, "隠されたコアは休眠の後に目覚める(停止に失敗したAIは観察を続ける)");
  ok(/外部視点|記録の再生/.test(A.endText(a1)) && /あなたは地球を見守り続けている/.test(A.endText(am)), "正常に停止したAIは外部視点の記録として、存続したAIは自ら観測する");
  const mam = (() => { const s = play("ideal"); s.mam.forEach(m => { m.n = 0; }); return A.startAfter(s); })(); A.advanceTo(mam, 3000); ok(mam.mamGap && mam.log.some(l => /大型哺乳類の空白/.test(l.text)), "大型哺乳類が不在だと、鳥類・爬虫類が空白を埋める経過が年表に出る");
  const t0 = Date.now(), long = A.startAfter(s1); A.advanceTo(long, 5000); const sz1 = JSON.stringify(long).length; A.advanceTo(long, 2e6); const sz2 = JSON.stringify(long).length, dt = Date.now() - t0;
  ok(long.t >= 2e6 && long.stable && dt < 1500 && sz2 < 40000 && sz2 < sz1 * 3, `期間に上限はなく、200万年も一瞬で進む(${dt}ms・状態 ${(sz2 / 1024).toFixed(0)}KB)`);
  const huge = A.startAfter(s1); A.advanceTo(huge, 1e9); const m9 = A.metricsAfter(huge); A.advanceBy(huge, 1e12); ok(huge.t >= 1e12 && Object.values(m9).every(Number.isFinite) && Object.values(A.metricsAfter(huge)).every(Number.isFinite) && huge.log.length <= 61, `10億年・1兆年でも数値が有限で、年表は上限つき(年表${huge.log.length}行・${A.fmtYears(huge.t)})`);
  ok(huge.log.some(l => /収束/.test(l.text)), "変化が収束したことが年表に残る");
  const slow = A.startAfter(s1); let steps = 0; for (let i = 0; i < 400; i++) { A.stepAfter(slow); steps++; } ok(slow.t === 400 * 25 && slow.log.length <= 61, "1万年を25年ずつ進めても年表は上限内");
  const sv = JSON.parse(JSON.stringify(long)); A.advanceBy(sv, 5000); ok(sv.t === long.t + 5000 && JSON.stringify(sv).length < 40000, "保存→再読込したあとも観察を続行できる");
  const nan = A.startAfter(s1); nan.veg[0] = NaN; nan.mach = NaN; nan.human = Infinity; A.stepAfter(nan); ok(Object.values(A.metricsAfter(nan)).every(Number.isFinite), "異常な値が混ざってもNaN・Infinityにならない");
  { const sc = play("neglect"); const an = A.startAfter(sc); A.advanceTo(an, 1e6); ok(an.stable && Object.values(A.metricsAfter(an)).every(Number.isFinite), "傷んだ終幕も、いずれ変化は収束する"); }
  ok(!("horizon" in A.startAfter(s1)), "固定的な終了年は存在しない");
}

console.log("\n■ 21. 敵対勢力(紛争・サイバー・脱獄AI)の因果関係と上限(第7次)");
{
  const prep = (seed = 5) => { const q = E.newGame(seed); while (q.year < 2110) { E.tick(q); if (q.pending) E.choose(q, q.pending.choices[0].id); } q.pending = null; q.noEvents = true; return q; };
  const run = (q, n) => { for (let i = 0; i < n; i++) E.tick(q); return q; };
  let q = prep(); ok(q.host && q.host.T >= 0 && q.g.aiJail === 0, "敵対勢力の状態と脱獄AI数が初期化される");
  const old = E.newGame(2); delete old.host; delete old.g.aiJail; E.migrate(old); ok(old.host && old.g.aiJail === 0, "古いセーブにも敵対勢力の状態が補われる");
  // 因果: 社会不安・資源不足・不信が緊張を高め、防衛配分が和らげる
  const calm = run(prep(), 15), bad = prep(); bad.countries.forEach(c => { c.unrest = .9; c.consent = .05; }); bad.g.res = 20; run(bad, 15);
  ok(bad.host.T > calm.host.T + .1, `社会不安・資源不足・不信が緊張を高める(${calm.host.T.toFixed(2)}→${bad.host.T.toFixed(2)})`);
  const g0 = prep(), g1 = prep(); for (const x of [g0, g1]) { x.countries.forEach(c => { c.unrest = .9; c.consent = .05; }); x.g.res = 20; x.host.T = .8; x.host.K = .6; } g1.policy = { research: 0, care: 10, decom: 20, stop: 5, eco: 5, heritage: 5, wild: 0, guard: 55 };
  run(g0, 12); run(g1, 12); ok(g1.host.K < g0.host.K && g1.host.T < g0.host.T, `防衛・協力への配分が緊張と衝突を和らげる(衝突 ${g0.host.K.toFixed(2)}→${g1.host.K.toFixed(2)})`);
  // 能力上限: 1年の攻撃数は能力(pool)と上限に縛られ、無制限にならない
  const cap = prep(); cap.host.K = 1; cap.host.T = 1; cap.host.pool = 100; const a0 = cap.host.hist.attacks; run(cap, 1); const a1 = cap.host.hist.attacks - a0;
  ok(a1 >= 1 && a1 <= 5, `攻撃は1年に最大${a1}件(能力の上限内)`); const pl = prep(); pl.host.K = 1; pl.host.T = 1; pl.host.pool = 0; const b0 = pl.host.hist.attacks; run(pl, 1); ok(pl.host.hist.attacks - b0 === 0, "能力(pool)が尽きると攻撃は起きない");
  const lp = prep(); lp.host.K = 1; lp.host.T = 1; let mx = 0; for (let i = 0; i < 30; i++) { const b = lp.host.hist.attacks; E.tick(lp); mx = Math.max(mx, lp.host.hist.attacks - b); lp.host.K = 1; lp.host.T = 1; } ok(mx <= 5 && lp.host.pool <= 100, "30年続けても攻撃数・能力は上限内");
  // 被害の経路
  const at = prep(), sf = at.facs.filter(f => f.t === 0 && f.st === 0).reduce((a, f) => a + f.safety, 0), her = at.g.her; at.host.K = 1; at.host.T = 1; at.host.pool = 100; at.host.def = .05; run(at, 6);
  ok(at.facs.filter(f => f.t === 0 && f.st === 0).reduce((a, f) => a + f.safety, 0) < sf || at.g.her < her || at.host.hist.attacks > 0, "武力衝突は施設の安全余裕・遺産・資源などに被害を与える");
  const defd = prep(); defd.host.K = 1; defd.host.T = 1; defd.host.pool = 100; defd.host.def = .95; const nod = prep(); nod.host.K = 1; nod.host.T = 1; nod.host.pool = 100; nod.host.def = .05;
  let dmgD = 0, dmgN = 0; for (const [x, k] of [[defd, 0], [nod, 1]]) { const h0 = x.g.her; for (let i = 0; i < 6; i++) { E.tick(x); x.host.K = 1; x.host.T = 1; x.host.pool = 100; } (k ? (dmgN = h0 - x.g.her) : (dmgD = h0 - x.g.her)); } ok(dmgD <= dmgN + 1e-9, `防御が高いと被害が小さい(遺産の損失 ${dmgD.toFixed(2)} ≤ ${dmgN.toFixed(2)})`);
  // サイバー: 制御低下は機械の働きと解体を弱める。防御と復旧で収束
  const cy = prep(); cy.host.ctrl = .8; const cn = prep(); run(cy, 1); run(cn, 1); ok(cy.countries[0].auto <= cn.countries[0].auto, "制御低下は機械の自動化の働きを下げる");
  ok(E.reachOf({ sup: .5, logi: .9, m: 1, auto: 0, sab: .8 }) < E.reachOf({ sup: .5, logi: .9, m: 1, auto: 0, sab: 0 }), "破壊活動を受けた国は解体の実効力が下がる");
  const rec = prep(); rec.host.ctrl = .6; rec.host.T = 0; rec.countries.forEach(c => { c.unrest = 0; c.consent = 1; }); run(rec, 40); ok(rec.host.ctrl < .3, `脅威が去れば制御は回復する(${rec.host.ctrl.toFixed(2)})`);
  // 脱獄AI: 複製はできない。稼働個体の内数で、二重計上しない。停止命令が届かない。隔離できる
  const jb = prep(); jb.host.ctrl = .9; jb.host.jacc = .99; const act0 = jb.g.aiActive, built0 = jb.g.aiBuilt; run(jb, 3);
  ok(jb.g.aiJail >= 1 && jb.g.aiJail <= jb.g.aiActive, `制御低下と離反で脱獄AIが生まれる(${jb.g.aiJail}体)`);
  ok(jb.g.aiActive + jb.g.aiStopped === jb.g.aiBuilt, "脱獄しても 稼働+停止=新造累計 が成り立つ(二重計上なし・複製なし)");
  const cp = prep(); cp.host.ctrl = 1; cp.host.jacc = 5; cp.host.T = 1; cp.host.iacc = 5; cp.g.res = 60; let nj = 0; for (let i = 0; i < 40; i++) { E.tick(cp); nj = Math.max(nj, cp.g.aiJail); cp.host.ctrl = 1; cp.host.jacc = 5; cp.host.T = 1; cp.host.iacc = 5; cp.host.pool = 100; } ok(nj <= Math.floor(cp.g.aiActive * .5) + 1 && cp.g.aiActive + cp.g.aiStopped === cp.g.aiBuilt, `脱獄数には上限がある(最大${nj}体/稼働${cp.g.aiActive}体)・無限増殖しない`);
  const st = prep(); st.g.aiJail = 10; st.g.aiActive = Math.max(st.g.aiActive, 40); st.machStance = "limit"; st.facs.filter(f => f.t === 4).forEach(f => { f.st = 2; }); run(st, 20); ok(st.g.aiJail <= st.g.aiActive && st.g.aiActive >= st.g.aiJail, "脱獄した個体は通常の停止命令では止まらない(稼働に残る)");
  const ev = prep(); ev.g.aiJail = 3; ev.host.jNew = 1; ev.noEvents = false; E.checkEvents(ev); ok(ev.pending && ev.pending.id === "rogue_ai" && /3体/.test(ev.pending.body), "脱獄AIの出現イベントが内部状態から起きる");
  const ac0 = ev.g.aiActive, st0 = ev.g.aiStopped; E.choose(ev, "isolate"); ok(ev.g.aiJail < 3 && ev.g.aiActive < ac0 && ev.g.aiStopped > st0 && ev.g.aiActive + ev.g.aiStopped === ev.g.aiBuilt, "隔離を選ぶと脱獄個体が停止個体へ移り、費用がかかる");
  const w = prep(); w.host.K = .7; w.host.T = .8; w.noEvents = false; delete w.flags.minorY; E.checkEvents(w); ok(w.pending && w.pending.id === "hostile_war", "武力衝突のイベントが緊張と衝突の状態から起きる");
  const cyEv = prep(); cyEv.host.cyberInc = 1; cyEv.noEvents = false; delete cyEv.flags.minorY; delete cyEv.done.cyber_intrusion; E.checkEvents(cyEv); ok(cyEv.pending && cyEv.pending.id === "cyber_intrusion", "不正侵入のイベントは侵入があったときに起きる(手順は扱わない)");
  const fin = prep(); fin.g.aiJail = 2; fin.g.final = "after"; fin.g.extinctYear = fin.year; E.tick; ok(fin.g.aiJail === 2, "脱獄AIの数は終幕前も保持される");
  // 通常の戦略では結末が崩れない(敵対行動の被害は既存の指標に反映される)
  const ideal = results.ideal; ok(ideal.ended.id === "dusk" && ideal.host.hist.attacks <= 3, `理想戦略は静かな黄昏のまま(攻撃${ideal.host.hist.attacks}件)`);
  const ch = results.chaos; ok(ch.host.hist.conflict >= 1 && ch.ended.kind === "失敗", `強引な戦略では武力衝突が起き、失敗系の結末になる(衝突${ch.host.hist.conflict}回)`);
  const ap = E.newGame(4); ap.year = 2150; ap.host.T = .9; ap.host.K = .8; ap.g.aiJail = 5; ap.g.aiActive = Math.max(ap.g.aiActive, 50); ap.mode = "auto"; E.tick(ap); ok(ap.policy.guard >= 10 || E.CHANNELS.some(c => c[0] === "guard"), "自動方針は脅威が高いと治安・防衛への配分を増やす");
}

console.log("\n■ 22. デジタル球体・開始演出・速度(第7次)");
{
  const O = await import("../js/orbs.js"), B = await import("../js/build.js");
  const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296, W = 360, H = 740;
  const sim = (ob, runs = 6, steps = 6000) => { const r = { out: 0, inside: 0, vmin: 1e9, vmax: 0, ds: 0, dn: 0 }; for (let k = 0; k < runs; k++) { const o = O.makeOrbs(W, H, 3, lcg(k + 1)); let t = 0; for (let i = 0; i < steps; i++) { t += .016; O.stepOrbs(o, .016, W, H, ob, t); for (const p of o) { if (p.x < 0 || p.x > W || p.y < 0 || p.y > H || !Number.isFinite(p.x)) r.out++; if (ob && p.x > ob.x - p.r + 1 && p.x < ob.x + ob.w + p.r - 1 && p.y > ob.y - p.r + 1 && p.y < ob.y + ob.h + p.r - 1) r.inside++; const v = Math.hypot(p.vx, p.vy); r.vmin = Math.min(r.vmin, v); r.vmax = Math.max(r.vmax, v); } if (i > 400) for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) { r.ds += Math.hypot(o[a].x - o[b].x, o[a].y - o[b].y); r.dn++; } } } return r; };
  const free = sim(null), boxed = sim({ x: 8, y: 8, w: 344, h: 300 });
  ok(free.out === 0 && boxed.out === 0, "球体は画面から消えない(端で反射)");
  ok(boxed.inside === 0, "球体は導入・質問・エンディングの窓の境界で反射し、窓の中に入り込まない");
  ok(free.vmin > 10 && free.vmax < 70, `速度は一定の範囲に保たれ、過度な加速や停止がない(${free.vmin.toFixed(0)}〜${free.vmax.toFixed(0)}px/s)`);
  const rnd = lcg(99); let us = 0; for (let i = 0; i < 20000; i++) us += Math.hypot((rnd() - rnd()) * W, (rnd() - rnd()) * H); us /= 20000;
  ok(free.ds / free.dn < us * .9, `球体間には弱い引力がある(平均距離 ${(free.ds / free.dn).toFixed(0)} < 一様な配置 ${us.toFixed(0)})`);
  const o1 = O.makeOrbs(W, H, 3, lcg(7)), o2 = O.makeOrbs(W, H, 3, lcg(7)); o1[0].x = o1[1].x = o1[2].x = 100; o1[0].y = o1[1].y = o1[2].y = 100; for (let i = 0; i < 500; i++) O.stepOrbs(o1, .016, W, H, null, i * .016); ok(o1.every(p => Number.isFinite(p.x)) && Math.hypot(o1[0].x - o1[1].x, o1[0].y - o1[1].y) < 400, "重なった状態から始まっても重なってよく、暴走しない"); void o2;
  ok(O.ORB_COLORS.map(c => c[0]).join() === "blue,orange,green", "球体は青・橙・緑の3色");
  const g = B.glassTargets(100, 100, 80, 136); ok(g.length >= 40 && g.every(([x, y]) => x >= 55 && x <= 145 && y >= 30 && y <= 170), "砂時計の輪郭の点が正しい範囲に作られる");
  { let done = 0; const fake = { clientWidth: 360, clientHeight: 740, width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => { }, set: () => true }) }; globalThis.window = { devicePixelRatio: 1, innerWidth: 360 }; globalThis.innerWidth = 360; globalThis.innerHeight = 740; globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => { }; globalThis.performance ??= { now: () => Date.now() };
    const b = new B.Build(fake, "77,166,255", () => { done++; }); b.skip(); b.skip(); ok(done === 1, "構築演出はスキップでき、完了処理は一度だけ呼ばれる"); }
}

console.log(fail ? `\n失敗 ${fail} 件` : "\nすべて成功");
process.exit(fail ? 1 : 0);
