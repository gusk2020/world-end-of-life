// 結末の到達分布と主要指標: node tests/dist.mjs [seeds]  (難易度調整の前後比較用)
import * as E from "../js/engine.js";
import { BOTS, applyBot } from "./bots.mjs";
const N = +process.argv[2] || 4, tally = {}, per = {};
for (const name of Object.keys(BOTS)) for (let seed = 1; seed <= N; seed++) {
  const bot = BOTS[name], s = E.newGame(seed); E.runToEnd(s, { choose: bot.choices, onYear: st => applyBot(st, bot) }, 2500);
  const e = s.ended, id = e ? e.id : "none"; tally[id] = (tally[id] || 0) + 1; (per[name] ||= []).push(id);
  const sc = e && e.scores; (per[name].m ||= []).push(sc ? [sc.safety, sc.human, s.g.accidents] : [0, 0, 0]);
}
console.log("結末分布:", JSON.stringify(tally));
for (const [n, a] of Object.entries(per)) { const m = a.m, av = i => (m.reduce((p, x) => p + x[i], 0) / m.length).toFixed(0); console.log(n.padEnd(12), [...new Set(a)].join(","), `安全${av(0)} 人間${av(1)} 事故${av(2)}`); }
