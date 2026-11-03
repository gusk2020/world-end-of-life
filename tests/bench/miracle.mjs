// 人類存続の「奇跡的成功」の発生率を、固定シードで数える。 node tests/bench/miracle.mjs <戦略名> <開始シード> <個数>
//  戦略: default(均衡の初期配分) / research(研究重視・遮蔽なし) / seeker(研究+集約+軍縮+支援。成功を狙う最適化) 
import * as E from "../../js/engine.js";
const STRATS = {
  default: { pol: { research: 15, care: 25, decom: 25, stop: 10, eco: 15, heritage: 10, wild: 8, guard: 0 } },
  research: { pol: { research: 50, care: 15, decom: 15, stop: 5, eco: 10, heritage: 5, wild: 0, guard: 5 } },
  seeker: { pol: { research: 30, care: 30, consol: 20, disarm: 15, eco: 5, guard: 5, decom: 0, stop: 0, heritage: 5, wild: 0 } },
};
const [name = "seeker", from = 1, n = 10] = [process.argv[2], +process.argv[3], +process.argv[4]];
const st = STRATS[name]; let ok = 0; const kinds = {}, years = [];
for (let sd = from; sd < from + n; sd++) {
  const s = E.newGame(sd);
  while (!s.ended && s.year < 6800) { E.tick(s); if (s.pending) { const c = s.pending.choices.find(x => x.id === "manual") || s.pending.choices[0]; E.choose(s, c.id); }
    if (s.year === 2100) { s.policy = { ...st.pol }; s.hostPolicy = { defense: "strong", diplomacy: "dialogue", cyber: "high" }; } }
  if (s.flags.miracle) { ok++; kinds[s.flags.miracle.kind] = (kinds[s.flags.miracle.kind] || 0) + 1; years.push(s.flags.miracle.year); }
}
console.log(JSON.stringify({ strategy: name, seeds: [from, from + n - 1], runs: n, miracles: ok, kinds, years }));
