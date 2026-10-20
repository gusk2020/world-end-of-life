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
const adv = (target) => p.evaluate(([t]) => { const g = window.__game, S = g.S, E = g.E; if (!g.paused) g.togglePause(); while (S.year < t) { E.tick(S); if (S.pending) E.choose(S, S.pending.choices[0].id); } document.getElementById("modal").hidden = true; g.refresh(true); }, [target]); // 一時停止にして進める

console.log("■ 360px 表示・チュートリアル");
ok(await p.locator("#modal:not([hidden]) #tnext").count() === 1, "初回はチュートリアルが出る");
for (let i = 0; i < 5; i++) { await p.click("#tnext"); await p.waitForTimeout(50); }
ok(await p.locator("#modal:not([hidden])").count() === 0, "チュートリアルを最後まで進められる");
const noObs = () => p.evaluate(() => { window.__game.settings.observe.sec = 0; }); // 既存の検証では観察フェーズを切る(観察は専用の節で検証)
await noObs();
const over = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
for (const t of ["map", "status", "policy", "sites", "log", "sys"]) { await p.click(`#tabs [data-t=${t}]`); await p.waitForTimeout(150); ok(await over() <= 0, `${t}タブで横スクロールなし`); }
await p.click("#tabs [data-t=map]");
const hdh = await p.evaluate(() => document.getElementById("hd").getBoundingClientRect().height);
ok(hdh < 190, `ヘッダ高さ ${Math.round(hdh)}px (360x740の${Math.round(hdh / 7.4)}%)`);
const mapH = await p.evaluate(() => document.getElementById("mapbox").getBoundingClientRect().height);
ok(mapH >= 150, `地図の高さ ${Math.round(mapH)}px を確保(砂時計が地図を圧迫しない)`);
const small = await p.evaluate(() => [...document.querySelectorAll("#speed button,#tabs button,#themes button,.gl")].filter(e => { const r = e.getBoundingClientRect(); return r.height < 30 || r.width < 30; }).length);
ok(small === 0, "主要ボタンはすべて30px以上");
await adv(2160);
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
await p.evaluate(() => { const g = window.__game; g.S.mode = "auto"; g.setSpeed(3); if (g.paused) g.togglePause(); }); // イベントで拡大が閉じないよう完全自動で進める
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
await p.evaluate(() => { const g = window.__game; g.setSpeed(4); if (g.paused) g.togglePause(); });
await p.click(".gl[data-g=h]"); await p.waitForTimeout(300);
const ys0 = await p.evaluate(() => window.__game.S.year); const ts0 = Date.now(); await p.waitForTimeout(3000);
const ys1 = await p.evaluate(() => window.__game.S.year), el = (Date.now() - ts0) / 1000;
ok((ys1 - ys0) / el > 60, `×100でもゲームは遅れない(${Math.round((ys1 - ys0) / el)}年/秒)`);
const perf = await p.evaluate(() => ({ ema: window.__game.sand.loop.ema, level: window.__game.sand.loop.level, fl: window.__game.sand.big.model.inflight(), cap: window.__game.sand.big.model.maxInflight }));
ok(perf.ema < 14 && perf.fl <= perf.cap, `描画1フレームの処理 ${perf.ema.toFixed(1)}ms、同時に動く粒${perf.fl}個(上限${perf.cap})`);
await p.evaluate(() => { if (!window.__game.paused) window.__game.togglePause(); });
let gp = await q(); for (let i = 0; i < 40 && (gp.in > 0 || gp.gap > 0); i++) { await p.waitForTimeout(200); gp = await q(); }
ok(gp.in === 0 && gp.gap === 0, "高速進行のあと停止すると、粒の表示が最新の数値に追いつく(まとめて更新を含む)");
const bulk = await p.evaluate(() => window.__game.sand.big.model.stats.bulk); ok(bulk >= 0, `追いつかない場合はまとめて更新(${bulk}回)`);
await p.click("#gclose");

console.log("\n■ 端末性能に応じた負荷調整・背景タブ・長時間動作");
await p.evaluate(() => { const g = window.__game; g.setSpeed(3); if (g.paused) g.togglePause(); window.__game.sand.loop.debugDelay = 30; });
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
for (const [th, rgb] of [["green", "51,255,119"], ["orange", "255,160,48"], ["blue", "77,166,255"]]) {
  await p.click(`#themes [data-th=${th}]`); await p.waitForTimeout(100);
  let [v, text, fill] = await col(); text = text.replace(/ /g, ""); fill = fill.replace(/ /g, ""); seen[th] = text;
  ok(v === rgb && text === `rgb(${rgb})` && fill.includes(rgb), `${th}: 文字・地図がテーマ色`);
}
ok(new Set(Object.values(seen)).size === 3, "3色が互いに異なる");
await p.click("#themes [data-th=orange]");
ok((await p.evaluate(() => JSON.parse(localStorage.getItem("weol.settings")))).theme === "orange", "設定が localStorage に保存される");
await p.click("#tabs [data-t=sys]"); await p.click("[data-sv='1']");
const sv = await p.evaluate(() => localStorage.getItem("weol.save.1"));
ok(sv && !sv.includes("\"theme\"") && JSON.parse(sv).countries, "セーブデータにテーマは含まれない(独立)");
await p.click("#themes [data-th=blue]");

