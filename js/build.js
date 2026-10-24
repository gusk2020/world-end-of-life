// 開始演出: 数字・点・粒子が集まって3つの砂時計(人類・AI個体・大型哺乳類)を組み上げ、砂が落ち始める。表示専用。
import { glassShape } from "./sand.js";
import { pointsFor, drawGlassFrame } from "./glassfx.js";
const NAMES = ["人類", "AI個体", "大型哺乳類"];
export const BUILD_MS = 6800;
// 砂時計の輪郭の点(小型・拡大表示と同じ形と点・数字)。中心(cx,cy)・幅w・高さhに置く
export function glassTargets(cx, cy, w, h) { const g = glassShape(w, h); return pointsFor(g, false).map(p => [p.x + cx - w / 2, p.y + cy - h / 2]); }
export class Build {
  constructor(cv, rgb, onDone) { this.cv = cv; this.rgb = rgb; this.onDone = onDone; this.t = 0; this.done = false; this.raf = 0; this.last = 0; this.resize(); this.init(); }
  resize() { const d = Math.min(2, window.devicePixelRatio || 1); this.W = this.cv.clientWidth || innerWidth; this.H = this.cv.clientHeight || innerHeight; this.cv.width = Math.round(this.W * d); this.cv.height = Math.round(this.H * d); this.d = d; this.ctx = this.cv.getContext("2d"); }
  init() {
    const W = this.W, H = this.H, gw = Math.min(104, W / 3.4), gh = gw * 1.75, gap = (W - gw * 3) / 4, cy = H * .42;
    this.glass = [0, 1, 2].map(i => { const cx = gap + gw / 2 + i * (gw + gap), shape = glassShape(gw, gh), pts = pointsFor(shape, false); return { cx, cy, gw, gh, shape, p: pts.map(q => ({ x: q.x + cx - gw / 2, y: q.y + cy - gh / 2, sx: Math.random() * W, sy: Math.random() * H, dg: q.d })), sand: Array.from({ length: 36 }, (_, k) => ({ k, ph: Math.random() })) }; });
  }
  start() { this.last = performance.now(); const loop = (now) => { if (this.done) return; this.raf = requestAnimationFrame(loop); const dt = Math.min(.05, (now - this.last) / 1000); this.last = now; this.t += dt; this.draw(); if (this.t * 1000 >= BUILD_MS) this.finish(); }; this.raf = requestAnimationFrame(loop); }
  skip() { this.finish(); }
  finish() { if (this.done) return; this.done = true; cancelAnimationFrame(this.raf); const f = this.onDone; this.onDone = null; if (f) f(); }
  draw() {
    const c = this.ctx, W = this.W, H = this.H, rgb = this.rgb, t = this.t; c.setTransform(this.d, 0, 0, this.d, 0, 0); c.fillStyle = "#000"; c.fillRect(0, 0, W, H); c.textAlign = "center";
    const ease = (x) => { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); };
    this.glass.forEach((g, i) => {
      const t0 = .5 + i * 1.5, k = ease((t - t0) / 1.3), shown = t > t0 - .3; if (!shown) return;
      if (k < .98) { c.fillStyle = `rgba(${rgb},${.35 + .6 * k})`; c.font = "10px monospace"; g.p.forEach(p => { const x = p.sx + (p.x - p.sx) * k, y = p.sy + (p.y - p.sy) * k; c.fillText(String(p.dg), x, y); }); }
      else { c.save(); c.translate(g.cx - g.gw / 2, g.cy - g.gh / 2); drawGlassFrame(c, g.shape, rgb, false); // 完成した輪郭は、本編の砂時計と同じ描画
        const ts = t - (t0 + 1.3), sh = g.shape; c.fillStyle = `rgba(${rgb},.85)`;
        g.sand.forEach(s => { const ph = ((ts * .9 + s.ph) % 1 + 1) % 1, y = sh.yTop + ph * (sh.yBot - sh.yTop), half = (y < sh.yNeck ? sh.halfTop(y) : sh.halfBot(y)) * .8; c.fillRect(sh.cx + Math.sin(s.k * 2.3) * half * .9, y, 2, 2); }); c.restore(); }
      c.fillStyle = `rgba(${rgb},${k})`; c.font = "13px monospace"; c.fillText(NAMES[i], g.cx, g.cy + g.gh / 2 + 24);
    });
    const a = ease((t - 4.9) / .8); if (a > 0) { c.fillStyle = `rgba(255,255,255,${a})`; c.font = "bold 18px monospace"; c.fillText("終活プログラム開始", W / 2, H * .72); c.font = "13px monospace"; c.fillText("2100年", W / 2, H * .72 + 24); }
  }
}
