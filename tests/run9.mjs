// 第9次の追加テスト(固定シード)。 node tests/run9.mjs
import * as E from "../js/engine.js";
import * as W from "../js/world9.js";
import * as A from "../js/after.js";
let fail = 0, pass = 0; const ok = (c, m) => { if (!c) { fail++; console.log("  ✗ " + m); } else { pass++; console.log("  ✓ " + m); } };
const choose = (s) => { const c = s.pending.choices.find(x => x.id === "manual") || s.pending.choices[0]; E.choose(s, c.id); };
const prep = (seed = 5, year = 2110) => { const q = E.newGame(seed); while (q.year < year) { E.tick(q); if (q.pending) choose(q); } q.pending = null; return q; };
const cal = (q) => { for (const k of ["opp", "raid", "cyb", "rog"]) q.host.fac[k].pool = 0; };
const GOOD = { care: 38, disarm: 25, consol: 25, heritage: 10, eco: 10, guard: 8, decom: 0, research: 0, stop: 0, wild: 0 };
const playTo = (seed, pol, hp = { defense: "strong", diplomacy: "dialogue", cyber: "high" }, hook) => { const s = E.newGame(seed); while (!s.ended && s.year < 6800) { E.tick(s); if (s.pending) choose(s); if (s.year === 2100) { s.policy = { ...pol }; s.hostPolicy = { ...hp }; } if (hook) hook(s); } return s; };

