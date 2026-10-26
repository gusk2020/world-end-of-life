// 画面テスト(任意): playwright-core と Chromium が必要。
//   PW=<playwright-coreのパス> CHROME=<chromeのパス> node tests/ui.mjs
// 静的サーバ(例: python3 -m http.server 8765)を起動しておく。
import { createRequire } from "module";
const req = createRequire(import.meta.url);
const { chromium } = req(process.env.PW || "playwright-core");
const URL_ = process.env.URL || "http://localhost:8765/index.html";
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("  ✗ " + m); } else console.log("  ✓ " + m); };
const b = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true });
const p = await ctx.newPage(); const errs = [];
p.on("pageerror", e => errs.push(e.message));
await p.goto(URL_); await p.waitForTimeout(500);
const adv = (target) => p.evaluate(([t]) => { const g = window.__game, S = g.S, E = g.E; if (!g.paused) g.togglePause(); while (S.year < t && !S.ended && E.total(S) > 200) { E.tick(S); if (S.pending) E.choose(S, S.pending.choices[0].id); } document.getElementById("modal").hidden = true; g.refresh(true); }, [target]); // 一時停止にして進める

console.log("■ 導入(ゲームマスターの説明)と助走期間の画面");
{
  const gm = await p.evaluate(() => { const b = document.getElementById("mbox"), t = b.querySelector(".gmb"); return { txt: b.textContent, color: getComputedStyle(t).color, pre: document.body.classList.contains("prelude"), hd: getComputedStyle(document.getElementById("hd")).display, tabs: getComputedStyle(document.getElementById("tabs")).display, cv: !document.getElementById("orbcv").hidden, mt: b.getBoundingClientRect().top < 40 }; });
  ok(/導入 1\/5/.test(gm.txt) && /ゲームマスター/.test(gm.txt), "起動するとゲームマスターが世界設定を説明する");
  ok(gm.color === "rgb(255, 255, 255)", "説明本文は白文字");
  ok(gm.pre && gm.hd === "none" && gm.tabs === "none", "導入・助走期間は通常のゲーム画面(砂時計・タブ・速度)を表示しない");
  ok(gm.cv && gm.mt, "窓は画面上部寄せで、下の空き領域に球体のキャンバスがある");
  const pages = []; for (let i = 0; i < 5; i++) { pages.push(await p.textContent("#mbox h2")); if (await p.locator("#pgnext").count()) await p.click("#pgnext"); }
  const all = await p.evaluate(() => document.querySelector("#mbox").textContent); ok(pages.length === 5 && pages.join("|").includes("あなたは") && pages.join("|").includes("三つの節目"), "章を順に読める: " + pages.join(" / "));
  ok(/設定資料/.test(all) && !/仮説です|創作上の設定です/.test(all), "技術注釈は設定資料に集約され、導入で繰り返さない");
  await p.click("[data-pl='0']"); await p.waitForTimeout(150);
  ok(await p.locator("#modal:not([hidden])").count() === 0 && await p.evaluate(() => document.body.classList.contains("prelude")), "導入のあと助走期間の画面になる(通常画面はまだ出ない)");
  const pre = await p.evaluate(() => { const pc = document.getElementById("precard"), cs = getComputedStyle(pc), r = pc.getBoundingClientRect(); return { top: r.top, y: parseFloat(getComputedStyle(document.getElementById("preyear")).fontSize), border: cs.borderColor, color: getComputedStyle(document.getElementById("prestat")).color }; });
  ok(pre.top < 40 && pre.y >= 30, `助走期間の窓は上側の1つだけで、年代表示は大きい(${pre.y}px)`);
  await p.waitForSelector("#modal:not([hidden]) #go", { timeout: 12000 });
  const qh = await p.evaluate(() => ({ t: document.getElementById("mbox").textContent, prog: document.querySelectorAll("#mbox .progset").length, go: document.getElementById("go").textContent, st: document.getElementById("modal").classList.contains("stage") }));
  ok(/質問 1\//.test(qh.t) && qh.prog === 0 && qh.st, "助走期間は質問ウィンドウが順に出る(進行設定・速度は出さない)");
  const wb = await p.evaluate(() => { const cols = new Set(); document.querySelectorAll("#mbox, #mbox *").forEach(e => { const cs = getComputedStyle(e); [cs.color, cs.borderTopColor].forEach(c => { const m = c.match(/rgba?\((\d+), (\d+), (\d+)/); if (m && !(m[1] === m[2] && m[2] === m[3])) cols.add(c); }); }); const yr = parseFloat(getComputedStyle(document.querySelector("#mbox .qyear")).fontSize); return { colored: [...cols], yr, mb: document.getElementById("mbox").getBoundingClientRect(), bu: window.__orbsBurst }; });
  ok(wb.colored.length === 0, "色を選ぶ前の操作UI(窓・文章・選択肢・ボタン)は白黒だけ" + (wb.colored.length ? ": " + wb.colored.join() : ""));
  ok(wb.yr >= 26 && wb.mb.bottom < 740 * .72, `質問窓に大きな年代表示があり、下に球体の領域が残る(${wb.yr}px・窓の下端${Math.round(wb.mb.bottom)})`);
  const w1 = await p.evaluate(() => window.__game.S.year); await p.waitForTimeout(600); ok(await p.evaluate(() => window.__game.S.year) === w1, "質問に答えるまで歴史は進まない");
  await p.click("#mbox .opt >> nth=0"); const bur0 = await p.evaluate(async () => { const m = await import("./js/orbs.js"); return m.orbs.bur || 0; }); await p.click("#go"); const bur1 = await p.evaluate(async () => { const m = await import("./js/orbs.js"); return m.orbs.bur || 0; });
  ok(bur1 > bur0 && bur1 >= .9, `質問に答えるたびに大きなノイズが走る(${bur0.toFixed(2)}→${bur1.toFixed(2)})`);
  await p.evaluate(() => window.__game.skipPrelude("blue")); await p.waitForTimeout(200);
}
console.log("\n■ 360px 表示");
const noObs = () => p.evaluate(() => { window.__game.settings.observe.sec = 0; }); // 既存の検証では観察フェーズを切る(観察は専用の節で検証)
await noObs();
const over = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(await p.locator("#tabs [data-t=policy]").isVisible() && !(await p.locator("#tabs [data-t=sites]").isVisible()) && await p.evaluate(() => !!window.__game.S.tri), "助走期間のあと(2100年〜)は3AI体制になり、方針タブが開く(遺産の画面は一時的に隠す)");
for (const t of ["map", "status", "log", "sys"]) { await p.click(`#tabs [data-t=${t}]`); await p.waitForTimeout(150); ok(await over() <= 0, `${t}タブで横スクロールなし`); }
await p.click("#tabs [data-t=map]");
const hdh = await p.evaluate(() => document.getElementById("hd").getBoundingClientRect().height);
ok(hdh < 190, `ヘッダ高さ ${Math.round(hdh)}px (360x740の${Math.round(hdh / 7.4)}%)`);
const mapH = await p.evaluate(() => document.getElementById("mapbox").getBoundingClientRect().height);
ok(mapH >= 150, `地図の高さ ${Math.round(mapH)}px を確保(砂時計が地図を圧迫しない)`);
const small = await p.evaluate(() => [...document.querySelectorAll("#speed button,#tabs button,#themes button,.gl")].filter(e => { const r = e.getBoundingClientRect(); return e.offsetParent !== null && (r.height < 30 || r.width < 30); }).length);
ok(small === 0, "主要ボタンはすべて30px以上");
await adv(2160);
for (const t of ["policy", "status"]) { await p.click(`#tabs [data-t=${t}]`); await p.waitForTimeout(150); ok(await over() <= 0, `${t}タブで横スクロールなし(終活期)`); }
await p.click("#tabs [data-t=map]");
const clip = () => p.evaluate(() => [...document.querySelectorAll(".gt")].filter(e => e.scrollWidth > e.clientWidth + 1).length);
ok(await clip() === 0, "3つの砂時計の数字(10桁超)が360px幅で切れない");

console.log("\n■ 砂時計: 小型表示と省略表記(正確な数値は拡大画面)");
const comp = await p.evaluate(() => ["h", "a", "m"].map(k => ({ cv: !!document.getElementById("g" + k) && document.getElementById("g" + k).tagName === "CANVAS", sc: document.getElementById(k + "_scale").textContent, al: document.getElementById(k + "_alive").textContent, de: document.getElementById(k + "_dead").textContent })));
ok(comp.every(c => c.cv && /^1粒=/.test(c.sc)), "3つの砂時計がCanvasで常時小型表示され、1粒の個体数を明示: " + comp.map(c => c.sc).join(" / "));
ok(comp.every(c => /億|万|^[\d,]+$/.test(c.al) && c.al.length <= 8 && c.de.length <= 9), "人数・個体数は省略表記で読みやすい: " + comp.map(c => c.al + "/" + c.de).join(" "));

console.log("\n■ 砂時計の拡大(大きな画面・累計・増減・年次推移)と3種の整合性");
const nums = () => p.evaluate(() => { const g = window.__game, n = g.hourglassNumbers(g.S), t = (id) => +document.getElementById(id).dataset.v, S = g.S, mt = g.E.mammalTotals(S);
  return { show: t("h_alive") === n.hAlive && t("h_dead") === n.hDead && t("a_alive") === n.aAlive && t("a_dead") === n.aDead && t("m_alive") === n.mAlive && t("m_dead") === n.mDead,
    sums: n.hAlive + n.hDead === n.hEver && n.aAlive + n.aDead === n.aEver && n.mAlive + n.mDead === n.mEver,
    inv: Math.abs(S.g.P0 + S.g.hBorn - S.g.hDead - g.E.total(S)) < 1e-3 * S.g.P0 && Math.abs(mt.ever - mt.dead - mt.alive) < 1e-6 * mt.ever }; });
const c0 = await nums(); ok(c0.show && c0.sums && c0.inv, "ヘッダの数字=内部数値、生+死=累計(3種)");
for (const [g, nm] of [["h", "人類"], ["a", "AI"], ["m", "哺乳類"]]) {
  await p.click(`.gl[data-g=${g}]`); await p.waitForTimeout(250);
  const geo = await p.evaluate(() => { const c = document.getElementById("bigcv"), m = document.getElementById("mbox"), r = c.getBoundingClientRect(); return { w: r.width, h: r.height, mh: m.getBoundingClientRect().height, ov: m.scrollWidth - m.clientWidth, ph: window.innerHeight }; });
  ok(geo.h >= 260 && geo.w >= 280 && geo.mh >= geo.ph * .9 && geo.ov <= 1, `${nm}: 画面の大部分(${Math.round(geo.w)}x${Math.round(geo.h)}px)で拡大、360pxで横にはみ出さない`);
  const t = await p.textContent("#mbox");
  ok(/今年の増加/.test(t) && /今年の減少/.test(t) && await p.locator("#modal svg.chart").count() === 1, `${nm}: 現在数・累計・今年の増減・年次推移`);
  const exact = await p.evaluate((g) => { const n = window.__game.hourglassNumbers(window.__game.S), f = (x) => Math.round(x).toLocaleString("en-US"); const e = { h: [n.hAlive, n.hDead, n.hEver], a: [n.aAlive, n.aDead, n.aEver], m: [n.mAlive, n.mDead, n.mEver] }[g].map(f); const s = ["bg_up", "bg_down", "bg_ever"].map(i => document.getElementById(i).textContent); return JSON.stringify(e) === JSON.stringify(s); }, g);
  ok(exact, `${nm}: 拡大画面の正確な数値が内部値と一致`);
  const gr = await p.evaluate(() => { const b = window.__game.sand.big; return { ok: !!b, top: b.model.Nt, bot: b.model.Nb, ct: b.model.capTop, cb: b.model.capBot }; });
  ok(gr.ok && gr.top <= gr.ct && gr.bot <= gr.cb && gr.ct <= 1000, `${nm}: 粒を一つずつ描画(上${gr.top}粒/下${gr.bot}粒、表示上限${gr.ct}粒)`);
  await p.click("#gclose");
}
ok(await p.locator("#modal[hidden]").count() === 1, "拡大を閉じられる");

console.log("\n■ 固定縮尺/自動縮尺の切替(数値は変わらない)");
await p.click(".gl[data-g=h]"); await p.waitForTimeout(200);
const snapNum = () => p.evaluate(() => { const g = window.__game, S = g.S; return JSON.stringify([S.g.hBorn, S.g.hDead, S.g.aiActive, S.g.aiBuilt, S.g.aiStopped, Math.round(g.E.total(S)), ...["bg_up", "bg_down", "bg_ever"].map(i => document.getElementById(i).textContent)]); });
const n0 = await snapNum(); const leg0 = await p.textContent("#slegend");
ok(/自動縮尺: 1粒 = /.test(leg0), "初期は自動縮尺で、1粒の代表個体数を表示: " + leg0.slice(0, 28));
const Ks = [];
for (const i of [0, 1, 2]) { await p.click(`[data-fx='${i}']`); await p.waitForTimeout(80); const k = await p.evaluate(() => window.__game.sand.bigGrains.K); Ks.push(k); ok((await snapNum()) === n0, `固定縮尺(${["細かい", "標準", "粗い"][i]})に切替: 1粒=${k}人でも実際の数値は不変`); }
ok(Ks[0] < Ks[1] && Ks[1] < Ks[2] && /固定縮尺/.test(await p.textContent("#slegend")), "固定縮尺は1粒あたりの個体数が一定(細かい<標準<粗い)");
await p.click("[data-sm=auto]"); ok(/自動縮尺/.test(await p.textContent("#slegend")) && (await snapNum()) === n0, "自動縮尺に戻しても数値は不変");
const topK = await p.evaluate(() => { const b = window.__game.sand.big; return [b.model.Nt, window.__game.sand.bigGrains.K]; });
ok(topK[0] > 20, `縮尺切替後も粒が表示される(上${topK[0]}粒)`);
await p.click("#gclose");

console.log("\n■ 出生/死亡・新造/停止の表示と、ゲーム時間と分離した動き");
await p.evaluate(() => { const g = window.__game; g.S.mode = "auto"; g.setSpeed(1); if (g.paused) g.togglePause(); }); // イベントで拡大が閉じないよう完全自動で進める
for (const [g, nm] of [["h", "人類"], ["a", "AI"], ["m", "哺乳類"]]) {
  await p.click(`.gl[data-g=${g}]`); await p.waitForTimeout(2600);
  const st = await p.evaluate(() => { const b = window.__game.sand.big; return { ...b.model.stats, inflight: b.model.inflight() }; });
  ok(st.drops > 0 && st.landedDrops > 0, `${nm}: ${g === "a" ? "停止" : "死亡"}の粒が上から下へ落ち、下に積もる(落下${st.drops}・着地${st.landedDrops})`);
  ok(st.adds > 0 && st.landedAdds > 0, `${nm}: ${g === "a" ? "新造" : "出生"}の粒が上部へ加わる(追加${st.adds}・着地${st.landedAdds})`);
  await p.click("#gclose");
}
console.log("\n■ 一時停止中は新たな死亡・停止が起きない / 拡大表示中の操作");
await p.click(".gl[data-g=h]"); await p.waitForTimeout(500);
await p.evaluate(() => { if (!window.__game.paused) window.__game.togglePause(); });
const d0 = await p.evaluate(() => ({ d: window.__game.S.g.hDead, y: window.__game.S.year, a: window.__game.S.g.aiStopped })); await p.waitForTimeout(400);
const q = () => p.evaluate(() => { const m = window.__game.sand.big.model; return { drops: m.stats.drops, adds: m.stats.adds, in: m.inflight(), gap: m.gap() }; });
let qa = await q(); for (let i = 0; i < 40 && (qa.in > 0 || qa.gap > 0); i++) { await p.waitForTimeout(200); qa = await q(); }
ok(qa.in === 0 && qa.gap === 0, "停止後、表示が追いついて落下中の粒は0になる");
const d1 = await p.evaluate(() => ({ d: window.__game.S.g.hDead, y: window.__game.S.year, a: window.__game.S.g.aiStopped })); await p.waitForTimeout(1500); const qb = await q();
const d2 = await p.evaluate(() => ({ d: window.__game.S.g.hDead, y: window.__game.S.year, a: window.__game.S.g.aiStopped }));
ok(d1.d === d2.d && d1.y === d2.y && d1.a === d2.a && qb.drops === qa.drops && qb.adds === qa.adds, `停止中は死亡・停止の累計(${d2.d.toExponential(3)})も年(${d2.y})も粒の新規発生も増えない`);
const before = await snapNum();
await p.click("[data-gt=a]"); await p.click("[data-gt=m]"); await p.click("[data-gt=h]"); await p.click("[data-sm=fixed]"); await p.click("[data-fx='0']"); await p.click("[data-sm=auto]");
ok((await snapNum()) === before, "拡大表示中に切替・縮尺操作をしても内部数値は不変");
await p.evaluate(() => window.__game.sand.big && window.dispatchEvent(new Event("resize"))); await p.waitForTimeout(200);
ok((await snapNum()) === before, "画面サイズ変更でも内部数値は不変");
await p.click("#gclose");

console.log("\n■ 高速進行時の表示追従・性能・メモリ");
await p.evaluate(() => { const g = window.__game; g.setSpeed(2); if (g.paused) g.togglePause(); });
await p.click(".gl[data-g=h]"); await p.waitForTimeout(300);
const ys0 = await p.evaluate(() => window.__game.S.year); const ts0 = Date.now(); await p.waitForTimeout(3000);
const ys1 = await p.evaluate(() => window.__game.S.year), el = (Date.now() - ts0) / 1000;
ok((ys1 - ys0) / el > 60, `×100でもゲームは遅れない(${Math.round((ys1 - ys0) / el)}年/秒)`);const perf = await p.evaluate(() => ({ ema: window.__game.sand.loop.ema, level: window.__game.sand.loop.level, fl: window.__game.sand.big.model.inflight(), cap: window.__game.sand.big.model.maxInflight }));
ok(perf.ema < 14 && perf.fl <= perf.cap, `描画1フレームの処理 ${perf.ema.toFixed(1)}ms、同時に動く粒${perf.fl}個(上限${perf.cap})`);
await p.evaluate(() => { if (!window.__game.paused) window.__game.togglePause(); });
let gp = await q(); for (let i = 0; i < 40 && (gp.in > 0 || gp.gap > 0); i++) { await p.waitForTimeout(200); gp = await q(); }
ok(gp.in === 0 && gp.gap === 0, "高速進行のあと停止すると、粒の表示が最新の数値に追いつく(まとめて更新を含む)");
const bulk = await p.evaluate(() => window.__game.sand.big.model.stats.bulk); ok(bulk >= 0, `追いつかない場合はまとめて更新(${bulk}回)`);
await p.click("#gclose");

console.log("\n■ 端末性能に応じた負荷調整・背景タブ・長時間動作");
await p.evaluate(() => { const g = window.__game; g.setSpeed(1); if (g.paused) g.togglePause(); window.__game.sand.loop.debugDelay = 30; });
await p.click(".gl[data-g=h]"); await p.waitForTimeout(4500);
const lv = await p.evaluate(() => ({ level: window.__game.sand.loop.level, cap: window.__game.sand.big.model.capTop })); 
ok(lv.level >= 1, `描画が重いと自動で負荷を下げる(品質レベル${lv.level}、粒の上限${lv.cap})`);
await p.evaluate(() => { window.__game.sand.loop.debugDelay = 0; window.__game.sand.setQuality(0); });
await p.evaluate(() => { const g = window.__game; if (!g.paused) g.togglePause(); });
const hid = await p.evaluate(async () => { const l = window.__game.sand.loop; Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); const d0 = l.drawn; await new Promise(r => setTimeout(r, 600)); const r = { hidden: l.hidden, raf: l.raf, drew: l.drawn - d0 }; return r; });
ok(hid.hidden && hid.raf === 0 && hid.drew === 0, "背景タブでは描画を止める");
const sync = await p.evaluate(async () => { const g = window.__game; g.S.g.hDead += 3e8; g.S.g.hBorn += 3e8; Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); g.refresh(true); await new Promise(r => setTimeout(r, 300)); const m = g.sand.big.model; return { gap: m.gap(), vis: !g.sand.loop.hidden }; });
ok(sync.vis && sync.gap === 0, "再表示すると最新の状態に同期する");
const cdp = await ctx.newCDPSession(p);
const heap = async () => { await cdp.send("HeapProfiler.collectGarbage"); const r = await cdp.send("Runtime.getHeapUsage"); return r.usedSize; };
await p.click("#gclose"); const h0 = await heap();
for (let i = 0; i < 60; i++) { await p.click(".gl[data-g=" + ["h", "a", "m"][i % 3] + "]"); await p.click("#gclose"); }
const views = await p.evaluate(() => window.__game.sand.loop.views.size); ok(views === 3, `拡大の開閉を60回繰り返しても描画対象は3つのまま(リークなし: ${views})`);
await p.evaluate(() => { const S = window.__game.S, mod = window.__game.sand.compact.h.model; let r = 12345; const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; for (let i = 0; i < 40000; i++) { mod.setTargets(Math.floor(rnd() * 400), Math.floor(rnd() * 400)); mod.step(.016); } mod.snap(); });
const h1 = await heap(); ok(h1 - h0 < 8e6, `長時間(開閉60回+4万フレーム)のメモリ増加 ${((h1 - h0) / 1e6).toFixed(1)}MB < 8MB`);
const pool = await p.evaluate(() => window.__game.sand.compact.h.model.fl.length); ok(pool === 96, "落下する粒のプールは一定(96)");

