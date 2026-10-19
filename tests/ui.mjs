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

console.log("■ 360px 表示・チュートリアル");
ok(await p.locator("#modal:not([hidden]) #tnext").count() === 1, "初回はチュートリアルが出る");
for (let i = 0; i < 5; i++) { await p.click("#tnext"); await p.waitForTimeout(50); }
ok(await p.locator("#modal:not([hidden])").count() === 0, "チュートリアルを最後まで進められる");
const over = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
for (const t of ["map", "status", "policy", "sites", "log", "sys"]) { await p.click(`#tabs [data-t=${t}]`); await p.waitForTimeout(150); ok(await over() <= 0, `${t}タブで横スクロールなし`); }
const hdh = await p.evaluate(() => document.getElementById("hd").getBoundingClientRect().height);
ok(hdh < 190, `ヘッダ高さ ${Math.round(hdh)}px (360x740の26%未満)`);
const small = await p.evaluate(() => [...document.querySelectorAll("#speed button,#tabs button,#themes button")].filter(e => { const r = e.getBoundingClientRect(); return r.height < 30 || r.width < 30; }).length);
ok(small === 0, "主要ボタンはすべて30px以上(タップしやすい)");

console.log("\n■ テーマ切替(青・緑・橙)と独立保存");
const col = () => p.evaluate(() => [getComputedStyle(document.documentElement).getPropertyValue("--rgb").trim(), getComputedStyle(document.getElementById("date")).color, document.getElementById("svg").querySelector("path").style.fill, getComputedStyle(document.querySelector("#gh .sand")||document.getElementById("gh")).fill]);
const seen = {};
for (const [th, rgb] of [["green", "51,255,119"], ["orange", "255,160,48"], ["blue", "77,166,255"]]) {
  await p.click(`#themes [data-th=${th}]`); await p.waitForTimeout(100);
  let [v, text, fill, sand] = await col(); text = text.replace(/ /g, ""); fill = fill.replace(/ /g, ""); seen[th] = [text, fill];
  ok(v === rgb, `${th}: テーマ色 ${v}`);
  ok(text === `rgb(${rgb})`, `${th}: 文字色がテーマ色`);
  ok(fill.includes(rgb), `${th}: 地図の塗りがテーマ色`);
}
ok(new Set(Object.values(seen).map(x => x[0])).size === 3, "3色が互いに異なる");
await p.click("#themes [data-th=orange]");
const st = await p.evaluate(() => JSON.parse(localStorage.getItem("weol.settings")));
ok(st.theme === "orange", "設定が localStorage に保存される");
await p.click("#tabs [data-t=sys]"); await p.click("[data-sv='1']");
const sv = await p.evaluate(() => localStorage.getItem("weol.save.1"));
ok(sv && !sv.includes("orange") && JSON.parse(sv).countries, "セーブデータにテーマは含まれない(独立)");
await p.reload(); await p.waitForTimeout(400);
ok(await p.evaluate(() => document.documentElement.dataset.theme) === "orange", "再読込後もテーマが維持される(チュートリアルは再表示されない)");
ok(await p.locator("#modal:not([hidden])").count() === 0, "チュートリアルは2回目以降は出ない");

console.log("\n■ 砂時計の整合性(画面の数字=ゲーム内数値)");
await p.evaluate(() => { const g = window.__game; g.S.year = 2090; });
const chk = () => p.evaluate(() => { const g = window.__game, S = g.S, n = g.hourglassNumbers(S), t = (id) => +document.getElementById(id).textContent.replace(/,/g, "");
  return { ok1: t("h_alive") === n.hAlive && t("h_dead") === n.hDead && t("a_alive") === n.aAlive && t("a_dead") === n.aDead, sum: n.hAlive + n.hDead === n.hEver, ai: n.aAlive + n.aDead === n.aEver, tot: Math.abs(S.g.P0 + S.g.hBorn - S.g.hDead - g.E.total(S)) < 1e-3 * S.g.P0 }; });
await p.evaluate(() => window.__game.setSpeed(4)); 
for (let i = 0; i < 6; i++) { await p.waitForTimeout(500); if (await p.locator("#modal:not([hidden]) .opt").count()) await p.locator("#modal .opt").first().click(); const c = await chk(); if (!(c.ok1 && c.sum && c.ai && c.tot)) { ok(false, "整合性 " + JSON.stringify(c)); break; } if (i === 5) ok(true, "6回の抜き取りで画面数字=内部数値、生+死=累計、AI稼働+停止=新造累計"); }

console.log("\n■ 判断の見込み・方針の差分・遺産・状況");
for (let i = 0; i < 80 && !(await p.locator("#modal:not([hidden]) .opt").count()); i++) await p.waitForTimeout(250);
if (await p.locator("#modal:not([hidden]) .opt").count()) {
  await p.waitForTimeout(1500);
  const pvt = await p.locator("#modal .opt .pv").first().textContent();
  ok(/即時/.test(pvt) && /15年後/.test(pvt) && !/計算中/.test(pvt), "選択肢に即時/15年後の見込みが数値で出る: " + pvt.slice(0, 40));
  await p.locator("#modal .opt").first().click();
}
await p.evaluate(() => window.__game.setSpeed(0));
await p.click("#tabs [data-t=status]"); await p.waitForTimeout(400);
ok((await p.textContent("#status")).includes("ボトルネック"), "状況タブにボトルネックと原因");
ok(await p.locator("#status svg.radar").count() === 1, "7指標のレーダーが出る");
await p.click("#tabs [data-t=policy]"); await p.fill("input[data-k=decom]", "80").catch(() => {}); 
await p.evaluate(() => { const r = document.querySelector("input[data-k=decom]"); r.value = 80; r.dispatchEvent(new Event("input")); r.dispatchEvent(new Event("change")); });
await p.waitForTimeout(1500);
ok(/年後/.test(await p.textContent("#pvbox")), "方針の変更で10年後/40年後の差分表が出る");
await p.click("#apply"); await p.waitForTimeout(100);
await p.click("#tabs [data-t=sites]"); ok(await p.locator(".site").count() >= 30, "遺産が30件以上並ぶ");
await p.locator(".site .seg button").first().click();
ok(await p.locator(".site .seg button.on").count() >= 1, "遺産の扱いを選べる");

console.log("\n■ セーブ・ロード");
await p.click("#tabs [data-t=sys]"); await p.click("[data-sv='2']");
const y0 = await p.evaluate(() => window.__game.S.year);
await p.evaluate(() => { window.__game.S.year += 30; });
await p.click("[data-ld='2']"); await p.waitForTimeout(200);
ok(await p.evaluate(() => window.__game.S.year) === y0, "ロードで年が戻る");
console.log("エラー:", errs.length ? errs : "なし");
ok(errs.length === 0, "ページエラーなし");
await p.screenshot({ path: process.env.SHOT || "/tmp/claude-0/ui360.png" });
await b.close(); process.exit(fail ? 1 : 0);
