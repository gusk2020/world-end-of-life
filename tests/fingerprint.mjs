// 整理の前後で結果が1ビットも変わらないことの確認: 固定シードの状態を要約(FNV)して出力する。 node tests/fingerprint.mjs > out.txt
import * as E from "../js/engine.js";
const fnv = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
const choose = (s) => { const c = s.pending.choices.find(x => x.id === "manual") || s.pending.choices[0]; E.choose(s, c.id); };
const CHECK = [2100, 2200, 2400, 3000];
for (const mode of ["legacy", "tri"]) for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const s = E.newGame(seed); s.mode = seed % 2 ? "auto" : "manual"; const out = []; let init = false;
  while (!s.ended && s.year < 6500) {
    if (mode === "tri" && s.year === 2099 && !init) { init = true; E.initTriad(s, ["blue", "green", "orange"][seed % 3]); }
    E.tick(s); if (s.pending) choose(s);
    if (CHECK.includes(s.year)) out.push(s.year + ":" + fnv(JSON.stringify(s)));
  }
  console.log(mode, seed, s.year, s.ended && s.ended.id, out.join(" "), "end:" + fnv(JSON.stringify(s)));
}