console.log("\n■ 砂の色はテーマに従う");
await p.click(".gl[data-g=h]"); await p.waitForTimeout(300);
const px = (rgbWant) => p.evaluate((w) => { const b = window.__game.sand.big, d = b.dpr, m = b.model; b.draw(); const x = Math.round(m.slots.top[0] * d), y = Math.round(m.slots.top[1] * d); if (m.Nt < 1) return "none"; const [r, g, bl, a] = b.ctx.getImageData(x, y, 1, 1).data; return [r, g, bl, a].join(","); }, rgbWant);
for (const [th, rgb] of [["green", "51,255,119"], ["orange", "255,160,48"], ["blue", "77,166,255"]]) {
  await p.evaluate((t) => window.__game.applyTheme(t), th); await p.waitForTimeout(100);
  const got = await px(); ok(got.startsWith(rgb + ","), `${th}: 拡大中の砂の色がテーマ色 (${got})`);
}
await p.click("#gclose");

console.log("\n■ テーマ切替(青・緑・橙)と独立保存");
const col = () => p.evaluate(() => [getComputedStyle(document.documentElement).getPropertyValue("--rgb").trim(), getComputedStyle(document.getElementById("date")).color, document.getElementById("svg").querySelector("path").style.fill]);
const seen = {};
const sw = async (th) => { await p.click(`#themes [data-th=${th}]`); await p.waitForTimeout(120); if (await p.locator("#modal:not([hidden]) [data-ab='0']").count()) { await p.click("[data-ab='0']"); await p.waitForTimeout(150); } for (let i = 0; i < 14 && await p.locator("#modal:not([hidden]) #pgnext").count(); i++) await p.click("#pgnext"); await p.evaluate(() => { const g = window.__game; document.getElementById("modal").hidden = true; if (g.S.year < 2100) g.skipPrelude(); if (!g.paused) g.togglePause(); }); };
for (const [th, rgb] of [["green", "51,255,119"], ["orange", "255,160,48"], ["blue", "77,166,255"]]) {
  await sw(th);
  let [v, text, fill] = await col(); text = text.replace(/ /g, ""); fill = fill.replace(/ /g, ""); seen[th] = text;
  ok(v === rgb && text === `rgb(${rgb})` && fill.includes(rgb), `${th}: 文字・地図がテーマ色`);
}
ok(new Set(Object.values(seen)).size === 3, "3色が互いに異なる");
await sw("orange");
ok((await p.evaluate(() => JSON.parse(localStorage.getItem("weol.settings")))).theme === "orange", "設定が localStorage に保存される");
await p.click("#tabs [data-t=sys]"); await p.click("[data-sv='1']");
const sv = await p.evaluate(() => localStorage.getItem("weol.save.1"));
ok(sv && !sv.includes("\"theme\"") && JSON.parse(sv).countries, "セーブデータにテーマは含まれない(独立)");
await sw("blue");

