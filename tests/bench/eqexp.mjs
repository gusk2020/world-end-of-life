// 均衡の体験: 初期の小さな危機・持ち直し・逆転・因果記録の数を、固定シードで測る。 node tests/bench/eqexp.mjs [シード数]
import * as E from "../../js/engine.js";
const N = +process.argv[2] || 8, rows = [];
for (let seed = 1; seed <= N; seed++) {
  const s = E.newGame(seed); s.mode = "auto"; let init = false;
  while (!s.ended && s.year < 2500) { if (s.year === 2099 && !init) { init = true; E.initTriad(s, ["blue", "green", "orange"][seed % 3]); } E.tick(s); if (s.pending) E.choose(s, s.pending.choices.find(x => x.id === "manual")?.id || s.pending.choices[0].id); }
  const T = s.tri, cs = T.cause || [], by = k => cs.filter(c => c.kind === k).length;
  const slips = T.eq.flatMap(e => e.slips), early = cs.filter(c => c.kind === "slip" && c.y < 2200).length, mg = Math.round(T.stat.migrants / 1e4), bigE = slips.filter(x => x.sg >= .5).length;
  const lost = T.eq.map(e => e.l.reduce((a, b) => a + b, 0).toFixed(2)).join("/");
  rows.push({ seed, y: s.year, slips: slips.length, early200: early, big: bigE, causes: cs.length, slipC: by("slip"), rec: by("recover"), mig: by("migrate"), migW: mg, aid: by("aid"), sanc: by("sanction"), inv: by("invade"), liab: by("liab"), tech: by("tech"), audit: by("audit"), veto: by("veto"), fol: cs.filter(c => c.fol).length, lost });
}
console.table(rows);