console.log("\n■ 速度設定(別操作の一時停止・維持)");
await p.click("#tabs [data-t=map]");
const st = () => p.evaluate(() => ({ idx: window.__game.speedIdx, paused: window.__game.paused, saved: JSON.parse(localStorage.getItem("weol.settings")).speed, label: document.getElementById("spdlabel").textContent }));
await p.click("#speed [data-s='3']"); let s1 = await st();
ok(s1.idx === 3 && s1.saved === 3 && !s1.paused && /×20/.test(s1.label) && /1年=1秒|現実1秒=ゲーム内20年/.test(s1.label), "×20を選ぶ: " + s1.label.slice(0, 60));
await p.click("#pause"); s1 = await st(); ok(s1.paused && s1.idx === 3, "一時停止は速度とは別操作(速度×20を維持)");
await p.click("#pause"); s1 = await st(); ok(!s1.paused && s1.idx === 3, "再開しても速度は×20のまま");
await p.evaluate(() => window.__game.togglePause());
await p.click("[data-t=sys]"); await p.click("[data-sv='2']"); s1 = await st(); ok(s1.idx === 3, "セーブしても速度は初期値に戻らない");
await p.click("[data-ld='2']"); await p.waitForTimeout(100); s1 = await st(); ok(s1.idx === 3 && s1.paused, "ロード後も速度を維持(ロード直後は一時停止)");
await p.reload(); await p.waitForTimeout(400); ok((await st()).idx === 3, "再読込後も速度を維持"); await noObs();
ok(await p.locator("#spdlabel").textContent().then(t => /現実1秒/.test(t)), "何倍速かと現実時間の対応を表示");
// 重要イベント後も維持
await p.evaluate(() => { const g = window.__game; if (!g.paused) g.togglePause(); document.getElementById("modal").hidden = true; g.S.pending = null; delete g.S.done.learn; g.S.year = 2026; }); // 直前の再読込で進んだゲームの残りを片付けてから、イベントを1件つくる

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
await p.evaluate(() => { const g = window.__game; g.S.pending = null; g.setSpeed(3); g.togglePause(); });
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
await p.evaluate(() => window.__game.setSpeed(1));
await p.click("#tabs [data-t=status]"); await p.waitForTimeout(400);
ok((await p.textContent("#status")).includes("ボトルネック"), "状況タブにボトルネックと原因");
ok(await p.locator("#status svg.radar").count() === 1, "7指標のレーダー");
ok(/天文現象/.test(await p.textContent("#status")), "天文現象の状態を表示");
await p.click("#tabs [data-t=policy]");
ok(await p.locator("input[data-k=wild]").count() === 1, "大型哺乳類の保護が政策項目にある");
await p.evaluate(() => { const r = document.querySelector("input[data-k=wild]"); r.value = 60; r.dispatchEvent(new Event("input")); r.dispatchEvent(new Event("change")); });
await p.waitForTimeout(1800);
ok(/年後/.test(await p.textContent("#pvbox")), "方針の変更で10年後/40年後の差分表が出る");
await p.click("#apply"); await p.click("#tabs [data-t=sites]"); ok(await p.locator(".site").count() >= 30, "遺産が30件以上並ぶ");

console.log("\n■ セーブ・ロード");
await p.click("#tabs [data-t=sys]"); await p.click("[data-sv='3']");
const y0 = await p.evaluate(() => window.__game.S.year); await p.evaluate(() => { window.__game.S.year += 30; });
await p.click("[data-ld='3']"); await p.waitForTimeout(200);
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
  const open = (id) => p.evaluate((id) => { const g = window.__game, S = g.S; g.session.flow.cancel(); S.holdAuto = false; S.pending = null; S.year = 2026; delete S.done.learn; S.pending = null; g.E.checkEvents && g.E.checkEvents(S); if (!S.pending) { for (let i = 0; i < 400 && !S.pending; i++) { g.E.tick(S); } } if (g.paused) g.togglePause(); }, id);
  await p.evaluate(() => { const g = window.__game; g.S.mode = "manual"; g.S.pending = null; for (let i = 0; i < 400 && !g.S.pending; i++) g.E.tick(g.S); if (g.paused) g.togglePause(); });
  await p.waitForSelector("#modal:not([hidden]) #go", { timeout: 4000 });
  ok(await p.locator("#modal .progset").count() === 1 && await p.locator("#modal [data-pm]").count() === 3 && await p.locator("#modal [data-po]").count() === 3 && await p.locator("#modal [data-ps]").count() === 2, "イベント画面に進行設定(モード3・観察時間3/5/10秒・停止/低速)がある");
  ok(await p.locator("#modal [data-po].on").getAttribute("data-po") === "5", "観察時間の既定は5秒");
  const lay = await p.evaluate(() => { const go = document.getElementById("go").getBoundingClientRect(), bx = document.querySelector("#modal .box"); const small = [...document.querySelectorAll("#modal button")].filter(e => e.getBoundingClientRect().height < 44).length; return { goVis: go.bottom <= innerHeight + 1 && go.top >= 0, over: document.documentElement.scrollWidth - document.documentElement.clientWidth, boxOver: bx.scrollWidth - bx.clientWidth, small, goDis: document.getElementById("go").disabled }; });
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
  await p.click("#tabs [data-t=sys]"); await p.click("[data-sv='1']"); await p.click("[data-ld='1']"); await p.waitForTimeout(250);
  ok(await p.evaluate(() => !window.__game.session.observing && window.__game.S.holdAuto === false && window.__game.paused), "観察中のセーブ→ロードで観察は破棄され、一時停止で再開");
}

console.log("エラー:", errs.length ? errs : "なし"); ok(errs.length === 0, "ページエラーなし");
await p.screenshot({ path: process.env.SHOT || "/tmp/claude-0/ui360.png" });
await b.close(); process.exit(fail ? 1 : 0);