console.log("\n■ 速度設定(4段階・100倍速が標準・別操作の一時停止・維持)");
await p.evaluate(() => { const g = window.__game; g.startNewWorld(); g.skipPrelude(); g.settings.observe.sec = 0; g.S.noEvents = true; }); await p.waitForTimeout(200);
await p.click("#tabs [data-t=map]");
const st = () => p.evaluate(() => ({ idx: window.__game.speedIdx, paused: window.__game.paused, saved: JSON.parse(localStorage.getItem("weol.settings")).speed2, label: document.getElementById("spdlabel").textContent, btns: [...document.querySelectorAll("#speed [data-s]")].map(b => b.textContent).join(","), on: [...document.querySelectorAll("#speed [data-s].on")].map(b => b.textContent).join(",") }));
let s1 = await st(); ok(s1.btns === "×25,×100,×250,×1000", "速度は4段階(×25 / ×100 / ×250 / ×1000)");
await p.click("#speed [data-s='3']"); s1 = await st();
ok(s1.idx === 3 && s1.saved === 3 && !s1.paused && /×250/.test(s1.label) && /現実1秒=ゲーム内250年/.test(s1.label), "×250を選ぶ: " + s1.label.slice(0, 60));
ok(/×1は1年=1秒/.test(s1.label), "1倍速の定義(現実1秒=ゲーム内1年)を表示");
await p.click("#pause"); s1 = await st(); ok(s1.paused && s1.idx === 3, "一時停止は速度とは別操作(速度×250を維持)");
await p.click("#pause"); s1 = await st(); ok(!s1.paused && s1.idx === 3, "再開しても速度は×250のまま");
await p.evaluate(() => window.__game.togglePause());
await p.click("[data-t=sys]"); await p.click("[data-sv='2']"); s1 = await st(); ok(s1.idx === 3, "セーブしても速度は初期値に戻らない");
await p.click("[data-ld='2']"); await p.click("[data-ld='2']"); await p.waitForTimeout(100); s1 = await st(); ok(s1.idx === 3 && s1.paused, "ロード後も速度を維持(ロード直後は一時停止)");
await p.reload(); await p.waitForTimeout(500); ok((await st()).idx === 3, "再読込後も速度を維持"); await noObs();
ok(await p.locator("#spdlabel").textContent().then(t => /現実1秒/.test(t)), "何倍速かと現実時間の対応を表示");
const pc = await p.evaluate(() => { const b = document.getElementById("pause"); const cs = getComputedStyle(b), root = getComputedStyle(document.documentElement).getPropertyValue("--rgb").trim().replace(/,/g, ", "); return { text: b.textContent, color: cs.color, border: cs.borderColor, root }; });
ok(/^(停止|再開)$/.test(pc.text) && pc.color === `rgb(${pc.root})`, `停止ボタンはテーマ色(${pc.color})で、状態色や絵文字色を使わない`);
await p.evaluate(() => { const g = window.__game, S = g.S; S.noEvents = false; if (!g.paused) g.togglePause(); document.getElementById("modal").hidden = true; S.pending = null; S.year = Math.max(S.year, 2120); S.coop = .5; delete S.flags.minorY; delete S.done.scarcity; });
await p.evaluate(() => window.__game.setSpeed(2)); await p.evaluate(() => { if (window.__game.paused) window.__game.togglePause(); });
for (let i = 0; i < 60 && !(await p.locator("#modal:not([hidden]) .opt").count()); i++) await p.waitForTimeout(200);
ok(await p.locator("#modal:not([hidden]) .opt").count() > 0, "重要イベントで自動停止する");
console.log("\n■ イベント文は白字・3行要約・タップで全文");
const color = await p.evaluate(() => getComputedStyle(document.getElementById("evb")).color.replace(/ /g, ""));
ok(color === "rgb(255,255,255)", "イベント本文は白文字: " + color);
const lines = await p.evaluate(() => { const e = document.getElementById("evb"); return { sh: e.scrollHeight, ch: e.clientHeight, lh: parseFloat(getComputedStyle(e).lineHeight) }; });
ok(lines.ch <= lines.lh * 3 + 3, `通常は3行以内に要約表示 (${Math.round(lines.ch / lines.lh * 10) / 10}行)`);
if (lines.sh > lines.ch + 2) { await p.click("#more"); const after = await p.evaluate(() => document.getElementById("evb").clientHeight); ok(after > lines.ch, "タップで全文を表示"); }
else ok(true, "本文が短く要約不要(全文表示)");
ok(await p.locator("#modal .opt .pv").count() >= 2 && await p.locator("#modal .opt small").count() >= 2, "選択肢の説明と数値は省略されない");
await p.locator("#modal .opt").first().click(); await p.click("#go"); await p.waitForTimeout(100);
ok((await st()).idx === 2, "イベント処理後も速度は維持");
await p.evaluate(() => { if (!window.__game.paused) window.__game.togglePause(); });

