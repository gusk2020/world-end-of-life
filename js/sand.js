// 砂時計の表示専用モジュール。ゲーム内の数値(人口・AI数・哺乳類数)の正本は持たない。
//  - SandModel: 粒の数・落下・積もりだけを扱う純粋なモデル(DOM非依存。node でもテストできる)
//  - SandGlass: Canvas に描く(輪郭・くびれ・上下の粒・落下する粒)
//  - 描画ループは requestAnimationFrame で、ゲームの進行(engine.js)とは完全に分離している。
// 粒は視覚表現。数十億個体を描かず、描く粒数には上限がある。縮尺を変えても実際の数値は変わらない。
import { drawGlassFrame } from "./glassfx.js";
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

// ---------- 縮尺 ----------
export function niceUp(x) { if (!(x > 1)) return 1; const e = Math.pow(10, Math.floor(Math.log10(x))); for (const m of [1, 2, 5]) if (m * e >= x * (1 - 1e-9)) return m * e; return 10 * e; }
export const FIXED = { h: [1e7, 5e7, 2.5e8], a: [5, 25, 125], m: [1e7, 5e7, 2.5e8] }; // 固定縮尺(細かい/標準/粗い): 1粒あたりの個体数
export const MAX_GRAINS = 1000; // 1つの山(上/下)に描く粒数の上限
export const FIXED_NAMES = ["細かい", "標準", "粗い"];
export function fmtScale(k) { if (k >= 1e8) return +(k / 1e8).toPrecision(3) + "億"; if (k >= 1e4) return +(k / 1e4).toPrecision(3) + "万"; return String(k); }
export function fmtShort(n) { n = Math.round(n); if (n >= 1e8) return (n / 1e8).toFixed(n >= 1e9 ? 1 : 2) + "億"; if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 0 : 1) + "万"; return n.toLocaleString("en-US"); }
// 1粒あたりの個体数を決める。auto は「減るにつれて細かくなる(粗くはならない)」ので、下に積もった粒が減って見えることはない。
export function chooseScale(kind, mode, fixedIdx, alive, topSlots, prevK) {
  if (mode === "fixed") return FIXED[kind][clamp(fixedIdx | 0, 0, 2)];
  const k = Math.max(1, niceUp(alive / Math.max(1, topSlots * .7)));
  return prevK ? Math.min(prevK, k) : k;
}
// 個体数→粒数(生存者がいる間は最低1粒。上限は表示粒数の上限)
export function grainsFor(alive, dead, K) { return { top: alive > 0 ? Math.max(1, Math.round(alive / K)) : 0, bot: Math.max(0, Math.round(dead / K)) }; }

// ---------- 形とスロット(粒が収まる位置) ----------
function halfWidth(t, hw, nh) { return nh + (hw - nh) * Math.pow(1 - clamp(t, 0, 1), .75); } // くびれから上下に広がるガラスの半幅
export function glassShape(W, H) {
  const m = Math.max(2, Math.min(W, H) * .04), yTop = m + 1, yNeck = H / 2, yBot = H - m - 1, hw = W / 2 - m, nh = Math.max(1.4, W * .035);
  return { W, H, m, yTop, yNeck, yBot, hw, nh, cx: W / 2, halfTop: (y) => halfWidth((y - yTop) / (yNeck - yTop), hw, nh), halfBot: (y) => halfWidth((yBot - y) / (yBot - yNeck), hw, nh) };
}
export function buildSlots(W, H, s) {
  const g = glassShape(W, H), row = s * .87, top = [], bot = [];
  const rowSlots = (y, half, out, k) => {
    const usable = half - s * .55; if (usable < s * .3) return;
    const xs = []; const off = (k % 2) * s / 2;
    for (let x = off; x <= usable; x += s) { xs.push(x); if (x > 0) xs.push(-x); }
    if (off === 0) { /* 0 を含む */ } xs.sort((a, b) => Math.abs(a) - Math.abs(b));
    for (const x of xs) out.push(g.cx + x, y);
  };
  let k = 0; for (let y = g.yNeck - s * .9; y > g.yTop + s * .6; y -= row, k++) rowSlots(y, g.halfTop(y), top, k);      // 上の部屋: くびれに近いところから積む
  k = 0; for (let y = g.yBot - s * .7; y > g.yNeck + s * .9; y -= row, k++) rowSlots(y, g.halfBot(y), bot, k); // 下の部屋: 底から積む
  return { g, top: Float32Array.from(top), bot: Float32Array.from(bot), nTop: top.length / 2, nBot: bot.length / 2 };
}

