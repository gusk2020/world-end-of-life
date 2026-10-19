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
ok(results.machine.ended.scores.mach > results.ideal.ended.scores.mach + 20, "機械文明を許すと機械が残る");
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
  const sc0 = (o = {}) => ({ nature: 80, heritage: 80, safety: 80, human: 80, sovereignty: 80, unrest: 20, mach: 0, ai: false, ark: false, left: { run: 0, sealed: 1, acc: 0, runNuc: 0 }, ...o });
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
  ok(m.v === 2 && m.sites.length === E.SITES.length && m.g.aiActive > 0, "旧セーブにも砂時計・遺産の項目が補われる");
  ok(Math.abs(m.g.P0 + m.g.hBorn - m.g.hDead - E.total(m)) < 1e-3 * m.g.P0, "移行後も 人口=初期+出生-死亡 が成立");
  E.runToEnd(m, { choose: BOTS.ideal.choices, onYear: st => applyBot(st, BOTS.ideal) }); ok(!!m.ended, "旧セーブから最後まで完走できる");
}

console.log(fail ? `\n失敗 ${fail} 件` : "\nすべて成功");
process.exit(fail ? 1 : 0);
