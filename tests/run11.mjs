// 第11次の追加テスト(固定シード)。 node tests/run11.mjs
import * as E from "../js/engine.js";
import * as T from "../js/triad.js";
let fail = 0, pass = 0; const ok = (c, m) => { if (!c) { fail++; console.log("  ✗ " + m); } else { pass++; console.log("  ✓ " + m); } };
const choose = (s) => { const c = s.pending.choices.find(x => x.id === "manual") || s.pending.choices[0]; E.choose(s, c.id); };
const run = (seed, until = 2400, color = ["blue", "green", "orange"][seed % 3]) => { const s = E.newGame(seed); s.mode = "auto"; while (!s.ended && s.year < until) { if (s.year === 2099 && !s.tri) E.initTriad(s, color); E.tick(s); if (s.pending) choose(s); } return s; };
const SEEDS = [1, 2, 3, 4, 5, 6], W = SEEDS.map(sd => run(sd));

console.log("■ 因果の記録(原因→行動→結果)");
{
  const all = W.flatMap(s => s.tri.cause || []);
  ok(all.length > 300, `6つの世界で因果記録が十分に残る(${all.length}件)`);
  ok(all.every(c => c.why && c.did && c.imm && !/undefined|NaN|\[object/.test(T.causeText(c))), "すべての記録に原因・行動・結果があり、undefined/NaN を含まない");
  const kinds = new Set(all.map(c => c.kind)); ok(["slip", "sanction", "liab", "tech", "recover"].every(k => kinds.has(k)), `崩壊・制裁・負債の移管・技術・持ち直しの記録が出る(${[...kinds].join(",")})`);
  const fol = all.filter(c => c.fol); ok(fol.length > 100 && fol.every(c => /実際/.test(c.fol) && !/NaN/.test(c.fol)), `数年後の実際の変化が書き足される(${fol.length}件)`);
  // 記録の「結果」は状態から作られる: 崩壊の記録は、その年に実際に崩壊(slips)があった
  let consistent = 0, total = 0; for (const s of W) for (const c of (s.tri.cause || []).filter(c => c.kind === "slip")) { total++; const sl = s.tri.eq[c.ai].slips; if (sl.some(x => x.y === c.y) || (sl.length >= 12 && c.y < sl[0].y)) consistent++; }
  ok(consistent === total, `崩壊の記録は実際の崩壊(状態)と一致(${consistent}/${total})`);
  const top = T.triCauses(W[0], 5, 80); ok(top.length > 0 && top.every((c, i) => i === 0 || (top[i - 1].imp - (W[0].year - top[i - 1].y) * .03) >= (c.imp - (W[0].year - c.y) * .03) - 1e-9), "重要度順に並ぶ");
  const a = run(7, 2300), b = run(7, 2300); ok(JSON.stringify(a.tri.cause) === JSON.stringify(b.tri.cause), "同じシードなら因果記録も同じ(再現できる)");
  ok(W.every(s => s.tri.cause.length <= 240), "記録の数は上限で抑えられる");
}
console.log("\n■ 均衡の体験(早い小さな危機・持ち直し・損失)");
{
  const early = W.map(s => s.tri.cause.filter(c => c.kind === "slip" && c.y < 2200).length);
  ok(early.filter(n => n >= 5).length >= 5, `どの世界でも2200年までに小さな崩壊が複数起きる(${early.join(",")})`);
  const rec = W.map(s => s.tri.cause.filter(c => c.kind === "recover").length); ok(rec.filter(n => n >= 1).length >= 5, `ほとんどの世界で持ち直しが起きる(${rec.join(",")})`);
  let okPk = true, partial = 0; for (const s of W) for (const e of s.tri.eq) for (let k = 0; k < 6; k++) { if (e.l[k] < -1e-12 || e.l[k] > .5 + 1e-9) okPk = false; if (e.pk[k] > 0 && e.l[k] < e.pk[k] - 1e-6) partial++; if (e.l[k] < e.pk[k] * .6 - 1e-9) okPk = false; }
  ok(okPk && partial > 0, `失った余力は一部だけ戻り、ピークの6割を下回らない(一部回復した部分 ${partial})`);
  const big = W.map(s => s.tri.eq.flatMap(e => e.slips).filter(x => x.sg >= .5).length); ok(big.every(n => n >= 1), `大きな崩壊も世界ごとに起こり方が違う(${big.join(",")})`);
  ok(new Set(W.map(s => s.tri.stat.slips)).size >= 4, "崩壊の回数は世界ごとに違い、固定の台本ではない");
  const lost = W.map(s => s.tri.eq.reduce((p, e) => p + e.l.reduce((a, b) => a + b, 0), 0)); ok(lost.every(x => x > .3), `戻らない損失が残る(${lost.map(x => x.toFixed(2)).join(",")})`);
}
console.log("\n■ 崩壊は乱数の連発ではなく、負荷・予備に基づく");
{
  // 予備(配分の蓄え)が厚い方針は、同じ世界で崩壊が少ない
  const pol = (hi) => (s) => { const p = { research: 5, care: 5, decom: 5, stop: 5, eco: 5, heritage: 5, wild: 5, guard: 5, disarm: 0, consol: 0 }; Object.assign(p, hi); s.policy = p; };
  const go = (seed, hi) => { const s = E.newGame(seed); s.mode = "manual"; while (!s.ended && s.year < 2350) { if (s.year === 2099 && !s.tri) E.initTriad(s, "blue"); if (s.year >= 2100) pol(hi)(s); E.tick(s); if (s.pending) choose(s); } return s.tri.eq[0].n; };
  const thick = [1, 2, 3, 4].map(sd => go(sd, { guard: 30, care: 30, consol: 10, disarm: 10 })), thin = [1, 2, 3, 4].map(sd => go(sd, { research: 55, heritage: 25 }));
  const sum = a => a.reduce((x, y) => x + y, 0); ok(sum(thick) <= sum(thin), `予備に配分した方針は、そうでない方針より崩壊が少ない(${sum(thick)} ≤ ${sum(thin)})`);
  const s = run(2, 2300); const st = s.tri; for (const e of st.eq) ok(e.slips.every(x => x.sg > 0) && e.n >= e.slips.length, "崩壊の大きさは正で、記録と回数が合う");
}
console.log("\n■ 旧セーブ・単一AIとの互換");
{
  const s = E.newGame(5); s.mode = "auto"; while (s.year < 2300 && !s.ended) { E.tick(s); if (s.pending) choose(s); }
  ok(s.tri === null || s.tri === undefined, "3AIを始めない世界はそのまま動く(因果記録なし)");
  const j = JSON.parse(JSON.stringify(W[1])); delete j.tri.cause; const m = E.migrate(j); let y0 = m.year; for (let i = 0; i < 60 && !m.ended; i++) { E.tick(m); if (m.pending) choose(m); }
  ok(m.year > y0 && (m.tri.cause || []).every(c => !/NaN/.test(T.causeText(c))), "因果記録のない保存データも読み込んで進められる");
  const bad = W.filter(s => JSON.stringify(s.tri).includes("NaN") || s.tri.eq.some(e => e.x.some(v => !(v >= 0)) || e.l.some(v => !(v >= 0)))); ok(bad.length === 0, "均衡の値に負やNaNが出ない");
  ok(W.every(s => s.tri.res.every(v => v >= 0 && v <= 100)), "資源が範囲内");
}
console.log(`\n成功 ${pass} / 失敗 ${fail}`); process.exit(fail ? 1 : 0);