// ---------- モデル: 粒の数と、落ちる・加わる粒の動き(正本ではない) ----------
const POOL = 96;
export class SandModel {
  constructor(W, H, spacing, maxInflight = 40) {
    this.maxInflight = Math.min(POOL, maxInflight);
    this.fl = []; for (let i = 0; i < POOL; i++) this.fl.push({ on: false, type: 0, u: 0, dur: 1, x0: 0, y0: 0, dest: 0 });
    this.stats = { drops: 0, adds: 0, landedDrops: 0, landedAdds: 0, bulk: 0, snaps: 0 };
    this.setGeometry(W, H, spacing);
  }
  setGeometry(W, H, spacing) {
    const sl = buildSlots(W, H, spacing); this.slots = sl; this.g = sl.g; this.spacing = spacing;
    this.capTop = Math.min(sl.nTop, MAX_GRAINS); this.capBot = Math.min(sl.nBot, MAX_GRAINS);
    this.Nt = Math.min(this.Nt || 0, this.capTop); this.Nb = Math.min(this.Nb || 0, this.capBot); this.tt = this.Nt; this.tb = this.Nb;
    this.clear();
  }
  clear() { for (const f of this.fl) f.on = false; this.nDrop = 0; this.nAdd = 0; this.budget = 0; this.qd = 0; this.qa = 0; }
  // 状態(目標の粒数): 生存者÷縮尺、累計÷縮尺。表示の「正解」で、動きの途中ではこれに向かって収束する
  setTargets(top, bot) { this.topHit = top > this.capTop; this.botHit = bot > this.capBot; this.tt = Math.min(top, this.capTop); this.tb = Math.min(bot, this.capBot); }
  // 出来事(粒に換算した死亡・停止、出生・新造)。端数は持ち越す。死亡=上から下へ落とす、出生=上へ加える
  addFlow(dropGrains, addGrains) { if (dropGrains > 0) this.qd += dropGrains; if (addGrains > 0) this.qa += addGrains; }
  snap() { this.clear(); this.Nt = this.tt; this.Nb = this.tb; this.stats.snaps++; }
  inflight() { return this.nDrop + this.nAdd; }
  queued() { return Math.floor(this.qd) + Math.floor(this.qa); }
  gap() { return Math.abs(this.tb - this.Nb) + Math.abs(this.tt - this.Nt) + this.queued() + this.inflight(); } // 表示が目標に追いついていない量(0なら最新)
  spawn(type, dest, dur, x0, y0) {
    for (const f of this.fl) if (!f.on) { f.on = true; f.type = type; f.u = 0; f.dur = dur; f.dest = dest; f.x0 = x0; f.y0 = y0; return f; }
    return null;
  }
  // dt: 表示の経過秒(ゲーム時間とは無関係)。戻り値: まだ動かす必要があるか
  step(dt) {
    dt = Math.min(dt, .25);
    let nd = Math.floor(this.qd), na = Math.floor(this.qa), backlog = nd + na;
    if (backlog > 600) { this.snap(); this.stats.bulk++; return false; }              // 表示が追いつかないときは、まとめて更新
    if (backlog > 160) { const cut = backlog - 160, cd = Math.min(nd, cut), ca = Math.min(na, cut - cd); this.qd -= cd; this.qa -= ca; this.Nt = Math.max(0, Math.min(this.capTop, this.Nt - cd + ca)); this.Nb = Math.min(this.capBot, this.Nb + cd); this.stats.bulk++; nd -= cd; na -= ca; backlog = nd + na; }
    // 落ちる粒の速さ・出す間隔は表示側で決める。少ないときはゆっくり自然に、多いときは目で追える範囲で速く
    const rate = clamp(5 + backlog * 1.6, 5, 220), dur = clamp(1.15 - backlog / 160, .28, 1.15), g = this.g, sl = this.slots;
    this.budget = Math.min(this.budget + rate * dt, 6);
    let turn = 0;
    while (this.budget >= 1 && this.inflight() < this.maxInflight && (nd > 0 || na > 0)) {
      this.budget -= 1;
      if (nd > 0 && (na <= 0 || turn++ % 2 === 0)) {
        if (this.Nt > 0) { const i = this.Nt - 1; const f = this.spawn(0, Math.min(this.Nb + this.nDrop, this.capBot - 1), dur, sl.top[2 * i], sl.top[2 * i + 1]); if (!f) break; this.Nt--; this.nDrop++; this.stats.drops++; }
        else { this.Nb = Math.min(this.capBot, this.Nb + 1); this.stats.snaps++; }
        this.qd -= 1; nd--;
      } else {
        const f = this.spawn(1, Math.min(this.Nt + this.nAdd, this.capTop - 1), dur * .8, g.cx, g.yTop - 3); if (!f) break; this.nAdd++; this.stats.adds++; this.qa -= 1; na--;
      }
    }
    for (const f of this.fl) {
      if (!f.on) continue; f.u += dt / f.dur;
      if (f.u >= 1) { f.on = false; if (f.type === 0) { this.nDrop--; this.Nb = Math.min(this.capBot, this.Nb + 1); this.stats.landedDrops++; } else { this.nAdd--; this.Nt = Math.min(this.capTop, this.Nt + 1); this.stats.landedAdds++; } }
    }
    const busy = this.inflight() > 0 || Math.floor(this.qd) + Math.floor(this.qa) > 0;
    if (!busy && (this.Nt !== this.tt || this.Nb !== this.tb)) { this.Nt = this.tt; this.Nb = this.tb; return true; } // 端数のずれは静かに合わせる(表示は常に最新の数値へ収束)
    return busy;
  }
  // 落下中の粒の位置
  posOf(f, out) {
    const g = this.g, sl = this.slots;
    if (f.type === 0) {
      const d = Math.min(f.dest, this.capBot - 1), bx = sl.bot[2 * d], by = sl.bot[2 * d + 1];
      if (f.u < .4) { const t = f.u / .4, e = t * t; out.x = f.x0 + (g.cx - f.x0) * e; out.y = f.y0 + (g.yNeck - f.y0) * e; }
      else { const t = (f.u - .4) / .6, e = t * t; out.x = g.cx + (bx - g.cx) * e; out.y = g.yNeck + (by - g.yNeck) * e; }
    } else {
      const d = Math.min(f.dest, this.capTop - 1), tx = sl.top[2 * d], ty = sl.top[2 * d + 1], t = f.u, e = 1 - (1 - t) * (1 - t);
      out.x = g.cx + (tx - g.cx) * e; out.y = g.yTop - 3 + (ty - g.yTop + 3) * e;
    }
    return out;
  }
}