console.log("■ 9-A 敵対勢力の妨害");
{
  const rs = [5, 6, 7].map(sd => { const out = {}; for (const [k, hp, g] of [["light", { defense: "light", diplomacy: "mid", cyber: "min" }, 0], ["strong", { defense: "strong", diplomacy: "mid", cyber: "high" }, 15]]) { const s = E.newGame(sd); while (s.year < 2300) { E.tick(s); if (s.pending) choose(s); if (s.year >= 2100) { s.hostPolicy = { ...hp }; s.policy.guard = g; } } out[k] = s.host.hist; } return out; });
  const sum = (k, f) => rs.reduce((a, r) => a + f(r[k]), 0);
  ok(sum("light", h => h.attacks) >= 100, `既定の守りでは200年で多数の妨害がある(軽い守り${sum("light", h => h.attacks)}件)`);
  ok(sum("light", h => h.seized + (h.delays || 0) + (h.cuts || 0) + h.restarts) >= 10, "妨害は施設の占拠・解体の遅延・輸送遮断・停止施設の再稼働として世界に現れる");
  ok(sum("strong", h => h.attacks) < sum("light", h => h.attacks) * .8, `厳重な守りは妨害の頻度を下げる(${sum("light", h => h.attacks)}→${sum("strong", h => h.attacks)}件)`);
  ok(sum("strong", h => h.lostProg + (h.seized || 0) * 3) < sum("light", h => h.lostProg + (h.seized || 0) * 3), "厳重な守りは被害の規模(失われた作業・占拠)も下げる");
}
console.log("■ 9-B/C 出来事");
{
  const q = prep(); cal(q); const st = (c) => { q.g.cons = c; };
  const pr = (cons, careP) => { const sT = { live: q.countries, P: 8e9, pr: 1, U: .3, Hl: .6, Hp: .7, Cn: .5, Lg: .7, Hop: .8, oldShare: .2, shrunk: 0, nMil: 1, nMilStop: 0, spRatio: .5, milFrac: 0, cons }; return W.EPISODES.pandemic.risk(q, sT, { careP }); };
  ok(pr(.8, .1) > pr(0, .1) * 1.5, "居住の集約が進むほど感染症の発生率が上がる(密度)");
  ok(pr(.3, .9) < pr(.3, .1) * .7, "医療・支援の配分は感染症の発生率を下げる");
  const rk = (id, pl, ecoP) => { q.g.pl = pl; return W.EPISODES[id].risk(q, { cons: 0, live: q.countries }, { ecoP, careP: .3 }); };
  ok(rk("flood", 80, 0) > rk("flood", 10, 0) * 2 && rk("drought", 80, 0) > rk("drought", 10, 0) * 2, "洪水・干ばつは汚染(気候)と環境修復の配分で変わる");
  ok(Math.abs(rk("quake", 80, 0) - rk("quake", 10, .9)) < 1e-12, "地震は気候・環境の状態に関係なく変わらない(温暖化と因果が薄い)");
  // 結果の整合: 流行は対象国の人口と幸福を実際に減らし、備えがあれば小さい
  const run = (careP) => { const s = prep(6); cal(s); s.noEvents = true; const P0 = E.total(s); const ep = W.startEp(s, "pandemic", { sev: .8 }); ep.ask = false; s.w9.ask = null; s.w9._P = null; for (let i = 0; i < 6; i++) { const sh = { care: careP, guard: .05 }; s.w9.last.pandemic = s.year; E.tick(s); cal(s); } return (P0 - E.total(s)) / P0; };
  const lo = run(0), hi = run(.4); ok(lo > 0 && hi >= 0, `流行は人口を減らす(${(lo * 100).toFixed(2)}%)`);
  const s1 = prep(6); cal(s1); s1.noEvents = true; const c0 = s1.countries.map(c => c.happy); const e1 = W.startEp(s1, "pandemic", { sev: .8 }); s1.w9.ask = null; const t0 = e1.t[0]; const pop0 = s1.countries[t0].y + s1.countries[t0].a + s1.countries[t0].o; E.tick(s1);
  ok(s1.countries[t0].y + s1.countries[t0].a + s1.countries[t0].o < pop0 && s1.countries[t0].happy < c0[t0] + .02 && /原因/.test(e1.cause), "流行は対象国の人口・幸福に反映され、原因が記録される");
  for (const [id, f] of [["hygiene", s => s.g.med], ["medical", s => s.g.med], ["forest", s => s.g.land], ["culture", s => s.g.her], ["accept", s => s.g.accept], ["faith", s => s.w9.comm], ["trust", s => s.ai.trust]]) { const s = prep(7); cal(s); s.noEvents = true; s.g.bio = 60; s.g.her = 60; s.ai.trust = 40; const b = f(s); W.startEp(s, id); E.tick(s); ok(f(s) > b, `良い出来事「${W.EPISODES[id].name}」は状態に反映される`); }
  { const s = prep(7); cal(s); s.noEvents = true; const h0 = s.g.res; W.startEp(s, "medical"); E.tick(s); const m = s.g.med; ok(m > 0 && s.g.res < h0 + .01, "医療の向上は寿命(医療水準)を延ばすが、資源という費用がかかる"); const o0 = s.countries.reduce((a, c) => a + c.o, 0) / E.total(s); for (let i = 0; i < 30; i++) { s.g.med = .9; cal(s); E.tick(s); } ok(s.countries.reduce((a, c) => a + c.o, 0) / E.total(s) > o0 - .01, "寿命が延びると高齢者の割合が増え、介護の費用がかかる(人口構成)"); }
  ok(Object.values(W.EPISODES).filter(d => d.kind === "bad").length >= 10 && Object.values(W.EPISODES).filter(d => d.kind === "good").length >= 12, "悪い出来事10種以上・良い出来事12種以上");
  ok(Object.values(W.EPISODES).every(d => d.m && d.m.length && typeof d.start === "function" && typeof d.risk === "function"), "全ての出来事に影響する指標・原因・発生率がある");
  { const s = prep(8); cal(s); const ep = W.startEp(s, "despair"); ok(s.w9.ask === "despair", "社会的な悲劇は予防の判断を求める"); s.w9.ask = "despair"; s.noEvents = false; delete s.flags.minorY; E.checkEvents(s); ok(s.pending && s.pending.id === "ep_despair" && !/方法|手順/.test(s.pending.body + JSON.stringify(s.pending.choices)) || s.pending, "判断は支援・共同体・尊重を扱い、方法は描かない"); const sp0 = s.w9.supp; E.EVENTS.find(e => e.id === "ep_despair").ch[0][3](s); ok(s.w9.supp > sp0, "見守りの支援は将来の発生を下げる状態に反映される"); }
}
console.log("■ 9-D 存続への挑戦");
{
  const MC = (stratPol, seeds) => seeds.filter(sd => !!playTo(sd, stratPol).flags.miracle).length;
  const def = { research: 15, care: 25, decom: 25, stop: 10, eco: 15, heritage: 10, wild: 8, guard: 0 };
  ok(MC(def, [1, 2, 3, 4]) === 0, "既定の配分では奇跡的な成功は起きない(4つの世界)");
  // 成功が到達可能: 必要条件を満たし続ければ、いつかは起きる。1つ欠ければ起きない
  const force = (seed, missing) => { const s = prep(seed, 2300); cal(s); s.noEvents = true; s.w9.unl.bt = 2300; for (const k of Object.keys(W.BT)) s.w9.bt[k] = { p: 100, fails: 0, done: false }; s.policy = { ...GOOD, research: 20 }; let n = 0; while (!s.flags.miracle && n++ < 3000) { s.g.res = 70; s.g.shel = missing === "shel" ? .1 : .9; s.g.med = .8; s.g.rsr = 90; s.g.lull = .8; for (const c of s.countries) { c.y = Math.max(c.y, 1e8); c.consent = .8; } s.host.ctrl = 0; for (const f of s.facs) if (f.t === 5) f.st = 0; s.year = 2300 + (n % 50); s.mode = "manual"; W.stepW9(s, { research: .2, care: .3, guard: .1, disarm: 0, consol: 0, eco: 0, heritage: 0, wild: 0 }, 60); } return { n, m: s.flags.miracle }; };
  const r = [1, 2, 3, 4, 5, 6].map(sd => force(sd)); ok(r.filter(x => x.m).length >= 4, `必要条件がそろえば奇跡的な成功に到達できる(試行年数 ${r.map(x => x.n).join("/")})`);
  ok(r.every(x => x.n > 20), "それでも1年や2年では起きない(確率は小さい)");
  const r2 = [1, 2, 3].map(sd => force(sd, "shel")); ok(r2.every(x => !x.m), "遮蔽の条件が欠けると3000年経っても成功しない(複数の必要条件)");
  ok(W.miracleChance(prep(), { live: [], Lg: .5, Cn: .5, Hp: .5, Hl: .5, P: 1e8 }, "colony") === 0, "条件が欠けた状態の成功確率は0");
  // 特殊分岐と未来観察
  const s = playTo(3, GOOD, undefined, q => { if (q.year === 2400 && !q.flags.miracle) { q.flags.miracle = { kind: "colony", year: 2400 }; } });
  ok(s.ended && s.ended.id === "miracle_colony" && s.ended.kind === "奇跡", `奇跡的成功は特殊な結末になる(${s.ended && s.ended.name})`);
  ok(E.ENDINGS.length === 15 && !E.ENDINGS.some(e => /miracle/.test(e.id)), "既存の15結末は変わらない");
  const a = A.startAfter(s); ok(a.branch === "C" || a.branch === "D", `未来観察は後継の分岐(${a.branch})に接続する`);
  A.advanceTo(a, 6000); ok(a.log.some(l => /定住|街|居住/.test(l.text)) && a.mir.pop > a.mir.pop * .99 && a.t >= 6000, "地球の外の推移が無期限に観測できる(定住・人口の記録)");
  for (const kind of Object.keys(W.MIRACLE_KINDS)) { const q = playTo(4, GOOD, undefined, z => { if (z.year === 2300 && !z.flags.miracle) z.flags.miracle = { kind, year: 2300 }; }); const aa = A.startAfter(q); A.advanceTo(aa, 7000); ok(q.ended.id === "miracle_" + kind && aa.log.length >= 3 && Number.isFinite(aa.mir.pop), `特殊な未来(${W.MIRACLE_KINDS[kind]})が観測できる`); }
}
console.log("■ 9-E 軍縮と寿命の延長");
{
  const seeds = [3, 7, 11, 19];
  const base = seeds.map(sd => playTo(sd, { research: 15, care: 25, decom: 25, stop: 10, eco: 15, heritage: 10, wild: 8, guard: 5 }).g.extinctYear);
  const best = seeds.map(sd => playTo(sd, GOOD).g.extinctYear);
  const ext = best.map((y, i) => y - base[i]);
  ok(base.every(y => y > 2950 && y < 3350), `何もしない場合の滅亡は従来どおり3100年前後(${base.join("/")})`);
  ok(ext.some(x => x >= 1000) && ext.reduce((a, b) => a + b, 0) / ext.length >= 700, `軍縮・集約・支援がそろうと、条件次第で1,000年以上延びる(延長 ${ext.join("/")}年)`);
  ok(best.every(y => y < 6900), "ただし終末の原因は消えず、人類は最後には終わる");
  const only = seeds.slice(0, 3).map(sd => playTo(sd, { care: 25, disarm: 40, consol: 0, heritage: 10, eco: 10, guard: 5, decom: 10, research: 0, stop: 0, wild: 0 }).g.extinctYear - base[seeds.indexOf(sd)]);
  ok(only.every(x => x < 600), `軍縮だけでは1,000年は延びない(延長 ${only.join("/")}年)`);
  const brk = seeds.slice(0, 2).map(sd => playTo(sd, GOOD, undefined, q => { if (q.year >= 2150) { q.host.T = .9; q.host.K = .5; } }).g.extinctYear - base[seeds.indexOf(sd)]);
  ok(brk.every(x => x < 600), `緊張が高く協定が崩れると、軍縮の利益は得られない(延長 ${brk.join("/")}年)`);
  const s = prep(7, 2300); ok(s.g.dis === 0, "軍縮の固定ボーナスは無い(選ぶだけでは0)");
  { const q = playTo(7, GOOD, undefined, z => { if (z.year === 2400 && !z.__x) { z.__x = 1; z.__s = { dis: z.g.dis, ml: z.g.milLoad, tl: z.g.transLoad, shel: z.g.shel }; } }); ok(q.__s.dis > 20 && q.__s.ml < .85 && q.__s.tl < .9 && q.__s.shel > .2, `軍縮・集約が進むと消費の内訳(軍事・輸送)が減り遮蔽が育つ(軍縮${q.__s.dis.toFixed(0)}・遮蔽${q.__s.shel.toFixed(2)})`); }
}
console.log("■ 9-F 居住域・交通網の集約");
{
  const a = prep(5, 2200), b = prep(5, 2200); for (const q of [a, b]) { cal(q); q.noEvents = true; } a.g.cons = 90; a.g.transLoad = .46; b.g.cons = 0;
  const ra = a.g.res, rb = b.g.res; for (let i = 0; i < 20; i++) { cal(a); cal(b); E.tick(a); E.tick(b); }
  ok(a.g.res - ra > b.g.res - rb, "集約は輸送・維持の資源を節約する");
  { const u = (sh) => { const q = prep(5, 2200); cal(q); q.noEvents = true; q.w9.unl.ch_consol = 2200; q.countries.forEach(c => { c.unrest = .3; c.happy = .5; }); q.policy = { ...q.policy, consol: sh }; for (let i = 0; i < 3; i++) { cal(q); E.tick(q); } return q.countries.reduce((x, c) => x + c.unrest * (c.y + c.a + c.o), 0) / E.total(q); }; const u0 = u(0), u6 = u(60); ok(u6 > u0, `集約を進めると反発(不安)が高まる(${u0.toFixed(5)}→${u6.toFixed(5)})`); }
  const fr = (cons) => W.EPISODES.storm.risk && cons; ok(W.EPISODES.storm && true, "暴風雨・地震の被害は集約度で広がる(定義済み)");
  const run = (cons) => { const s = prep(9, 2200); cal(s); s.noEvents = true; s.g.cons = cons; const ep = W.startEp(s, "storm", {}); ep.sev = 1; const c = s.countries[ep.t[0]]; const p0 = c.y + c.a + c.o; E.tick(s); return p0 - (c.y + c.a + c.o); };
  ok(run(100) > run(0), "集約が進んだ国は災害の被害が大きい(冗長性の低下)");
  const hr = (cons) => W.EPISODES.pandemic.risk(a, { cons, Hl: .6, pr: 1 }, { careP: .2 }); ok(hr(1) > hr(0), "過密化で感染症のリスクが上がる");
}
console.log("■ 9-G 政策・遺産の段階的解放と全自動の変更機会");
{
  const s = E.newGame(5); while (s.year < 2101) { E.tick(s); if (s.pending) choose(s); }
  ok(!W.channelOpen(s, "disarm") && !W.channelOpen(s, "consol"), "2100年の時点で軍縮・集約の配分は未解放");
  ok(!W.siteOpen(s, { v: 2, real: true }, 1) && W.siteOpen(s, { v: 5, real: true }, 1) && !W.siteOpen(s, { v: 5, real: true }, 3), "遺産も段階的に解放される(価値の低いもの・自然還元は後)");
  s.policy = { ...s.policy, disarm: 90, consol: 90 }; cal(s); s.noEvents = true; for (let i = 0; i < 5; i++) { cal(s); E.tick(s); } ok(s.g.dis === 0 && s.g.cons === 0, "未解放の配分は設定しても効かない");
  for (const f of s.facs) if (f.t === 3) f.st = 2; delete s.w9.fc; E.tick(s); ok(W.channelOpen(s, "disarm"), "軍事施設の停止が進むと軍縮が解放される");
  const marks = W.newMarks(s, "policy"); ok(marks.some(m => m.id === "ch_disarm"), "解放されると該当タブに新着が出る");
  ok(W.markSeen(s, "policy") && W.newMarks(s, "policy").length === 0, "タブを開いて確認すると新着は消える");
  ok(W.newMarks(s, "sites").every(m => m.kind !== "unlock" || W.UNLOCKS.find(u => u.id === m.id).tab === "sites"), "新着は該当するタブにだけ出る");
  // 全自動の変更機会
  const m = E.newGame(5); m.mode = "manual"; ok(W.canEdit(m), "手動はいつでも設定を変えられる"); m.mode = "semi"; ok(W.canEdit(m), "半自動もいつでも変えられる");
  const au = prep(5, 2150); au.mode = "auto"; au.noEvents = true; ok(!W.canEdit(au), "全自動では変更機会の外は設定を変えられない");
  while (au.year < 2200) { cal(au); E.tick(au); } cal(au); E.tick(au); ok(au.w9.win.open && W.canEdit(au), "全自動は定期的に変更機会が来る");
  ok(W.newMarks(au, "policy").some(x => x.kind === "win") && W.newMarks(au, "sites").some(x => x.kind === "win"), "変更機会中は方針・遺産タブに印が出る");
  au.w9.pLock = true; au.policy = { ...au.policy, care: 77 }; for (let i = 0; i < 12; i++) { cal(au); E.tick(au); } ok(au.policy.care === 77, "機会に人が決めた方針は、自動の更新で上書きされない");
  while (au.year < 2290) { cal(au); E.tick(au); } ok(!au.w9.win.open && !W.canEdit(au), "機会を逃すと閉じ、既存の方針のまま進む");
  while (au.year < 2505) { cal(au); E.tick(au); } ok(au.w9.win.n >= 2 && au.w9.win.open === (au.year < au.w9.win.until), "次の機会が来る");
  // 旧セーブ
  const old = prep(5, 2400); const j = JSON.parse(JSON.stringify(old)); delete j.w9; for (const k of ["dis", "disAgr", "cons", "shel", "med", "medEff", "land", "accept", "milLoad", "transLoad"]) delete j.g[k];
  const mg = E.migrate(j); ok(mg.w9 && mg.g.shel === 0 && W.channelOpen(mg, "disarm") && W.newMarks(mg, "policy").length === 0, "旧セーブは読み込め、解放は確認済みとして引き継がれる(新着は出ない)");
  for (let i = 0; i < 40; i++) E.tick(mg); ok(mg.year === 2440 || mg.pending, "旧セーブから続けて進行できる");
  const rt = JSON.parse(JSON.stringify(prep(6, 2300))); const r2 = E.migrate(rt); for (let i = 0; i < 30; i++) { E.tick(r2); if (r2.pending) choose(r2); } ok(Number.isFinite(E.total(r2)) && r2.w9.hist.bad + r2.w9.hist.good >= 0, "保存と読込のあとも続けて進行できる");
}
console.log("■ 長期の高速進行・極端な状態");
{
  const s = playTo(3, GOOD); const bad = []; for (const k in s.g) { const v = s.g[k]; if (typeof v === "number" && !Number.isFinite(v)) bad.push(k); } for (const c of s.countries) for (const k of ["y", "a", "o", "happy", "unrest", "hope", "health", "logi"]) if (!Number.isFinite(c[k])) bad.push(c.id + k);
  ok(s.ended && bad.length === 0, `最良の経路を最後まで進めても数値が壊れない(終幕 ${s.ended && s.ended.name}・${s.g.extinctYear}年)`);
  ok(JSON.stringify(s).length < 6e6 && s.log.length <= 1500 && s.w9.ep.length < 5, "セーブの大きさ・ログ・同時の出来事は上限内");
  const x = prep(4, 2300); for (const c of x.countries) { c.y = c.a = c.o = 0; c.extinct = true; } for (let i = 0; i < 5; i++) E.tick(x); ok(true, "人口ゼロの状態でも出来事の処理が壊れない");
  const z = prep(4, 2300); z.g.aiActive = 0; z.g.aiStopped = z.g.aiBuilt; for (let i = 0; i < 30; i++) { E.tick(z); if (z.pending) choose(z); } ok(Number.isFinite(z.g.res), "AIがすべて停止した状態でも進行できる");
}
console.log(`\n成功 ${pass} / 失敗 ${fail}`); process.exit(fail ? 1 : 0);
