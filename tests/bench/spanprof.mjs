// 同じ区間(2102→2302年)を進めるのに掛かる実時間を測る。区間の世界の状態が同じ年数なので、版の比較が公平。
// node tests/bench/span.mjs <URL> <速度ボタン> <CPU減速率> [ラベル]
import { createRequire } from "module";
const req = createRequire(import.meta.url), { chromium } = req(process.env.PW);
const [url, idx, rate, label] = [process.argv[2], +process.argv[3], +process.argv[4] || 1, process.argv[5] || ""];
const b = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true }), p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("weol.settings", JSON.stringify({ introSeen: true, tutorialDone: true, observe: { sec: 5, style: "stop" } })));
await p.goto(url); await p.waitForTimeout(700);
const cdp = await ctx.newCDPSession(p); if (rate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate });
await p.evaluate(() => { const g = window.__game; if (g.skipPrelude) g.skipPrelude("blue"); });
await p.evaluate(([idx]) => { const g = window.__game, S = g.S; document.getElementById("modal").hidden = true; g.settings.observe.sec = 0; S.pending = null; S.noEvents = true; S.mode = "auto"; S.year = 2102; g.setSpeed(idx); if (g.paused) g.togglePause(); }, [idx]);
await cdp.send("Profiler.enable"); await cdp.send("Profiler.start");
const r = await p.evaluate(async () => { const g = window.__game, S = g.S, t0 = performance.now(); const gaps = []; let last = t0; await new Promise(res => { const f = (now) => { gaps.push(now - last); last = now; if (S.year >= 2302 || S.ended || now - t0 > 40000) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }); gaps.sort((a, b) => a - b); return { sec: +((performance.now() - t0) / 1000).toFixed(2), year: S.year, frameGapP95ms: Math.round(gaps[Math.floor(gaps.length * .95)] || 0) }; });
const pr = (await cdp.send("Profiler.stop")).profile; const self = {}, ix = {}; pr.nodes.forEach(n => ix[n.id] = n); pr.samples.forEach((id, i) => { const n = ix[id], k = n.callFrame.functionName + ":" + n.callFrame.url.split("/").pop() + ":" + n.callFrame.lineNumber; self[k] = (self[k] || 0) + pr.timeDeltas[i]; }); console.log(Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => (v / 1000).toFixed(0) + "ms " + k).join("\n"));
console.log(JSON.stringify({ label, cpuSlowdown: rate, speedButton: idx, span: "2102→2302", ...r })); await b.close();