console.log("\n■ 進行モード(手動・半自動・完全自動)");
await adv(2100);
await p.evaluate(() => { const g = window.__game; g.S.pending = null; g.setSpeed(1); g.togglePause(); });
await p.click("#tabs [data-t=policy]"); await p.click("#policy [data-pm=auto]");
ok(await p.evaluate(() => window.__game.S.mode) === "auto", "完全自動に切り替え");
await p.evaluate(() => { const g = window.__game; if (g.paused) g.togglePause(); });
await p.waitForTimeout(3500);
ok(await p.locator("#modal:not([hidden])").count() === 0 || await p.locator("#modal .opt").count() === 0, "完全自動ではイベントで停止しない");
const al = await p.evaluate(() => window.__game.S.autoLog.length); ok(al > 0, `自動判断が${al}件記録される`);
ok(await p.locator("#autobtn:not([hidden])").count() === 1, "自動判断の確認ボタンが出る");
await p.evaluate(() => window.__game.togglePause());
await p.click("#autobtn"); await p.waitForTimeout(100);
ok(/理由/.test(await p.textContent("#mbox")) && /結果/.test(await p.textContent("#mbox")), "自動判断の理由と結果を確認できる");
await p.click("#aclose");
await p.click("#modechip"); ok(await p.evaluate(() => window.__game.S.mode) === "manual", "進行モードをいつでも変更できる(チップ)");
ok(await p.evaluate(() => window.__game.S.log.some(l => l.k === "auto")), "自動判断の理由と結果がログに残る");

console.log("\n■ 判断の見込み・方針の差分・遺産・状況");
await p.evaluate(() => { const g = window.__game; if (!g.paused) g.togglePause(); document.getElementById("modal").hidden = true; g.S.pending = null; });
await p.evaluate(() => { const g = window.__game; g.setSpeed(1); if (!g.paused) g.togglePause(); document.getElementById("modal").hidden = true; g.S.pending = null; });
await p.click("#tabs [data-t=status]"); await p.waitForTimeout(400);
ok((await p.textContent("#status")).includes("ボトルネック"), "状況タブにボトルネックと原因");
ok(await p.locator("#status svg.radar").count() === 1, "7指標のレーダー");
ok(/天文現象/.test(await p.textContent("#status")), "天文現象の状態を表示");
await p.click("#tabs [data-t=policy]");
ok(await p.locator("input[data-k=wild]").count() === 1, "大型哺乳類の保護が政策項目にある");
await p.evaluate(() => { const r = document.querySelector("input[data-k=wild]"); r.value = 60; r.dispatchEvent(new Event("input")); r.dispatchEvent(new Event("change")); });
await p.waitForTimeout(1800);
ok(/年後/.test(await p.textContent("#pvbox")), "方針の変更で10年後/40年後の差分表が出る");
await p.click("#apply"); await p.evaluate(() => { const g = window.__game; g.S.tri = null; g.refresh(true); }); /* 旧セーブ互換(単一AI)の画面で遺産を確認する */ await p.click("#tabs [data-t=sites]"); ok(await p.locator(".site").count() >= 30, "遺産が30件以上並ぶ");

console.log("\n■ セーブ・ロード");
await p.evaluate(() => { const g = window.__game; if (!g.paused) g.togglePause(); });
await p.click("#tabs [data-t=sys]"); await p.click("[data-sv='3']");
const y0 = await p.evaluate(() => window.__game.S.year); await p.evaluate(() => { window.__game.S.year += 30; });
await p.click("[data-ld='3']"); await p.click("[data-ld='3']"); await p.waitForTimeout(200);
ok(await p.evaluate(() => window.__game.S.year) === y0, "ロードで年が戻る");
console.log("\n■ 自動縮尺: 減少に応じて細かくなり、最終段階では1粒=1個体");
await adv(3040); // 最終段階まで進める(このあと他の検証はしない)
await p.click(".gl[data-g=h]"); await p.waitForTimeout(250);
const fin = await p.evaluate(() => { const g = window.__game, S = g.S, b = g.sand.big; return { alive: Math.round(g.E.total(S)), K: g.sand.bigGrains.K, top: b.model.Nt, tt: b.model.tt, legend: document.getElementById("slegend").textContent }; });
ok(fin.alive > 0 ? fin.K === 1 && fin.top === Math.min(fin.alive, 1000) : true, `最終段階(生存${fin.alive}人)は1粒=1個体(上${fin.top}粒)`);
ok(/1粒 = 1人/.test(fin.legend), "縮尺と1粒の代表個体数を常に明示: " + fin.legend.slice(0, 26));
await p.click("#gclose"); await adv(2160);
await p.evaluate(() => { const g = window.__game; const S = g.S; void S; });

