// 開始演出: 数字・点・粒子が集まって3つの砂時計(人類・AI個体・大型哺乳類)を組み上げ、砂が落ち始める。表示専用。
const NAMES = ["人類", "AI個体", "大型哺乳類"];
export const BUILD_MS = 6800;
export function glassTargets(cx, cy, w, h, n = 64) { // 砂時計の輪郭(上下の板と2つの三角)上の点
  const pts = [], hw = w / 2, hh = h / 2, neck = w * .06, side = (ax, ay, bx, by, k) => { for (let i = 0; i < k; i++) { const t = i / Math.max(1, k - 1); pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]); } };
  side(cx - hw, cy - hh, cx + hw, cy - hh, 12); side(cx - hw, cy + hh, cx + hw, cy + hh, 12);
  side(cx - hw * .85, cy - hh, cx - neck, cy, 10); side(cx + hw * .85, cy - hh, cx + neck, cy, 10); side(cx - neck, cy, cx - hw * .85, cy + hh, 10); side(cx + neck, cy, cx + hw * .85, cy + hh, 10);
  return pts.slice(0, n);
}
export class Build {
  constructor(cv, rgb, onDone) { this.cv = cv; this.rgb = rgb; this.onDone = onDone; this.t = 0; this.done = false; this.raf = 0; this.last = 0; this.resize(); this.init(); }
  resize() { const d = Math.min(2, window.devicePixelRatio || 1); this.W = this.cv.clientWidth || innerWidth; this.H = this.cv.clientHeight || innerHeight; this.cv.width = Math.round(this.W * d); this.cv.height = Math.round(this.H * d); this.d = d; this.ctx = this.cv.getContext("2d"); }
  init() {
    const W = this.W, H = this.H, gw = Math.min(96, W / 3.6), gh = gw * 1.7, gap = (W - gw * 3) / 4, cy = H * .42;
    this.glass = [0, 1, 2].map(i => { const cx = gap + gw / 2 + i * (gw + gap), tg = glassTargets(cx, cy, gw, gh); return { cx, cy, gw, gh, tg, p: tg.map(([x, y]) => ({ x, y, sx: Math.random() * W, sy: Math.random() * H, dg: Math.floor(Math.random() * 10) })), sand: Array.from({ length: 36 }, (_, k) => ({ k, ph: Math.random() })) }; });
  }
  start() { this.last = performance.now(); const loop = (now) => { if (this.done) return; this.raf = requestAnimationFrame(loop); const dt = Math.min(.05, (now - this.last) / 1000); this.last = now; this.t += dt; this.draw(); if (this.t * 1000 >= BUILD_MS) this.finish(); }; this.raf = requestAnimationFrame(loop); }
  skip() { this.finish(); }
  finish() { if (this.done) return; this.done = true; cancelAnimationFrame(this.raf); const f = this.onDone; this.onDone = null; if (f) f(); }
  draw() {
    const c = this.ctx, W = this.W, H = this.H, rgb = this.rgb, t = this.t; c.setTransform(this.d, 0, 0, this.d, 0, 0); c.fillStyle = "#000"; c.fillRect(0, 0, W, H); c.textAlign = "center";
    const ease = (x) => { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); };
    this.glass.forEach((g, i) => {
      const t0 = .5 + i * 1.5, k = ease((t - t0) / 1.3), shown = t > t0 - .3; if (!shown) return;
      c.fillStyle = `rgba(${rgb},${.35 + .6 * k})`; c.font = "10px monospace";
      g.p.forEach(p => { const x = p.sx + (p.x - p.sx) * k, y = p.sy + (p.y - p.sy) * k; if (k < .98) c.fillText(String(p.dg), x, y); else c.fillRect(x - 1, y - 1, 2, 2); });
      if (k >= .98) { // 砂が落ち始める
        const ts = t - (t0 + 1.3), neck = g.gw * .06; c.fillStyle = `rgba(${rgb},.85)`;
        g.sand.forEach(s => { const ph = ((ts * .9 + s.ph) % 1 + 1) % 1; const y = g.cy - g.gh / 2 + ph * g.gh * 1.0, half = y < g.cy ? (g.gw * .85 / 2 * (1 - (y - (g.cy - g.gh / 2)) / (g.gh / 2)) + neck) * .8 : ((y - g.cy) / (g.gh / 2) * g.gw * .85 / 2 + neck) * .8; c.fillRect(g.cx + Math.sin(s.k * 2.3) * half * .9, y, 2, 2); });
      }
      c.fillStyle = `rgba(${rgb},${k})`; c.font = "13px monospace"; c.fillText(NAMES[i], g.cx, g.cy + g.gh / 2 + 24);
    });
    const a = ease((t - 4.9) / .8); if (a > 0) { c.fillStyle = `rgba(255,255,255,${a})`; c.font = "bold 18px monospace"; c.fillText("終活プログラム開始", W / 2, H * .72); c.font = "13px monospace"; c.fillText("2100年", W / 2, H * .72 + 24); }
  }
}
