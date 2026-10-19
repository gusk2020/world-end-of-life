// 自動完走・分岐テスト: node tests/run.mjs
import * as E from "../js/engine.js";
import { BOTS, applyBot } from "./bots.mjs";

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

console.log(fail ? `\n失敗 ${fail} 件` : "\nすべて成功");
process.exit(fail ? 1 : 0);