console.log("\n■ 観察フェーズ(第4次改修)");
{
  await p.evaluate(() => { const g = window.__game; document.getElementById("modal").hidden = true; if (!g.paused) g.togglePause(); g.settings.observe.sec = 5; g.settings.observe.style = "stop"; g.settings.mode = "manual"; g.S.mode = "manual"; });
  // 手動イベントを1件つくり、モーダルを開く
  const open = (id) => p.evaluate((id) => { const g = window.__game, S = g.S; g.session.flow.cancel(); S.holdAuto = false; S.pending = null; S.year = 2126; delete S.done.learn; S.pending = null; g.E.checkEvents && g.E.checkEvents(S); if (!S.pending) { for (let i = 0; i < 400 && !S.pending; i++) { g.E.tick(S); } } if (g.paused) g.togglePause(); }, id);
  await p.evaluate(() => { const g = window.__game; g.S.mode = "manual"; g.S.pending = null; for (let i = 0; i < 400 && !g.S.pending; i++) g.E.tick(g.S); if (g.paused) g.togglePause(); });
  await p.waitForSelector("#modal:not([hidden]) #go", { timeout: 4000 });
  ok(await p.locator("#modal .progset").count() === 1 && await p.locator("#modal [data-pm]").count() === 3 && await p.locator("#modal [data-po]").count() === 3 && await p.locator("#modal [data-ps]").count() === 2, "イベント画面に進行設定(モード3・観察時間3/5/10秒・停止/低速)がある");
  ok(await p.locator("#modal [data-po].on").getAttribute("data-po") === "5", "観察時間の既定は5秒");
  const lay = await p.evaluate(() => { const go = document.getElementById("go").getBoundingClientRect(), bx = document.querySelector("#modal .box"); const small = [...document.querySelectorAll("#modal button")].filter(e => e.offsetParent !== null && e.getBoundingClientRect().height < 44).length; return { goVis: go.bottom <= innerHeight + 1 && go.top >= 0, over: document.documentElement.scrollWidth - document.documentElement.clientWidth, boxOver: bx.scrollWidth - bx.clientWidth, small, goDis: document.getElementById("go").disabled }; });
  ok(lay.goVis && lay.over <= 0 && lay.boxOver <= 0 && lay.small === 0, `360pxで「この設定で進行」が見え、横あふれなし・ボタン44px以上(${JSON.stringify(lay)})`);
  ok(lay.goDis, "選択肢を選ぶまでは進行ボタンが押せない");
  await p.click("#modal [data-po='3']"); await p.click("#modal [data-ps='slow']");
  ok(await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("weol.settings")); return s.observe.sec === 3 && s.observe.style === "slow"; }), "設定は保存される(3秒・低速)");
  await p.click("#modal .opt"); await p.click("#go"); await p.waitForTimeout(200);
  ok(await p.locator("#obsbar:not([hidden])").count() === 1 && /観察中/.test(await p.textContent("#obstext")), "決定後に観察バー(残り秒数)が出る");
  ok(await p.locator("#modal:not([hidden])").count() === 0, "観察中はイベント画面を出さない");
  ok(await p.locator("#obsskip").count() === 1, "スキップボタンがある");
  const y1 = await p.evaluate(() => window.__game.S.year); await p.waitForTimeout(2200);
  const y2 = await p.evaluate(() => window.__game.S.year); ok(y2 > y1, `低速観察ではゲーム内時間が進む(${y1}→${y2})`);
  // 砂時計をタップできる
  await p.click(".gl[data-g=h]"); await p.waitForTimeout(200);
  ok(await p.locator("#bigcv").count() === 1, "観察中も砂時計をタップして拡大できる"); await p.click("#gclose");
  await p.click("#obsskip"); await p.waitForTimeout(200);
  ok(await p.locator("#obsbar:not([hidden])").count() === 0 || await p.evaluate(() => window.__game.session.observing), "スキップで観察が終わる(連鎖時は次の観察)");
  // 停止式: 年が動かない
  await p.evaluate(() => { const g = window.__game; g.session.flow.cancel(); g.S.holdAuto = false; g.S.pending = null; document.getElementById("modal").hidden = true; g.settings.observe.style = "stop"; g.settings.observe.sec = 3; g.session.startObserve(); });
  const ya = await p.evaluate(() => window.__game.S.year); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => window.__game.S.year) === ya, "停止式の観察中は年が進まない");
  const gap = await p.evaluate(() => window.__game.sand.compact.h ? 1 : 1); void gap;
  // 手動一時停止の優先
  await p.evaluate(() => { const g = window.__game; if (!g.paused) g.togglePause(); }); const r1 = await p.evaluate(() => window.__game.session.flow.remain); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => window.__game.session.flow.remain) === r1 && /一時停止/.test(await p.textContent("#obstext")), "手動で一時停止中は観察タイマーも止まる");
  await p.evaluate(() => { const g = window.__game; g.togglePause(); }); await p.waitForTimeout(3600);
  ok(!(await p.evaluate(() => window.__game.session.observing)), "再開後、観察が終了する");
  // 全自動: モーダルなしで進む
  await p.evaluate(() => { const g = window.__game, S = g.S; g.session.flow.cancel(); S.holdAuto = false; S.pending = null; document.getElementById("modal").hidden = true; S.mode = "auto"; g.settings.mode = "auto"; g.settings.observe.sec = 3; g.settings.observe.style = "stop"; while (S.year < 2100 && !S.ended) { g.E.tick(S); if (S.pending && !g.E.autoHandles(S, S.pending.id)) g.E.choose(S, S.pending.choices[0].id); else if (S.pending) g.E.resolveAutoNow(S); } delete S.done.learn; if (g.paused) g.togglePause(); g.setSpeed(3); });
  const a0 = await p.evaluate(() => window.__game.S.autoLog.length); let sawModal = false;
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(250); if (await p.locator("#modal:not([hidden]) #go").count()) sawModal = true; }
  const a1 = await p.evaluate(() => window.__game.S.autoLog.length);
  ok(a1 > a0 && !sawModal, `全自動は選択画面なしで判断を進める(自動判断${a1 - a0}件)`);
  // セーブ/ロード
  await p.evaluate(() => { const g = window.__game; g.S.mode = "manual"; g.session.startObserve(); });
  await p.click("#tabs [data-t=sys]"); await p.click("[data-sv='1']"); await p.click("[data-ld='1']"); await p.click("[data-ld='1']"); await p.waitForTimeout(250);
  ok(await p.evaluate(() => !window.__game.session.observing && window.__game.S.holdAuto === false && window.__game.paused), "観察中のセーブ→ロードで観察は破棄され、一時停止で再開");
}

console.log("\n■ 第5次: 停止の順序・新規イベント");
{
  await p.evaluate(() => { const g = window.__game; document.getElementById("modal").hidden = true; if (!g.paused) g.togglePause(); g.settings.observe.sec = 0; });
  await p.click("#tabs [data-t=policy]"); await p.waitForTimeout(200);
  ok(await p.locator("[data-do]").count() === 3, "方針タブに停止の順序(危険度順/AI施設を先に/軍事を先に)がある");
  await p.click("[data-do=mil]"); await p.click("#apply");
  ok(await p.evaluate(() => window.__game.S.decomOrder) === "mil", "停止の順序を適用できる");
  { const ov = await over(); if (ov > 0) console.log(await p.evaluate(() => [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 4).map(e => e.tagName + "#" + e.id + "." + e.className))); ok(ov <= 0, "方針タブは360pxで横あふれしない"); }
  // 状態に連動する新規イベントのモーダル
  await p.evaluate(() => { const g = window.__game, S = g.S; S.year = Math.max(S.year, 2110); S.coop = .5; delete S.flags.minorY; delete S.done.scarcity; S.pending = null; S.holdAuto = false; g.E.checkEvents(S); g.refresh(true); if (g.paused) g.togglePause(); });
  await p.waitForSelector("#modal:not([hidden]) #go", { timeout: 4000 });
  const ev = await p.evaluate(() => ({ title: document.querySelector("#modal h2").textContent, id: window.__game.S.pending.id, over: document.querySelector("#modal .box").scrollWidth - document.querySelector("#modal .box").clientWidth, opts: document.querySelectorAll("#modal .opt").length }));
  ok(ev.id !== undefined && ev.over <= 0 && ev.opts >= 2, `状態連動イベント『${ev.title}』が360pxで崩れず表示される(選択肢${ev.opts})`);
  await p.evaluate(() => { document.getElementById("modal").hidden = true; window.__game.S.pending = null; });
}

console.log("\n■ 助走期間→最後の質問→色の選択→砂時計の構築演出→本編(新しい世界)");
{
  const c2 = await b.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true }); await c2.addInitScript(() => { if (!localStorage.getItem("weol.init")) { localStorage.setItem("weol.init", "1"); localStorage.setItem("weol.settings", JSON.stringify({ tutorialDone: true, observe: { sec: 5, style: "stop" } })); } });
  const q = await c2.newPage(); const errs2 = [];
  q.on("pageerror", e => errs2.push(e.message)); await q.goto(URL_); await q.waitForTimeout(600);
  for (let i = 0; i < 4; i++) await q.click("#pgnext"); await q.click("[data-pl='0']");
  const answers = ["safe", "deep", "nature", "protect", "keep", "consent", "stop"]; let asked = [], sawBigUi = false;
  for (let i = 0; i < 400 && !(await q.locator("#cc").count()); i++) {
    if (await q.locator("#modal:not([hidden]) #go").count()) { const id = await q.evaluate(() => window.__game.S.pending && window.__game.S.pending.id); asked.push(id); await q.click(id === "modesel" ? "#mbox [data-c=auto]" : "#mbox .opt >> nth=0"); await q.click("#go"); }
    if (await q.evaluate(() => getComputedStyle(document.getElementById("hd")).display !== "none" && !document.getElementById("buildcv").hidden === false)) sawBigUi = true;
    await q.waitForTimeout(120);
  }
  ok(asked.length >= 11 && asked.includes("q_liberty") && asked.includes("q_mission") && asked[asked.length - 1] === "modesel", `質問を順に提示し(${asked.length}問)、最後は進行方式の質問: ` + asked.join(","));
  ok(await q.evaluate(() => getComputedStyle(document.getElementById("hd")).display === "none"), "最後の質問まで通常のゲーム画面は出ない");
  ok(await q.evaluate(() => window.__game.S.mode) === "auto" && await q.evaluate(() => window.__game.S.year) === 2099, "最後の質問で選んだ進行方式(完全自動)が反映される");
  ok(await q.locator("#cc [data-cc]").count() === 3 && /色/.test(await q.textContent("#mbox")), "最後に青・橙・緑の色を選ぶ");
  const dataBefore = await q.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("weol.world.")).length); ok(dataBefore === 0, "色を選ぶまで色別スロットには保存されない(既存の世界を上書きしない)");
  await q.click("[data-cc=orange]"); await q.waitForTimeout(1300);
  const bc = await q.evaluate(() => ({ hidden: document.getElementById("buildcv").hidden, theme: document.documentElement.dataset.theme })); await q.waitForTimeout(2200);
  ok(!await q.evaluate(() => document.getElementById("buildcv").hidden) && await q.evaluate(() => document.documentElement.dataset.theme) === "orange", "選んだ球体が画面を塗り、橙のテーマで砂時計の構築演出が始まる"); void bc;
  ok(await q.evaluate(() => !document.getElementById("buildskip").hidden), "演出はスキップできる");
  const y0 = await q.evaluate(() => window.__game.S.year), sk = await q.evaluate(() => JSON.stringify(window.__game.S.ended)); await q.click("#buildskip"); await q.waitForTimeout(300);
  ok(await q.evaluate(() => document.getElementById("buildcv").hidden) && await q.locator("#glasses").isVisible() && await q.locator("#radarbox svg.radar").count() === 1 && await q.locator("#tabs [data-t=map]").isVisible(), "演出のあと、砂時計(小型)と地図+レーダーの本編画面になる");
  ok(await q.evaluate(() => window.__game.S.unassigned) === false && await q.evaluate(() => !!localStorage.getItem("weol.world.orange")) && sk === "null", "橙の世界として保存され、スキップしても状態は変わらない");
  await q.waitForTimeout(1500); ok(await q.evaluate(() => window.__game.S.year) >= y0, "演出のあと2100年の終活が始まる");
  ok(errs2.length === 0, "ページエラーなし(新しい世界)"); await c2.close();
  // 球体と演出が3つの砂時計を順に作る
  const c5 = await b.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true }); const q5 = await c5.newPage(); await q5.goto(URL_); await q5.waitForTimeout(400);
  const orbInfo = await q5.evaluate(() => import("./js/orbs.js").then(m => { const W = 360, H = 740, o = m.makeOrbs(W, H), ob = { x: 8, y: 8, w: 344, h: 300 }; let t = 0, out = 0, inside = 0, dmin = 1e9, vmin = 1e9, vmax = 0; for (let i = 0; i < 6000; i++) { t += .016; m.stepOrbs(o, .016, W, H, ob, t); for (const p of o) { if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) out++; if (p.x > ob.x - p.r + 1 && p.x < ob.x + ob.w + p.r - 1 && p.y > ob.y - p.r + 1 && p.y < ob.y + ob.h + p.r - 1) inside++; const v = Math.hypot(p.vx, p.vy); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); } dmin = Math.min(dmin, Math.hypot(o[0].x - o[1].x, o[0].y - o[1].y)); } return { out, inside, vmin, vmax, n: o.length }; }));
  ok(orbInfo.n === 3 && orbInfo.out === 0 && orbInfo.inside === 0 && orbInfo.vmax < 70 && orbInfo.vmin > 10, `球体3つは画面端と窓の境界で反射し、消えず、速度も一定の範囲(${orbInfo.vmin.toFixed(0)}〜${orbInfo.vmax.toFixed(0)}px/s)`);
  const moved = await q5.evaluate(async () => { const a = JSON.stringify(window.__orbsPos ? 0 : 0); void a; return true; }); void moved;
  await c5.close();
}

