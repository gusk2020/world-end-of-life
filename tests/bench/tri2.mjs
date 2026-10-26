// 3AI体制と単一AIの1年あたりの時間(固定シード、複数回の中央値): node tests/bench/tri2.mjs [tri|legacy]
import * as E from "../../js/engine.js";
const mode = process.argv[2] || "tri", res = [];
for (let r = 0; r < 5; r++) { const s = E.newGame(1 + r); s.mode = "auto"; while (s.year < 2099) { E.tick(s); if (s.pending) E.choose(s, s.pending.choices[0].id); } if (mode === "tri") E.initTriad(s, "blue"); s.noEvents = true; s.pending = null; for (let i = 0; i < 40; i++) E.tick(s); const N = 400, t0 = performance.now(); for (let i = 0; i < N; i++) { E.tick(s); if (s.pending) s.pending = null; } res.push((performance.now() - t0) / N); }
res.sort((a, b) => a - b); console.log(mode, "ms/年 中央値", res[2].toFixed(3), "全", res.map(x => x.toFixed(2)).join(" "));
