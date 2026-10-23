// 青・橙・緑のデジタル球体(導入・助走期間・エンディングで共用)。表示専用でゲーム状態には触れない。
// 点・線・数字で作った球体が、揺らぎながら画面端と窓の境界で反射し、弱く引き合う。
export const ORB_COLORS = [["blue", "77,166,255", "青"], ["orange", "255,160,48", "橙"], ["green", "51,255,119", "緑"]];
const NPT = 110, DIG = "0123456789";
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

// 球体の運動(描画から独立。テストできる純粋な更新関数)
export function makeOrbs(W, H, n = 3, rnd = Math.random) {
  const r = clamp(Math.min(W, H) * .11, 26, 54);
  return Array.from({ length: n }, (_, i) => ({ x: r + rnd() * Math.max(1, W - 2 * r), y: r + rnd() * Math.max(1, H - 2 * r), vx: (rnd() - .5) * 60, vy: (rnd() - .5) * 60, r, ph: rnd() * 6.28 + i }));
}
export function stepOrbs(orbs, dt, W, H, obstacle, t = 0) {
  dt = Math.min(dt, .05);
  const R = clamp(Math.min(W, H) * .11, 26, 54), vmin = 18, vmax = 62;
  orbs.forEach((o, i) => {
    o.r = R;
    // 滑らかな揺らぎ(ランダム風の加速度)と、他の球体への弱い引力。近すぎる間は引力を弱める(密集防止)
    let ax = Math.sin(t * .7 + o.ph * 3.1) * 14 + Math.sin(t * 1.9 + o.ph) * 6, ay = Math.cos(t * .6 + o.ph * 2.3) * 14 + Math.cos(t * 1.7 + o.ph * 1.3) * 6;
    orbs.forEach((p, j) => { if (i === j) return; const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy) || 1, k = 260 / (d + 140) * clamp(d / (2.2 * R), 0, 1); ax += dx / d * k; ay += dy / d * k; });
    o.vx += ax * dt; o.vy += ay * dt;
    const sp = Math.hypot(o.vx, o.vy) || 1, s2 = clamp(sp, vmin, vmax); o.vx *= s2 / sp; o.vy *= s2 / sp;
    o.x += o.vx * dt; o.y += o.vy * dt;
    // 画面端で反射
    if (o.x < R) { o.x = R; o.vx = Math.abs(o.vx); } if (o.x > W - R) { o.x = W - R; o.vx = -Math.abs(o.vx); }
    if (o.y < R) { o.y = R; o.vy = Math.abs(o.vy); } if (o.y > H - R) { o.y = H - R; o.vy = -Math.abs(o.vy); }
    // 窓(導入・質問・エンディングのウィンドウ)の境界で反射
    if (obstacle) {
      const L = obstacle.x - R, Rr = obstacle.x + obstacle.w + R, T = obstacle.y - R, B = obstacle.y + obstacle.h + R;
      if (o.x > L && o.x < Rr && o.y > T && o.y < B) {
        const dl = o.x - L, dr = Rr - o.x, dt2 = o.y - T, db = B - o.y, m = Math.min(dl, dr, dt2, db);
        if (m === dl) { o.x = L; o.vx = -Math.abs(o.vx); } else if (m === dr) { o.x = Rr; o.vx = Math.abs(o.vx); } else if (m === dt2) { o.y = T; o.vy = -Math.abs(o.vy); } else { o.y = B; o.vy = Math.abs(o.vy); }
        o.x = clamp(o.x, R, W - R); o.y = clamp(o.y, R, H - R);
        if (o.x > L && o.x < Rr && o.y > T && o.y < B) { const below = H - R >= B ? B : null, above = T >= R ? T : null; if (below !== null && (above === null || H - B >= T)) { o.y = below; o.vy = Math.abs(o.vy); } else if (above !== null) { o.y = above; o.vy = -Math.abs(o.vy); } }
      }
    }
  });
}

