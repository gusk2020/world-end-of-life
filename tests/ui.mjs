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
const over = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
for (const t of ["map", "status", "policy", "sites", "log", "sys"]) { await p.click(`#tabs [data-t=${t}]`); await p.waitForTimeout(150); ok(await over() <= 0, `${t}タブで横スクロールなし`); }
await p.click("#tabs [data-t=map]");
const hdh = await p.evaluate(() => document.getElementById("hd").getBoundingClientRect().height);
ok(hdh < 175, `ヘッダ高さ ${Math.round(hdh)}px (360x740の${Math.round(hdh / 7.4)}%)`);
const mapH = await p.evaluate(() => document.getElementById("mapbox").getBoundingClientRect().height);
ok(mapH >= 150, `地図の高さ ${Math.round(mapH)}px を確保(砂時計が地図を圧迫しない)`);
const small = await p.evaluate(() => [...document.querySelectorAll("#speed button,#tabs button,#themes button,.gl")].filter(e => { const r = e.getBoundingClientRect(); return r.height < 30 || r.width < 30; }).length);
ok(small === 0, "主要ボタンはすべて30px以上");
await adv(2160);
const clip = () => p.evaluate(() => [...document.querySelectorAll(".gt")].filter(e => e.scrollWidth > e.clientWidth + 1).length);
ok(await clip() === 0, "3つの砂時計の数字(10桁超)が360px幅で切れない");

console.log("\n■ 砂時計の拡大(累計・増減・年次推移)と3種の整合性");
const nums = () => p.evaluate(() => { const g = window.__game, n = g.hourglassNumbers(g.S), t = (id) => +document.getElementById(id).textContent.replace(/,/g, ""), S = g.S, mt = g.E.mammalTotals(S);
  return { show: t("h_alive") === n.hAlive && t("h_dead") === n.hDead && t("a_alive") === n.aAlive && t("a_dead") === n.aDead && t("m_alive") === n.mAlive && t("m_dead") === n.mDead,
    sums: n.hAlive + n.hDead === n.hEver && n.aAlive + n.aDead === n.aEver && n.mAlive + n.mDead === n.mEver,
    inv: Math.abs(S.g.P0 + S.g.hBorn - S.g.hDead - g.E.total(S)) < 1e-3 * S.g.P0 && Math.abs(mt.ever - mt.dead - mt.alive) < 1e-6 * mt.ever }; });
const c0 = await nums(); ok(c0.show && c0.sums && c0.inv, "ヘッダの数字=内部数値、生+死=累計(3種)");
for (const [g, nm] of [["h", "人類"], ["a", "AI"], ["m", "哺乳類"]]) {
  await p.click(`.gl[data-g=${g}]`); await p.waitForTimeout(100);
  const t = await p.textContent("#mbox");
  ok(await p.locator("#modal:not([hidden]) .bigglass svg").count() === 1 && /今年の増加/.test(t) && /今年の減少/.test(t), `${nm}の砂時計をタップで拡大(累計・増減)`);
  ok(await p.locator("#modal svg.chart").count() === 1, `${nm}: 年次推移のグラフ`);
  const shown = await p.evaluate(() => [...document.querySelectorAll("#mbox .bigglass .kv span")].map(e => e.textContent));
  const exp = await p.evaluate((g) => { const n = window.__game.hourglassNumbers(window.__game.S); return { h: [n.hAlive, n.hDead, n.hEver], a: [n.aAlive, n.aDead, n.aEver], m: [n.mAlive, n.mDead, n.mEver] }[g].map(x => Math.round(x).toLocaleString("en-US")); }, g);
  ok(shown[1] === exp[0] && shown[3] === exp[1] && shown[5] === exp[2], `${nm}: 拡大画面の数値が内部値と一致`);
  const ov = await p.evaluate(() => { const bx = document.getElementById("mbox"); return bx.scrollWidth - bx.clientWidth; }); ok(ov <= 1, `${nm}: 拡大画面が360pxで横にはみ出さない`);
  await p.click("#gclose");
}
ok(await p.locator("#modal[hidden]").count() === 1, "拡大を閉じられる");

console.log("\n■ テーマ切替(青・緑・橙)と独立保存");
const col = () => p.evaluate(() => [getComputedStyle(document.documentElement).getPropertyValue("--rgb").trim(), getComputedStyle(document.getElementById("date")).color, document.getElementById("svg").querySelector("path").style.fill, getComputedStyle(document.querySelector("#gh .sand")).fill]);
const seen = {};
for (const [th, rgb] of [["green", "51,255,119"], ["orange", "255,160,48"], ["blue", "77,166,255"]]) {
  await p.click(`#themes [data-th=${th}]`); await p.waitForTimeout(100);
  let [v, text, fill, sand] = await col(); text = text.replace(/ /g, ""); fill = fill.replace(/ /g, ""); sand = sand.replace(/ /g, ""); seen[th] = text;
  ok(v === rgb && text === `rgb(${rgb})` && fill.includes(rgb) && sand === `rgb(${rgb})`, `${th}: 文字・地図・砂時計がテーマ色`);
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
await p.reload(); await p.waitForTimeout(400); ok((await st()).idx === 3, "再読込後も速度を維持");
ok(await p.locator("#spdlabel").textContent().then(t => /現実1秒/.test(t)), "何倍速かと現実時間の対応を表示");
// 重要イベント後も維持
await p.evaluate(() => { const g = window.__game; g.S.year = 2049; g.S.pending = null; }); 
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
await p.locator("#modal .opt").first().click(); await p.waitForTimeout(100);
ok((await st()).idx === 2, "イベント処理後も速度は維持");
await p.evaluate(() => { if (!window.__game.paused) window.__game.togglePause(); });

console.log("\n■ 進行モード(手動・半自動・完全自動)");
await adv(2100);
await p.evaluate(() => { const g = window.__game; g.S.pending = null; g.setSpeed(3); g.togglePause(); });
await p.click("#tabs [data-t=policy]"); await p.click("[data-mode=auto]");
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
console.log("エラー:", errs.length ? errs : "なし"); ok(errs.length === 0, "ページエラーなし");
await p.screenshot({ path: process.env.SHOT || "/tmp/claude-0/ui360.png" });
await b.close(); process.exit(fail ? 1 : 0);
