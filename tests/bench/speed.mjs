// 進行速度の実測(ヘッドレスChromium・CPUスロットリング)。node tests/bench/speed.mjs <URL> <速度ボタンのindex> <CPU減速率> <秒> [ラベル]
// ゲーム内年数/秒・フレーム間隔・JSヒープを測る。同じ初期状態(2102年・イベントなし・自動)から計測する。
import { createRequire } from "module";
const req = createRequire(import.meta.url), { chromium } = req(process.env.PW || "playwright-core");
const [url, idx, rate, secs, label] = [process.argv[2], +process.argv[3], +process.argv[4] || 1, +process.argv[5] || 6, process.argv[6] || ""];
const b = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox", "--enable-precise-memory-info"] });
const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true }), p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("weol.settings", JSON.stringify({ introSeen: true, tutorialDone: true, observe: { sec: 5, style: "stop" } })));
await p.goto(url); await p.waitForTimeout(700);
const cdp = await ctx.newCDPSession(p); if (rate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate });
await p.evaluate(() => { const g = window.__game; if (g.skipPrelude) g.skipPrelude("blue"); else { document.getElementById("modal").hidden = true; } });
await p.evaluate(([idx]) => { const g = window.__game, S = g.S; document.getElementById("modal").hidden = true; g.settings.observe.sec = 0; S.pending = null; S.noEvents = true; S.mode = "auto"; S.year = 2102; g.setSpeed(idx); if (g.paused) g.togglePause(); }, [idx]);
const r = await p.evaluate(async (secs) => { const g = window.__game, S = g.S, y0 = S.year; const gaps = []; let last = performance.now(), frames = 0; const t0 = last, m0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  await new Promise(res => { const f = (now) => { gaps.push(now - last); last = now; frames++; if (now - t0 < secs * 1000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  const el = (performance.now() - t0) / 1000; gaps.sort((a, b) => a - b); return { yearsPerSec: +((g.S.year - y0) / el).toFixed(1), fps: +(frames / el).toFixed(1), frameGapP95ms: +gaps[Math.floor(gaps.length * .95)].toFixed(0), frameGapMaxMs: +gaps[gaps.length - 1].toFixed(0), heapMB: performance.memory ? +((performance.memory.usedJSHeapSize - m0) / 1048576).toFixed(1) : null, ended: !!g.S.ended }; }, secs);
console.log(JSON.stringify({ label, url, speedButton: idx, cpuSlowdown: rate, seconds: secs, ...r }));
await b.close();