export class Orbs {
  constructor() { this.cv = null; this.ctx = null; this.orbs = null; this.t = 0; this.raf = 0; this.last = 0; this.obstacle = null; this.W = 0; this.H = 0; this.dpr = 1; this.sel = null; this.pts = null; this.onVis = () => { if (document.hidden) this.halt(); else if (this.cv) this.run(); }; this.vis = false; }
  attach(cv, obstacleFn) {
    if (!this.vis) { this.vis = true; document.addEventListener("visibilitychange", this.onVis); }
    this.cv = cv; this.ctx = cv.getContext("2d"); this.obstacleFn = obstacleFn || null; this.resize();
    if (!this.pts) this.pts = Array.from({ length: NPT }, (_, k) => { const z = 1 - 2 * (k + .5) / NPT, a = k * 2.399963, r = Math.sqrt(1 - z * z); return { x: r * Math.cos(a), y: z, z: r * Math.sin(a), d: DIG[(k * 7) % 10], dg: k % 7 === 0 }; });
    if (!this.orbs) this.orbs = makeOrbs(this.W, this.H);
    this.run();
  }
  resize() { if (!this.cv) return; this.dpr = Math.min(2, window.devicePixelRatio || 1); const w = this.cv.clientWidth || window.innerWidth, h = this.cv.clientHeight || window.innerHeight; this.W = w; this.H = h; this.cv.width = Math.round(w * this.dpr); this.cv.height = Math.round(h * this.dpr); if (this.orbs) this.orbs.forEach(o => { o.x = clamp(o.x, o.r, Math.max(o.r, w - o.r)); o.y = clamp(o.y, o.r, Math.max(o.r, h - o.r)); }); }
  halt() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  run() { if (this.raf || !this.cv || document.hidden) return; this.last = performance.now(); const loop = (now) => { this.raf = requestAnimationFrame(loop); const dt = Math.min(.05, (now - this.last) / 1000); this.last = now; this.tick(dt); }; this.raf = requestAnimationFrame(loop); }
  detach() { this.halt(); this.cv = null; }
  tick(dt) {
    if (!this.cv) return; if (this.cv.clientWidth && (this.cv.clientWidth !== this.W || this.cv.clientHeight !== this.H)) this.resize();
    this.bur = (this.bur || 0) * Math.exp(-dt / .45); if (this.bur < .01) this.bur = 0;
    this.t += dt; const ob = this.obstacleFn ? this.obstacleFn() : null; this.obstacle = ob;
    if (!this.sel) stepOrbs(this.orbs, dt, this.W, this.H, ob, this.t); else this.selStep(dt);
    this.draw();
  }
  // 選ばれた球体が広がり、画面全体をその色で塗る。完了で resolve
  select(i) { return new Promise(res => { this.sel = { i, p: 0, res }; }); }
  selStep(dt) { const s = this.sel, o = this.orbs[s.i]; s.p = Math.min(1, s.p + dt / .9); const ease = 1 - Math.pow(1 - s.p, 3); o.x += (this.W / 2 - o.x) * Math.min(1, dt * 6); o.y += (this.H / 2 - o.y) * Math.min(1, dt * 6); o.rr = o.r + (Math.hypot(this.W, this.H) * .62 - o.r) * ease; if (s.p >= 1 && s.res) { const f = s.res; s.res = null; f(); } }
  clearSelect() { this.sel = null; this.orbs.forEach(o => { o.rr = 0; }); }
  // 質問に答える・ページを送るたびに呼ぶ。大きなノイズが走り、減衰して静まる
  burst(a = 1) { this.bur = Math.min(1.6, Math.max(this.bur || 0, a)); }
  draw() {
    const c = this.ctx, d = this.dpr, t = this.t, bur = this.bur || 0, step = Math.floor(t * 9), hz = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };
    c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, this.W, this.H); c.globalCompositeOperation = "lighter";
    this.orbs.forEach((o, i) => {
      const col = ORB_COLORS[i % 3][1], sel = this.sel, mine = sel && sel.i === i, a = sel && !mine ? Math.max(0, 1 - sel.p * 2) : 1, R = mine && o.rr ? o.rr : o.r;
      if (a <= 0) return;
      const g = c.createRadialGradient(o.x, o.y, R * .1, o.x, o.y, R * 1.25); g.addColorStop(0, `rgba(${col},${(mine ? .35 + .65 * sel.p : .07 + .05 * bur) * a})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.beginPath(); c.arc(o.x, o.y, R * 1.25, 0, 7); c.fill();
      if (mine && sel.p > .6) return;
      const rot = t * .5 + i * 2, cs = Math.cos(rot), sn = Math.sin(rot), P = this.pts, pr = new Array(P.length);
      // デジタルノイズ: 輪郭は点ごとに断裂・散乱・再構築する。常時の小さなノイズ(base)に、操作のたびの大きなノイズ(bur)が重なる
      const base = .10, nz = base + .9 * bur, nb = 2 + Math.floor(bur * 4), bands = [];
      for (let b = 0; b < nb; b++) bands.push([o.y - R + hz(step, i * 7 + b) * 2 * R, (4 + hz(step, i + b * 3) * 10) * (1 + 3 * bur), (hz(step, i * 5 + b * 11) - .5) * (6 + 46 * bur)]);
      for (let k = 0; k < P.length; k++) { const p = P[k], x = p.x * cs + p.z * sn, z = -p.x * sn + p.z * cs, fk = hz(k + i * 131, step), fr = hz(k * 3.1 + i, step + 17);
        let px = o.x + x * R * (1 + (fr - .5) * .22 * (1 + 3 * bur)), py = o.y + p.y * R * (1 + (fk - .5) * .12);
        for (const [by, bh, bx] of bands) if (Math.abs(py - by) < bh) px += bx;                    // 帯状のずれ
        const fl = fk < nz * .35 ? (fr - .5) * R * (.6 + 2.2 * bur) : 0; px += fl; py += fl * (fr - .3);      // 点の散乱
        pr[k] = [px, py, z, fk < nz * (.12 + .5 * bur) ? 0 : 1]; }                               // 欠落
      c.strokeStyle = `rgba(${col},${.18 * a})`; c.lineWidth = .6; c.beginPath();
      for (let k = 0; k < P.length; k += 2) { const q = pr[(k * 5 + 3 + Math.floor(hz(k, step) * 3)) % P.length]; if (pr[k][3] && q[3] && hz(k, step + 5) > .25 + .4 * bur && Math.hypot(q[0] - pr[k][0], q[1] - pr[k][1]) < R * (.75 + .9 * bur)) { c.moveTo(pr[k][0], pr[k][1]); c.lineTo(q[0], q[1]); } } c.stroke();
      c.textAlign = "center"; c.font = "9px monospace";
      for (let k = 0; k < P.length; k++) { const q = pr[k]; if (!q[3]) continue; const al = (.25 + .5 * (q[2] + 1) / 2) * a; c.fillStyle = `rgba(${col},${al})`;
        if (P[k].dg || hz(k, step + 31) < .05 + .2 * bur) c.fillText(DIG[Math.floor(hz(k, step + 9) * 10)], q[0], q[1] + 3); else c.fillRect(q[0] - .7, q[1] - .7, 1.4 + (hz(k, step) < .1 + .2 * bur ? 1.6 : 0), 1.4); }
      // 画素のかけら(周囲に飛び散る四角)
      const frag = 6 + Math.floor(bur * 40); c.fillStyle = `rgba(${col},${.5 * a})`;
      for (let f = 0; f < frag; f++) { const ang = hz(f + i * 17, step) * 6.283, rr = R * (.9 + hz(f, step + 3) * (.5 + 1.4 * bur)), sz = 1 + hz(f, step + 7) * (2 + 3 * bur); c.fillRect(o.x + Math.cos(ang) * rr, o.y + Math.sin(ang) * rr * .9, sz, sz); }
    });
    c.globalCompositeOperation = "source-over";
  }
}
export const orbs = new Orbs();