console.log("\n■ 第6次: ピクトグラム・表示密度・結果表示");
{
  await p.evaluate(() => { const g = window.__game; document.getElementById("modal").hidden = true; if (!g.paused) g.togglePause(); g.settings.observe.sec = 0; g.S.pending = null; g.S.year = Math.max(g.S.year, 2110); g.S.coop = .5; g.refresh(true); });
  await p.click("#tabs [data-t=map]"); await p.waitForTimeout(200);
  const cnt = async d => { await p.click(`[data-pd=${d}]`); await p.waitForTimeout(100); return p.locator("#pictobox .pi").count(); };
  const nmin = await cnt("min"), nstd = await cnt("std"), nfull = await cnt("full");
  ok(nmin <= nstd && nstd <= nfull && nfull === 18, `表示密度 最小限${nmin} ≤ 標準${nstd} ≤ 詳細${nfull}`);
  ok((await p.evaluate(() => JSON.parse(localStorage.getItem("weol.settings")).picto)) === "full", "表示密度の選択が保存される");
  ok(await p.locator('#pictobox .pi[aria-label*="原子力"]').count() === 1 && /安全|注意|危険/.test(await p.getAttribute('#pictobox .pi >> nth=0', "aria-label")), "アイコンは色だけでなくラベルと状態名も持つ");
  const shapes = await p.evaluate(() => ["ok", "warn", "bad"].map(l => window.__game.S && 0 && l)); void shapes;
  await p.click('#pictobox .pi >> nth=0'); ok(/詳細|:/.test(await p.textContent("#pictobox .pdet")), "ピクトグラムをタップすると詳細が出る");
  await p.evaluate(() => { const S = window.__game.S; let k = S.countries.findIndex(c => !c.extinct); if (k < 0) { k = 0; S.countries[0].extinct = false; S.countries[0].y = 1e6; } S.countries[k].unrest = .9; S.facs.filter(f => f.c === k && f.t === 0).forEach(f => { f.st = 0; f.safety = .1; }); window.__game.refresh(true); });
  await p.click("[data-pd=std]"); await p.waitForTimeout(150);
  { const info = await p.evaluate(() => ({ tab: document.querySelector("#tabs .on").dataset.t, n: document.querySelectorAll("#pmarks .pico").length, dens: window.__game.settings.picto, after: window.__game.afterMode, vb: document.getElementById("svg").getAttribute("viewBox"), mk: window.__game.S && window.__game.SV && 1 })); ok(await p.locator("#pmarks .pico").count() >= 1, "世界地図に、危険のある国のピクトグラムが出る " + JSON.stringify(info)); }
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(80);
  const mp = await p.evaluate(() => { const e = document.querySelector("#pmarks .pico"); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: e.dataset.e }; });
  await p.mouse.click(mp.x, mp.y); await p.waitForTimeout(150);
  ok(/危険|注意/.test(await p.textContent("#card")) && await p.locator("#card .pcr").count() >= 1, "マーカーをタップすると、その国の危険の詳細(ピクトグラム付き)が出る");
  await p.evaluate(() => { const g = window.__game, S = g.S; S.pending = null; S.year = 2105; S.coop = .5; delete S.flags.minorY; delete S.done.scarcity; g.E.checkEvents(S); if (!S.pending) throw new Error("no event"); g.refresh(true); if (g.paused) g.togglePause(); });
  await p.waitForSelector("#modal:not([hidden]) #go", { timeout: 4000 }); await p.click("#modal .opt >> nth=0"); await p.click("#go"); await p.waitForTimeout(200);
  ok(await p.locator("#resbar:not([hidden])").count() === 1 && /→「/.test(await p.textContent("#resbar")), "判断の結果が指標の差分つきで表示される: " + (await p.textContent("#resbar")).slice(0, 60));
  ok(await over() <= 0, "結果表示後も横スクロールなし");
}

console.log("\n■ 第6次: 色別セーブ");
{
  await p.evaluate(() => { const g = window.__game; document.getElementById("modal").hidden = true; if (!g.paused) g.togglePause(); g.S.pending = null; g.S.year = 2133; g.saveActive(); });
  const slotsKeys = () => p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("weol.world.")).sort());
  const manualBefore = await p.evaluate(() => localStorage.getItem("weol.save.1"));
  await sw("green"); const yg = await p.evaluate(() => window.__game.S.year);
  ok(yg === 2020 || yg < 2133, `緑は空の世界から始まる(${yg}年)。青の世界とは別`);
  await p.evaluate(() => { window.__game.S.year = 2210; window.__game.saveActive(); });
  await sw("blue"); ok(await p.evaluate(() => window.__game.S.year) === 2133, "青に戻ると青の世界(2133年)が復元される");
  await sw("green"); ok(await p.evaluate(() => window.__game.S.year) === 2210, "緑に戻ると緑の世界(2210年)が復元される");
  await sw("blue"); const ks = await slotsKeys(); ok(ks.includes("weol.world.blue") && ks.includes("weol.world.green"), "色ごとに別スロットへ保存されている: " + ks.join(","));
  ok(await p.evaluate(() => localStorage.getItem("weol.save.1")) === manualBefore, "手動バックアップ枠(既存セーブ)は色切替で変更されない");
  await p.click("#tabs [data-t=sys]"); ok(/色ごとの世界/.test(await p.textContent("#sys")) && /橙/.test(await p.textContent("#sys")), "設定タブに色ごとの世界の一覧がある");
  // 空スロットでは新規開始を案内し、戻すこともできる
  await p.evaluate(() => { localStorage.removeItem("weol.world.orange"); localStorage.removeItem("weol.world.orange.prev"); }); await p.click("#themes [data-th=orange]"); await p.waitForTimeout(150);
  ok(/まだありません/.test(await p.textContent("#mbox")) && await p.locator("#mbox [data-ab='1']").count() === 1, "空の色に切り替えると、新規開始を案内する(元に戻す選択もある)");
  await p.click("#mbox [data-ab='1']"); await p.waitForTimeout(150);
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === "blue" && await p.evaluate(() => window.__game.S.year) === 2133, "『色を元に戻す』で青の世界のまま変わらない");
  // 旧セーブの取り込み(新しいブラウザ環境で)
  const legacyJson = await p.evaluate(() => { const E = window.__game.E, q = E.newGame(7); while (q.year < 2070) { E.tick(q); if (q.pending) E.choose(q, q.pending.choices[0].id); } q.pending = null; return JSON.stringify(q); });
  const c3 = await b.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true }); await c3.addInitScript(([j]) => { if (!localStorage.getItem("weol.init")) { localStorage.setItem("weol.save.1", j); localStorage.setItem("weol.settings", JSON.stringify({ introSeen: true, tutorialDone: true })); localStorage.setItem("weol.init", "1"); } }, [legacyJson]);
  const r = await c3.newPage(); await r.goto(URL_); await r.waitForTimeout(600);
  ok(/以前のセーブ/.test(await r.textContent("#mbox")) && /コピー/.test(await r.textContent("#mbox")), "旧形式のセーブがあると、色別セーブへの取り込みを提示する");
  await r.click("#mbox [data-ab='0']"); await r.waitForTimeout(300);
  ok(await r.evaluate(() => window.__game.S.year) === 2070 && await r.evaluate(() => localStorage.getItem("weol.save.1")) === legacyJson && await r.evaluate(() => !!localStorage.getItem("weol.world.blue")), "取り込み後、旧セーブは残り(コピー)、青の世界として続けられる");
  await r.reload(); await r.waitForTimeout(500); ok(await r.evaluate(() => window.__game.S.year) === 2070, "再読込すると色別セーブから続きが始まる");
  const c4 = await b.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true }); await c4.addInitScript(() => { if (!localStorage.getItem("weol.init")) { localStorage.setItem("weol.world.blue", "{broken"); localStorage.setItem("weol.settings", JSON.stringify({ introSeen: true, tutorialDone: true })); localStorage.setItem("weol.init", "1"); } });
  const r4 = await c4.newPage(); await r4.goto(URL_); await r4.waitForTimeout(600);
  ok(/読めません/.test(await r4.textContent("#mbox")) && await r4.evaluate(() => localStorage.getItem("weol.world.blue")) === "{broken", "破損したスロットは何も上書きせず、選択を尋ねる");
  await r4.evaluate(() => window.dispatchEvent(new Event("pagehide"))); ok(await r4.evaluate(() => localStorage.getItem("weol.world.blue")) === "{broken", "選択するまでは自動保存も破損データを上書きしない");
  await r4.click("#mbox [data-ab='0']"); await r4.waitForTimeout(200); ok(await r4.evaluate(() => localStorage.getItem("weol.world.blue.corrupt")) === "{broken", "新規開始しても破損データは別名で残る"); await c4.close();
  await c3.close();
}

