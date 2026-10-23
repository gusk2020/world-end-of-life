// エンジンの1年あたりの計算時間を測る: node tests/bench/tick.mjs
import * as E from "../../js/engine.js";
const s = E.newGame(1); while (s.year < 2102) { E.tick(s); if (s.pending) E.choose(s, s.pending.choices[0].id); }
s.noEvents = true; s.pending = null; const N = 300; const t0 = performance.now(); for (let i = 0; i < N; i++) E.tick(s); const dt = (performance.now() - t0) / N;
console.log(JSON.stringify({ msPerTick: +dt.toFixed(3), maxYearsPerSecAt100pctCPU: Math.round(1000 / dt), year: s.year }));
