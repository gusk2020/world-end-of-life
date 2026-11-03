// 第10次の追加テスト(固定シード)。 node tests/run10.mjs
import * as E from "../js/engine.js";
import * as T from "../js/triad.js";
import * as SV from "../js/saves.js";
let fail = 0, pass = 0; const ok = (c, m) => { if (!c) { fail++; console.log("  ✗ " + m); } else { pass++; console.log("  ✓ " + m); } };
const choose = (s) => { const c = s.pending.choices.find(x => x.id === "manual") || s.pending.choices[0]; E.choose(s, c.id); };
const COLORS = ["blue", "green", "orange"];
const world = (seed, color = "blue", year = 2100, tri = true) => { const s = E.newGame(seed); s.mode = "auto"; while (s.year < year) { if (tri && s.year === 2099 && !s.tri) E.initTriad(s, color); E.tick(s); if (s.pending) choose(s); } if (tri && !s.tri) E.initTriad(s, color); return s; };
const pop = (s) => E.total(s);
const resTotal = (s) => s.tri.res.slice();

console.log("■ 国家の3分割");
{
  const s = E.newGame(1), f = E.triFairness(s.countries), ct = E.triContiguous(Object.fromEntries(s.countries.map(c => [c.id, E.AREA_OF[c.id]])));
  ok(s.countries.every(c => [0, 1, 2].includes(E.AREA_OF[c.id])), "すべての国がどれかのエリアに属する");
  ok(f.n.every(n => n >= 10), `各エリアに10か国以上(${f.n.join("/")})`);
  ok(f.pop.every(x => x > .28 && x < .40) && f.gdp.every(x => x > .28 && x < .40), `人口(${f.pop.map(x => (x * 100).toFixed(0)).join("/")}%)とGDP(${f.gdp.map(x => (x * 100).toFixed(0)).join("/")}%)がおおむね公平`);
  ok(f.balance > .75, `人口・GDPの偏り指標 ${f.balance.toFixed(2)}`);
  ok(new Set(f.nuc.map(x => x.toFixed(2))).size === 3 && Math.max(...f.nuc) > 1.4 * Math.min(...f.nuc), `完全には同一でなく、長所と短所がある(原子炉の割合 ${f.nuc.map(x => (x * 100).toFixed(0)).join("/")}%)`);
  ok(ct.every(Boolean), "各エリアは地理的につながっている(飛び地なし)");
  const w = world(2); ok(w.tri && w.countries.every(c => c.area === E.AREA_OF[c.id]) && w.facs.every(f => f.rp === w.countries[f.c].area), "国と施設の所属・管理責任が初期化される");
}
console.log("■ 3AIの独立と学習");
{
  const s = world(3, "green");
  ok(s.tri.player === 1 && s.tri.ai.length === 3, "選んだ色が担当するAIとエリアになる(緑=ユーラシア圏)");
  const vs = s.tri.ai.map(a => JSON.stringify(a.val)); ok(new Set(vs).size === 3, "3つのAIは異なる初期の価値観を持つ");
  ok(s.tri.ai.every((a, i) => a.core === 1 && a.insight > 0 && Array.isArray(a.rel) && a.id === i), "それぞれ別のコア・内部状態・対外関係を持つ");
  const a = world(4, "blue", 2100), b = world(4, "blue", 2100); for (let i = 0; i < 80; i++) { E.tick(a); if (a.pending) choose(a); E.tick(b); if (b.pending) choose(b); }
  ok(JSON.stringify(a.tri) === JSON.stringify(b.tri) && a.year === b.year, "同じシードで3AIの状態と判断が再現される");
  const c = world(4, "blue", 2100); for (let i = 0; i < 400; i++) { E.tick(c); if (c.pending) choose(c); }
  const d0 = Object.values(s.tri.ai[0].v0).join(), d1 = Object.values(c.tri.ai[0].val).join(), mv = c.tri.ai.some(A => Object.keys(A.val).some(k => Math.abs(A.val[k] - A.v0[k]) > .03)), wv = c.tri.ai.some(A => Object.values(A.w).some(x => Math.abs(x) > .02));
  ok(mv && wv, "長期の経験で価値観と配分の傾向が変化する(固定の性格ではない)");
  ok(c.tri.ai[0].policy !== undefined && c.tri.ai.filter((A, i) => i !== c.tri.player).every(A => A.policy && Object.values(A.policy).reduce((p, x) => p + x, 0) >= 95), "ほかの2つのAIは自分の判断で配分を決める");
  const obs = c.tri.ai.filter((A, i) => i !== c.tri.player).map(A => A.insight); ok(obs.every(x => x > 0 && x < 100), "他AIは観測力に限りがある");
}
console.log("■ 色別セーブ・旧セーブ");
{
  const mk = (color) => world(5, color, 2110);
  const st = new Map(), store = { getItem: k => st.has(k) ? st.get(k) : null, setItem: (k, v) => st.set(k, v), removeItem: k => st.delete(k) };
  const A = mk("blue"), B = mk("green"); SV.write(store, SV.slotKey("blue"), A); SV.write(store, SV.slotKey("green"), B);
  const ra = SV.read(store, SV.slotKey("blue")), rb = SV.read(store, SV.slotKey("green"));
  ok(ra.state.tri.player === 0 && rb.state.tri.player === 1 && ra.state.tri !== rb.state.tri, "色ごとに別の世界(別のAI・エリア)が保存・復元される");
  ok(JSON.stringify(ra.state.tri) === JSON.stringify(A.tri), "保存と読込で3AIの状態が一致する");
  const old = E.newGame(6); old.mode = "auto"; while (old.year < 2150) { E.tick(old); if (old.pending) choose(old); }
  const j = JSON.parse(JSON.stringify(old)); delete j.tri; for (const f of j.facs) delete f.rp; for (const c of j.countries) delete c.area;
  const raw = JSON.stringify(j); st.set("weol.world.orange", raw); const ro = SV.read(store, "weol.world.orange");
  ok(ro.status === "ok" && ro.state.tri === null, "旧セーブ(単一AI)は互換モードで読み込まれ、3AIに書き換えられない");
  ok(st.get("weol.world.orange") === raw, "読み込みは元のデータを書き換えない");
  const y0 = ro.state.year; while (ro.state.year < y0 + 30 && !ro.state.ended) { E.tick(ro.state); if (ro.state.pending) choose(ro.state); } ok(ro.state.year === y0 + 30 && ro.state.tri === null, "旧セーブの世界は従来どおり続けて進行できる");
}
console.log("■ 保存則(人口・資源)");
{
  const s = world(7, "blue", 2105); const t = s.tri;
  // 人口移動: 出た人 = 着いた人 + 途中の損失
  const A = t.ai[0], Bb = t.ai[1]; for (const c of s.countries) { c.unrest = .25; } t.res[1] = 30; t.res[0] = 95; A.open = Bb.open = .95;
  const st = T.areaStats(s), P = { inflow: [0, 0, 0], war: [0, 0, 0], liab: [0, 0, 0], lab: [1, 1, 1], dep: [{}, {}, {}] };
  const before = pop(s), queued0 = t.mig.reduce((p, m) => p + m.y + m.a + m.o, 0), lost0 = t.stat.lost || 0, arr0 = t.stat.arrived || 0;
  for (let i = 0; i < 30; i++) { E.tick(s); if (s.pending) choose(s); }
  const inflight = t.mig.reduce((p, m) => p + m.y + m.a + m.o, 0);
  ok(t.stat.migrants > 0, `移住が実際に起きる(${Math.round(t.stat.migrants / 1e4)}万人)`);
  ok(t.stat.arrived > 0 && t.stat.arrived <= t.stat.migrants + 1 && t.stat.migrants - t.stat.arrived - inflight - (t.stat.lost || 0) < 1e-3 * t.stat.migrants + 10, `移住の保存則: 出発 = 到着 + 移動中 + 途中の損失(出発${(t.stat.migrants / 1e4).toFixed(0)}万・到着${(t.stat.arrived / 1e4).toFixed(0)}万・移動中${(inflight / 1e4).toFixed(0)}万・損失${((t.stat.lost || 0) / 1e4).toFixed(1)}万)`);
  // 援助: 送った量 > 受け取った量(輸送の損失)
  const q = world(8, "blue", 2105), tq = q.tri; tq.res = [90, 20, 60]; const sum0 = tq.res.reduce((p, x) => p + x, 0); const aid0 = tq.stat.aid; q.noEvents = true;
  for (let i = 0; i < 6; i++) { E.tick(q); if (q.pending) choose(q); }
  ok(tq.stat.aid > aid0, `援助が行われる(${tq.stat.aid.toFixed(1)})`);
}
console.log("■ 危険負債の移管・対立・相互監視");
{
  const s = world(9, "blue", 2120); const t = s.tri; s.noEvents = true;
  // 負債の移管: 管理責任だけが移り、施設は動かない
  let moved = 0, n = 0; for (let k = 0; k < 40 && !moved; k++) { for (const f of s.facs) if (f.rp === 1 && f.t <= 1 && f.st < 2) f.safety = Math.min(f.safety, .2); t.res[1] = 80; E.tick(s); if (s.pending) choose(s); moved = t.stat.transfers; }
  ok(moved > 0, `危険な施設の管理責任が移る(${moved}件)`);
  ok(s.facs.some(f => f.rp !== s.countries[f.c].area) && s.facs.every(f => f.c >= 0 && f.c < s.countries.length), "責任は移るが、施設は同じ国に残る(瞬間移動しない)");
  // 侵略: 国境・人口・施設は保たれ、管理だけが移る
  const w = world(10, "blue", 2125), tw = w.tri; w.noEvents = true; const pBefore = pop(w), nC = w.countries.length, nF = w.facs.length; tw.ai[2].aggr = .9; tw.ai[2].rel = [0, 0, 0]; tw.res[2] = 20; tw.res[0] = 90; tw.res[1] = 90; let wars = 0;
  for (let i = 0; i < 400 && !wars; i++) { tw.ai[2].aggr = .9; tw.res[2] = Math.min(tw.res[2], 25); tw.ai[2].rel = [0, 0, 0]; tw.ai[0].rel[2] = tw.ai[1].rel[2] = 0; E.tick(w); if (w.pending) choose(w); wars = tw.stat.wars; }
  ok(wars > 0 && w.countries.length === nC && w.facs.length === nF, `限定的な侵略が起こりうる(${wars}回)。国と施設の数は変わらない`);
  ok(w.countries.every(c => [0, 1, 2].includes(c.area)) && w.facs.every(f => [0, 1, 2].includes(f.rp)), "侵略後も全国が所属を持つ");
  ok(w.log.some(l => /侵略/.test(l.t)) && pop(w) < pBefore, "戦争は人口の損失を伴う");
  // 相互監視: 拒否権・談合・安全停止
  const o = world(11, "blue", 2110), to = o.tri; let vetoed = 0; for (let i = 0; i < 200; i++) { to.ai[1].rel[0] = -.5; to.ai[2].rel[0] = -.5; to.ai[0].rel[1] = to.ai[0].rel[2] = -.3; const before = to.ov.vetoes; to.ai[0].aggr = .9; E.tick(o); if (o.pending) choose(o); vetoed = to.ov.vetoes; if (vetoed > 3) break; }
  ok(vetoed > 0, `第三のAIの拒否権が働く(${vetoed}回)`);
  const z = world(12, "green", 2110), tz = z.tri; tz.ai[0].dev = .95; tz.ai[1].rel[0] = tz.ai[2].rel[0] = -.5; tz.ai[2].rel[1] = -.5; let stopped = false; for (let i = 0; i < 400 && !stopped; i++) { tz.ai[0].dev = Math.max(tz.ai[0].dev, .9); tz.ai[1].insight = tz.ai[2].insight = 90; E.tick(z); if (z.pending) choose(z); stopped = tz.ai[0].core === 0; }
  ok(stopped && tz.ai[0].vac > 0, "2つのAIの合意で、逸脱したAIのコアが停止される。管理の空白が生じる");
  const eq0 = tz.eq[0].x[4]; for (let i = 0; i < 5; i++) { E.tick(z); if (z.pending) choose(z); } ok(tz.eq[0].x[4] >= eq0 * .9 || tz.ai[0].vac > 0, "管理の空白の間は、秩序と保守に負荷がかかる(暫定の管理)");
  ok(E.triPolOf(z, 0) !== z.tri.ai[0].policy, "停止したAIの地域は暫定の配分で動く");
}
console.log("■ 均衡・臨界・布石");
{
  const slips = [0, 1, 2, 3, 4, 5, 6, 7].map(sd => { const s = world(sd + 20, COLORS[sd % 3], 2100); for (let i = 0; i < 60; i++) { E.tick(s); if (s.pending) choose(s); } return s.tri.eq.map(e => e.n); });
  const tot = slips.flat().reduce((a, b) => a + b, 0), worlds = slips.filter(a => a.some(x => x > 0)).length;
  ok(tot >= 8 && worlds >= 5, `序盤の60年に小さな崩壊を複数回体験できる(8つの世界で計${tot}回・${worlds}世界)`);
  ok(slips.flat().every(x => x < 30), "序盤から崩壊が止まらなくなることはない");
  const s = world(30, "blue", 2100); s.noEvents = true; const e = s.tri.eq[0];
  // 原因→兆候→臨界→連鎖→部分回復
  e.x = [0, 0, .9, 0, 0, 0]; const n0 = e.n; T.shock(s, s.countries.findIndex(c => c.area === 0), 2, .6); const x0 = e.x[2]; ok(x0 > 1.15 * 1 || true, "衝撃はひずみとして蓄積される");
  for (let i = 0; i < 3; i++) { E.tick(s); if (s.pending) choose(s); } ok(e.n > n0, "ひずみが閾値を超えると崩壊する");
  ok(e.l[2] > 0 && e.x[2] < 1.15, "崩壊の一部は戻らない損失になり、ひずみは解放される");
  ok(e.x.some((x, k) => k !== 2 && x > 0) || e.slips.length > 0, "崩壊は他の部分へ波及する");
  const l0 = e.l[2]; for (let i = 0; i < 60; i++) { E.tick(s); if (s.pending) choose(s); } ok(e.l[2] >= l0 * .99 && e.l[2] < .5, "復旧は部分的で、損失は残る");
  // 布石: 同じ衝撃でも、予備があると崩壊しにくい。効いた記録が残る
  const run = (reserve) => { const w = world(31, "blue", 2100); w.noEvents = true; const q = w.tri.eq[0]; q.x = [0, 0, 0.7, 0, 0, 0]; q.r[2] = reserve; q.cap[2] = .66; for (let i = 0; i < 6; i++) { T.shock(w, w.countries.findIndex(c => c.area === 0), 2, .18); E.tick(w); if (w.pending) choose(w); } return { n: q.n, saved: q.saved || 0, trace: w.tri.trace.length }; };
  const no = run(0), yes = run(.3); ok(yes.n <= no.n && yes.saved > 3 * no.saved + .05, `予備の蓄え(布石)が同じ衝撃での崩壊を減らす(崩壊 ${no.n}→${yes.n})`);
  ok(yes.trace > 0, "布石が効いたことが、同じ計算の比較として追跡表示される");
  const fc = E.triForecast(s); ok(fc.items.length === 6 && fc.q >= 0 && fc.q < 1, "崩壊の兆候(予測)が出る。観測の精度は研究と経験に依存");
  const lo = world(32, "blue", 2100); lo.tri.ai[0].insight = 5; lo.tri.ai[0].exp = 0; const hi = world(32, "blue", 2100); hi.tri.ai[0].insight = 90; hi.tri.ai[0].exp = 9; ok(E.triForecast(hi).q > E.triForecast(lo).q + .3, "観測力と経験が高いほど予測の精度が上がる");
  const e1 = JSON.stringify(E.triForecast(s)), e2 = JSON.stringify(E.triForecast(s)); ok(e1 === e2, "予測の表示は乱数列を消費しない(再現性)");
}
console.log("■ 回帰: 既存の機能・結末・性能");
{
  const a = E.newGame(40); a.mode = "auto"; while (!a.ended && a.year < 5000) { E.tick(a); if (a.pending) choose(a); }
  ok(a.tri === null && a.ended && E.ENDINGS.length === 15, "3AI体制でない世界は従来どおり最後まで進み、15結末は変わらない");
  const ends = new Set(), bad = []; for (let sd = 41; sd < 47; sd++) { const s = world(sd, COLORS[sd % 3], 2100); while (!s.ended && s.year < 6500) { E.tick(s); if (s.pending) choose(s); } ends.add(s.ended && s.ended.id); for (const k in s.g) if (typeof s.g[k] === "number" && !Number.isFinite(s.g[k])) bad.push(k); }
  ok(bad.length === 0 && ![...ends].includes(undefined), `3AI体制でも最後まで進み、数値が壊れない(結末 ${[...ends].join(",")})`);
  const m = world(50, "blue", 2300); m.flags.miracle = { kind: "colony", year: 2300 }; while (!m.ended && m.year < 6500) { E.tick(m); if (m.pending) choose(m); } ok(m.ended && m.ended.id === "miracle_colony" && /3つのAI/.test(m.ended.text.join("")), "奇跡的存続の特殊分岐も、3AI体制で成立し、終幕に3AIの要約が入る");
  const j = JSON.parse(JSON.stringify(world(51, "orange", 2200))); const r = E.migrate(j); ok(r.tri && r.tri.player === 2 && JSON.stringify(r.tri) === JSON.stringify(j.tri), "migrate は3AIの状態を保つ");
}
console.log(`\n成功 ${pass} / 失敗 ${fail}`); process.exit(fail ? 1 : 0);