// ---------- Canvas 描画 ----------
const QUALITY = [{ mul: 1, dpr: 2, fps: 60, inflight: 40 }, { mul: 1.4, dpr: 1.5, fps: 40, inflight: 28 }, { mul: 2, dpr: 1, fps: 24, inflight: 16 }];
export const loop = { views: new Set(), raf: 0, last: 0, level: 0, ema: 0, frames: 0, drawn: 0, debugDelay: 0, hidden: false };
export class SandGlass {
  constructor(canvas, { compact = false, rgb = "77,166,255" } = {}) {
    this.cv = canvas; this.ctx = canvas.getContext("2d"); this.compact = compact; this.rgb = rgb; this.dirty = true; this.accum = 0; this.model = null; this.tmp = { x: 0, y: 0 };
    this.W = 0; this.H = 0; loop.views.add(this);
  }
  spacingFor(level) { return (this.compact ? 2.3 : 5.2) * QUALITY[level].mul; }
  setSize(W, H) {
    const q = QUALITY[loop.level], dpr = Math.min(typeof devicePixelRatio === "number" ? devicePixelRatio : 1, q.dpr);
    this.W = W; this.H = H; this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr); this.dpr = dpr;
    if (this.model) this.model.setGeometry(W, H, this.spacingFor(loop.level)); else this.model = new SandModel(W, H, this.spacingFor(loop.level), this.compact ? 8 : QUALITY[loop.level].inflight);
    this.model.maxInflight = Math.min(POOL, this.compact ? 8 : QUALITY[loop.level].inflight); this.dirty = true;
  }
  relevel() { if (this.W) this.setSize(this.W, this.H); }
  setColor(rgb) { this.rgb = rgb; this.dirty = true; }
  setTargets(top, bot) { this.model.setTargets(top, bot); kick(); }
  addFlow(d, a) { this.model.addFlow(d, a); kick(); }
  snap() { this.model.snap(); this.dirty = true; kick(); }
  dispose() { loop.views.delete(this); this.model = null; this.cv = null; this.ctx = null; }
  draw() {
    const m = this.model, ctx = this.ctx; if (!m || !ctx) return;
    const g = m.g, sl = m.slots, c = this.rgb, s = m.spacing, gs = Math.max(1, s * (this.compact ? .72 : .8)), d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, this.W, this.H);
    drawGlassFrame(ctx, g, c, this.compact); // 輪郭は開始演出と同じ、点と数字(js/glassfx.js)
    // 上の粒: 塗りつぶし(いま生きている/稼働している)
    ctx.beginPath(); for (let i = 0; i < m.Nt; i++) ctx.rect(sl.top[2 * i] - gs / 2, sl.top[2 * i + 1] - gs / 2, gs, gs); ctx.fillStyle = `rgba(${c},1)`; ctx.fill();
    // 下の粒: 中空・薄い(これまでに死亡/停止した累計)
    if (this.compact) { ctx.beginPath(); for (let i = 0; i < m.Nb; i++) ctx.rect(sl.bot[2 * i] - gs / 2, sl.bot[2 * i + 1] - gs / 2, gs, gs); ctx.fillStyle = `rgba(${c},.42)`; ctx.fill(); }
    else { ctx.beginPath(); const h = gs * .42; for (let i = 0; i < m.Nb; i++) ctx.rect(sl.bot[2 * i] - h, sl.bot[2 * i + 1] - h, h * 2, h * 2); ctx.strokeStyle = `rgba(${c},.8)`; ctx.lineWidth = 1; ctx.stroke(); }
    // 動いている粒(落ちる粒・加わる粒)は明るく大きく
    ctx.fillStyle = `rgb(${c})`; const t = this.tmp, big = gs * 1.25;
    ctx.beginPath(); for (const f of m.fl) { if (!f.on) continue; m.posOf(f, t); ctx.rect(t.x - big / 2, t.y - big / 2, big, big); } ctx.fill();
    this.dirty = false;
  }
}