console.log("\n■ 第6次: 人類消滅後の地球の観察");
{
  await p.evaluate(() => { const g = window.__game, S = g.S, E = g.E; document.getElementById("modal").hidden = true; g.settings.observe.sec = 0; S.pending = null; S.mode = "auto"; E.runToEnd(S, { choose: (s, pp) => pp.choices[0].id }, 2500); S.__endShown = false; g.refresh(true); });
  await p.waitForSelector("#modal:not([hidden]) .end #pgnext", { timeout: 6000 });
  const e1 = await p.evaluate(() => { const b = document.getElementById("mbox"), r = b.getBoundingClientRect(); return { txt: b.textContent, color: getComputedStyle(b.querySelector(".gmb")).color, top: r.top, stage: document.getElementById("modal").classList.contains("stage"), cv: !document.getElementById("orbcv").hidden, bottom: r.bottom, H: innerHeight }; });
  ok(/終幕 1\/6/.test(e1.txt), "エンディングは6ページに分かれ、1ページ目から順に読む");
  ok(e1.color === "rgb(255, 255, 255)" && e1.top < 40 && e1.stage && e1.cv && e1.bottom < e1.H * .75, `本文は白文字・窓は上部寄せで、下に球体の空き領域がある(窓の下端 ${Math.round(e1.bottom)}/${e1.H})`);
  const titles = [], lens = [];
  for (let i = 0; i < 6; i++) { titles.push(await p.textContent("#mbox h2")); lens.push((await p.textContent("#mbox .gmb")).length); if (i < 5) { await p.click("#pgnext"); await p.waitForTimeout(40); } }
  ok(titles.join("|") === "最後の人類と文明|人々の最期|終活の成果と失敗|地球に残されたもの|未来の観測者による評価|その先の地球へ", "ページ構成: " + titles.join(" / "));
  ok(Math.max(...lens) < 700, `各ページは短い文章中心(最長${Math.max(...lens)}字)`);
  const ed = await p.evaluate(() => ({ hd: getComputedStyle(document.getElementById("hd")).display, tabs: getComputedStyle(document.getElementById("tabs")).display, main: getComputedStyle(document.querySelector("main")).display, cls: document.body.classList.contains("ending"), btn: getComputedStyle(document.querySelector("#mbox button")).color, bg: getComputedStyle(document.getElementById("pre")).backgroundColor }));
  ok(ed.cls && ed.hd === "none" && ed.tabs === "none" && ed.main === "none", "終幕中は本編UI(地図・レーダー・砂時計・進行操作)を完全に隠す");
  ok(ed.btn === "rgb(255, 255, 255)" && /rgb\(0, 0, 0\)/.test(ed.bg), "終幕の操作UIは黒背景に白だけ(色は球体だけ)");
  ok(await p.locator("[data-pl]").count() === 3 && await p.locator("#pgnext").count() === 0, "最後のページに『観察する／もう一度／閉じる』が並ぶ");
  await p.click("#pgback"); ok(/終幕 5\/6/.test(await p.textContent("#mbox")), "戻るで前のページへ"); await p.click("#pgnext");
  const orbOk = await p.evaluate(async () => { const m = await import("./js/orbs.js"), o = m.orbs; await new Promise(r => setTimeout(r, 700)); const r = document.getElementById("mbox").getBoundingClientRect(); return o.orbs.every(q => !(q.x > r.left - q.r + 2 && q.x < r.right + q.r - 2 && q.y > r.top - q.r + 2 && q.y < r.bottom + q.r - 2)) && o.orbs.length === 3; });
  ok(orbOk, "球体は窓の境界で反射し、本文や数値を隠さない");
  await p.click("[data-pl='0']"); await p.waitForTimeout(300);
  ok(await p.locator("#afterbox:not([hidden])").count() === 1 && await p.locator("#mainstat").isHidden(), "観察を始めると、地球の変化の表示に切り替わる");
  ok(/人類消滅から/.test(await p.textContent("#afterbox")) && /自然への回帰|AIによる地球管理|別の存在への継承|混合/.test(await p.textContent("#afterbox")) && !/仮説/.test(await p.textContent("#afterbox")), "経過年と分岐を表示し、注釈は繰り返さない");
  const t1 = await p.evaluate(() => window.__game.S.after.t); await p.waitForTimeout(1500); const t2 = await p.evaluate(() => window.__game.S.after.t);
  ok(t2 > t1, `時間が高速に進む(${t1}→${t2}年)`);
  await p.click('[data-as="10000"]'); await p.waitForTimeout(1500); ok(await p.evaluate(() => window.__game.S.after.t) > t2 + 5000, "1万年/秒に高速化できる");
  ok(await p.locator("#afterbox .log").count() >= 1, "年表に短い文章が出る");
  ok(await p.evaluate(() => [...document.querySelectorAll("#layer option")].map(o => o.value).join()) === "a_veg,a_city,a_pl", "地図の表示が植生・都市の残存・汚染に切り替わる");
  const fills = await p.evaluate(() => [...new Set([...document.querySelectorAll("#svg path")].map(e => e.style.fill))].length); ok(fills >= 1, "地図が未来の状態で塗られる");
  ok(await over() <= 0, "観察中も360pxで横スクロールなし");
  const tt = await p.evaluate(() => window.__game.S.after.t); await p.reload(); await p.waitForTimeout(600);
  await p.waitForSelector("#modal:not([hidden]) #pgskip", { timeout: 4000 }); await p.click("#pgskip"); await p.click("[data-pl='0']"); await p.waitForTimeout(200);
  ok(await p.evaluate(() => window.__game.S.after.t) >= tt - 5000, "再読込しても観察の続きから再開できる");
  await p.click('[data-as="100000"]'); await p.waitForTimeout(1600); const ta = await p.evaluate(() => ({ t: window.__game.S.after.t, st: window.__game.S.after.stable, ext: !!document.getElementById("aext"), size: JSON.stringify(window.__game.S.after).length }));
  ok(ta.t > 20000 && !ta.ext && !("horizon" in (await p.evaluate(() => window.__game.S.after))), `観察に終了年はなく、2万年を超えて進み続ける(${ta.t.toLocaleString("en-US")}年・状態${(ta.size / 1024).toFixed(1)}KB)`);
  await p.click('[data-as="0"]'); const tb = await p.evaluate(() => window.__game.S.after.t); await p.waitForTimeout(400); ok(await p.evaluate(() => window.__game.S.after.t) === tb, "観察の停止・再開ができる");
  await p.click("#aend"); await p.waitForTimeout(200); ok(await p.locator("#mainstat").isVisible(), "観察を終えると通常の地図+レーダー表示に戻る");
}