// ---------- 描画ループ(ゲームの進行とは独立。必要なときだけ回る) ----------
export function kick() { if (loop.raf || loop.hidden || typeof requestAnimationFrame !== "function") return; loop.last = 0; loop.raf = requestAnimationFrame(tickLoop); }
function tickLoop(now) {
  loop.raf = 0; if (loop.hidden) return;
  const dt = loop.last ? Math.min(.25, (now - loop.last) / 1000) : .016; loop.last = now;
  const t0 = typeof performance !== "undefined" ? performance.now() : 0; let more = false;
  loop.accum = (loop.accum || 0) + dt; const q = QUALITY[loop.level], minDt = 1 / q.fps;
  if (loop.accum >= minDt * .9) {
    const step = loop.accum; loop.accum = 0;
    for (const v of loop.views) {
      if (!v.model) continue;
      const act = v.model.step(step); if (act || v.dirty) { if (v.compact && !act && !v.dirty) continue; v.draw(); loop.drawn++; }
      more = more || act;
    }
    if (loop.debugDelay) { const e = performance.now() + loop.debugDelay; while (performance.now() < e); } // テスト用: 遅い端末の模擬
    loop.frames++;
    const cost = (typeof performance !== "undefined" ? performance.now() : 0) - t0; loop.ema = loop.ema ? loop.ema * .9 + cost * .1 : cost;
    if (loop.frames % 45 === 0) adapt();
  } else more = true;
  if (more || [...loop.views].some(v => v.dirty)) loop.raf = requestAnimationFrame(tickLoop);
}
function adapt() { // 端末性能に応じて描画負荷を調整(粒を大きく=少なく、解像度と描画頻度を下げる)。ゲームの数値には影響しない
  if (loop.ema > 14 && loop.level < 2) { loop.level++; relevelAll(); }
  else if (loop.ema < 3 && loop.level > 0 && loop.frames % 450 === 0) { loop.level--; relevelAll(); }
}
function relevelAll() { for (const v of loop.views) v.relevel(); }
export function setQuality(l) { loop.level = clamp(l | 0, 0, 2); relevelAll(); }
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { // 背景では描画を止め、戻ったら最新に合わせる
  loop.hidden = document.hidden;
  if (loop.hidden) { if (loop.raf) { cancelAnimationFrame(loop.raf); loop.raf = 0; } }
  else { for (const v of loop.views) if (v.model) { v.model.snap(); v.dirty = true; } kick(); }
});