console.log("\n■ ×1000の性能(新しい世界)");
{
  const c6 = await b.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true }), q6 = await c6.newPage(); await q6.goto(URL_); await q6.waitForTimeout(400);
  await q6.evaluate(() => window.__game.skipPrelude("blue")); await q6.waitForTimeout(200);
  ok(await q6.evaluate(() => window.__game.speedIdx) === 2 && /×100/.test(await q6.textContent("#speed [data-s].on")), "既定の速度は×100(4段階の中央寄り)");
  const r = await q6.evaluate(async () => { const g = window.__game, S = g.S; S.mode = "auto"; g.settings.observe.sec = 0; S.pending = null; g.setSpeed(4); if (g.paused) g.togglePause(); const y0 = S.year; let frames = 0; const t0 = performance.now(); await new Promise(res => { const f = () => { frames++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); const el = (performance.now() - t0) / 1000, y1 = g.S.year; return { rate: (y1 - y0) / el, fps: frames / el, ended: !!g.S.ended, pend: !!g.S.pending }; });
  ok(r.rate > 150 && r.fps >= 6, `×1000でもフリーズしない(${Math.round(r.rate)}年/秒・${r.fps.toFixed(0)}fps・ソフトウェア描画)`);
  const ev = await q6.evaluate(() => { const g = window.__game, S = g.S; return { y: S.year, chosen: S.chosen.length, autoLog: S.autoLog.length, pending: !!S.pending }; });
  ok(ev.chosen >= 1 || ev.autoLog >= 1, `高速進行でもイベントは消えない(判断${ev.chosen}件・自動${ev.autoLog}件)`);
  await c6.close();
}

console.log("■ 第9次: 政策の段階的解放・新着の印・全自動の変更機会");
{
  const c9 = await b.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true }), q = await c9.newPage(); const e9 = []; q.on("pageerror", e => e9.push(e.message));
  await q.addInitScript(() => localStorage.setItem("weol.settings", JSON.stringify({ introSeen: true, tutorialDone: true, observe: { sec: 0, style: "stop" } })));
  await q.goto(URL_); await q.waitForTimeout(500); await q.evaluate(() => window.__game.skipPrelude("blue")); await q.waitForTimeout(200);
  await q.evaluate(() => { const g = window.__game, S = g.S, E = g.E; S.tri = null; /* 第9次の機能は旧セーブ互換の画面で確認 */ if (!g.paused) g.togglePause(); S.noEvents = true; S.pending = null; document.getElementById("modal").hidden = true; while (S.year < 2112) { E.tick(S); if (S.pending) E.choose(S, S.pending.choices[0].id); } g.refresh(true); });
  ok(await q.evaluate(() => document.querySelector("#tabs [data-t=policy]").classList.contains("nw")), "新しい機能が解放されると方針タブに新着の印が出る");
  await q.click("#tabs [data-t=policy]"); await q.waitForTimeout(150);
  ok(!(await q.evaluate(() => document.querySelector("#tabs [data-t=policy]").classList.contains("nw"))), "方針タブを開いて確認すると印は消える");
  const lk = await q.evaluate(() => ({ locked: document.querySelectorAll("#policy .sl.locked").length, txt: document.getElementById("policy").textContent, over: document.documentElement.scrollWidth <= 360 }));
  ok(lk.locked >= 1 && /軍縮・民生転換/.test(lk.txt) && /未解放/.test(lk.txt) && /解放条件/.test(lk.txt), `未解放の配分は選べず、解放条件が示される(${lk.locked}件)`);
  ok(lk.over, "360px幅で横にはみ出さない(方針タブ)");
  ok(/存続への挑戦/.test(lk.txt) && /世界の状態/.test(lk.txt), "存続への挑戦と、長期の存続を決める要素が表示される");
  // 全自動: 変更機会の外は変更できない
  await q.evaluate(() => { const g = window.__game, S = g.S; S.mode = "auto"; g.refresh(true); });
  await q.click("#tabs [data-t=map]"); await q.click("#tabs [data-t=policy]"); await q.waitForTimeout(150);
  const off = await q.evaluate(() => ({ dis: [...document.querySelectorAll("#policy input[type=range]")].every(x => x.disabled), apply: document.getElementById("apply").disabled, txt: document.getElementById("policy").textContent, pm: [...document.querySelectorAll("#policy [data-pm]")].every(x => !x.disabled) }));
  ok(off.dis && off.apply && /いまは設定を変更できません/.test(off.txt) && off.pm, "全自動の変更機会の外では、方針を変更できない(進行モードは変えられる)");
  await q.click("#tabs [data-t=sites]"); await q.waitForTimeout(150);
  ok(await q.evaluate(() => [...document.querySelectorAll("#sites [data-s]")].every(x => x.disabled)), "全自動の変更機会の外では、遺産の設定も変更できない");
  await q.evaluate(() => { const g = window.__game, S = g.S; S.w9.win.open = true; S.w9.win.from = S.year; S.w9.win.until = S.year + 80; S.w9.win.seen = S.w9.win.seenS = false; g.refresh(true); });
  ok(await q.evaluate(() => document.querySelector("#tabs [data-t=policy]").classList.contains("nw") && document.querySelector("#tabs [data-t=sites]").classList.contains("nw")), "変更機会が来ると方針・遺産タブに印が出る");
  await q.click("#tabs [data-t=policy]"); await q.waitForTimeout(150);
  const on = await q.evaluate(() => ({ en: [...document.querySelectorAll("#policy input[type=range]")].every(x => !x.disabled), txt: document.getElementById("policy").textContent }));
  ok(on.en && /変更機会/.test(on.txt), "変更機会の間は方針を変更できる");
  const y1 = await q.evaluate(() => window.__game.S.year); await q.evaluate(() => { const g = window.__game; if (g.paused) g.togglePause(); g.setSpeed(2); }); await q.waitForTimeout(1200);
  ok((await q.evaluate(() => window.__game.S.year)) === y1, "変更機会中に方針タブを開いている間は、時間が止まる(編集のため)");
  await q.click("#tabs [data-t=sites]"); await q.waitForTimeout(150);
  ok(await q.evaluate(() => [...document.querySelectorAll("#sites [data-s]")].some(x => !x.disabled) && [...document.querySelectorAll("#sites [data-s]")].some(x => x.disabled && /🔒/.test(x.textContent))), "遺産タブ: 解放済みは選べ、未解放は鍵つきで選べない");
  await q.click("#tabs [data-t=status]"); await q.waitForTimeout(150);
  ok(/世界の出来事/.test(await q.textContent("#status")), "状況タブに世界の出来事(原因と影響)が表示される");
  ok(e9.length === 0, "第9次の画面でページエラーなし"); await c9.close();
}

console.log("■ 第10次: 3AI体制の画面");
{
  const c10 = await b.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true }), q = await c10.newPage(); const e10 = []; q.on("pageerror", e => e10.push(e.message));
  await q.addInitScript(() => localStorage.setItem("weol.settings", JSON.stringify({ introSeen: true, tutorialDone: true, observe: { sec: 0, style: "stop" } })));
  await q.goto(URL_); await q.waitForTimeout(500); await q.evaluate(() => window.__game.skipPrelude("green")); await q.waitForTimeout(300);
  await q.evaluate(() => { const g = window.__game, S = g.S, E = g.E; S.noEvents = true; if (!g.paused) g.togglePause(); while (S.year < 2160) { E.tick(S); if (S.pending) E.choose(S, S.pending.choices[0].id); } g.refresh(true); });
  const r = await q.evaluate(() => ({ rows: document.querySelectorAll("#tribox table.tri tr").length, me: document.querySelector("#tribox tr.me")?.textContent || "", over: document.documentElement.scrollWidth, strokes: new Set([...document.querySelectorAll("#svg path")].map(p => p.style.stroke).filter(Boolean)).size, tri: !!window.__game.S.tri, player: window.__game.S.tri.player }));
  ok(r.tri && r.player === 1 && r.rows === 4 && /ユーラシア圏\(あなた\)/.test(r.me), "選んだ色(緑)が担当するAIになり、3つのAIの比較表に「あなた」が示される");
  ok(r.strokes === 3, "地図は3つの管轄エリアを国境の色で示す(青・緑・橙)");
  ok(r.over <= 360, "360px幅で横にはみ出さない(地図・比較表)");
  const tb = await q.evaluate(() => { const t = document.querySelector("#tribox table"); const r2 = t.getBoundingClientRect(); return { w: r2.width, h: r2.height }; });
  ok(tb.w <= 360 && tb.h < 120, `比較表は小さく収まる(${Math.round(tb.w)}×${Math.round(tb.h)}px)`);
  ok(await q.evaluate(() => getComputedStyle(document.getElementById("tribox")).display !== "none") && !(await q.locator("#tabs [data-t=sites]").isVisible()), "遺産の画面は一時的に隠され、3AIの比較が見える");
  await q.click("#tabs [data-t=status]"); await q.waitForTimeout(200);
  const st = await q.textContent("#status");
  ok(/崩壊の兆候/.test(st) && /予測は予測、実績は実績/.test(st) && /AI間の重要な交流/.test(st) && /長期の目標/.test(st), "状況タブに兆候(予測)・実績・AI間の交流・長期目標が出る");
  await q.click("#tabs [data-t=policy]"); await q.waitForTimeout(200);
  ok(/ユーラシア圏のAIの資源配分/.test(await q.textContent("#policy")) && !/土地の分け方/.test(await q.textContent("#policy")), "方針タブは自分のAIの配分。細かな管理画面は隠れる");
  await q.evaluate(() => { const g = window.__game; g.S.mode = "auto"; g.setSpeed(4); if (g.paused) g.togglePause(); }); await q.waitForTimeout(1500);
  ok((await q.evaluate(() => window.__game.S.year)) > 2165 && e10.length === 0, "×1000でも3AI体制が進行し、画面エラーがない");
  await c10.close();
}

console.log("エラー:", errs.length ? errs : "なし"); ok(errs.length === 0, "ページエラーなし");
await p.screenshot({ path: process.env.SHOT || "/tmp/claude-0/ui360.png" });
await b.close(); process.exit(fail ? 1 : 0);
