// 砂時計の輪郭を、点と数字で描く(開始演出・小型表示・拡大表示で共用)。表示専用で、数値には触れない。
const DIGITS = "0123456789";
// 輪郭に沿って等間隔の点を作る(上の部屋の左右・下の部屋の左右・上下の縁)
export function outlinePoints(g, n = 72) {
  const path = [], N = 16;
  for (let i = 0; i <= N; i++) { const y = g.yTop + (g.yNeck - g.yTop) * i / N; path.push([g.cx - g.halfTop(y), y]); }
  for (let i = 1; i <= N; i++) { const y = g.yNeck + (g.yBot - g.yNeck) * i / N; path.push([g.cx - g.halfBot(y), y]); }
  const left = path.slice(), right = left.map(([x, y]) => [2 * g.cx - x, y]).reverse();
  const rimT = [[g.cx - g.hw - g.m * .5, g.yTop - 1], [g.cx + g.hw + g.m * .5, g.yTop - 1]], rimB = [[g.cx - g.hw - g.m * .5, g.yBot + 1], [g.cx + g.hw + g.m * .5, g.yBot + 1]];
  const lines = [left, right, rimT, rimB], len = lines.map(l => { let s = 0; for (let i = 1; i < l.length; i++) s += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]); return s; }), tot = len.reduce((a, b) => a + b, 0), pts = [];
  lines.forEach((l, li) => { const k = Math.max(2, Math.round(n * len[li] / tot)); let acc = 0, seg = 0; const cum = [0]; for (let i = 1; i < l.length; i++) cum.push(cum[i - 1] + Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]));
    for (let j = 0; j < k; j++) { const d = len[li] * j / (k - 1); while (seg < l.length - 2 && cum[seg + 1] < d) seg++; const f = (d - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]); pts.push({ x: l[seg][0] + (l[seg + 1][0] - l[seg][0]) * f, y: l[seg][1] + (l[seg + 1][1] - l[seg][1]) * f, d: DIGITS[(pts.length * 7) % 10] }); } void acc; });
  return pts;
}
const cache = new WeakMap();
export const pointsFor = (g, compact) => { let c = cache.get(g); if (!c) cache.set(g, c = {}); const key = compact ? "c" : "b"; return c[key] || (c[key] = outlinePoints(g, compact ? 46 : 96)); };
// 輪郭を描く。compact は小さな点だけ、大きい表示は点と数字(4つに1つ)。
export function drawGlassFrame(ctx, g, rgb, compact = false, alpha = 1) {
  ctx.beginPath(); const N = 14;
  for (let i = 0; i <= N; i++) { const y = g.yTop + (g.yNeck - g.yTop) * i / N; const x = g.cx - g.halfTop(y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  for (let i = 0; i <= N; i++) { const y = g.yNeck + (g.yBot - g.yNeck) * i / N; ctx.lineTo(g.cx - g.halfBot(y), y); }
  ctx.lineTo(g.cx + g.halfBot(g.yBot), g.yBot);
  for (let i = N; i >= 0; i--) { const y = g.yNeck + (g.yBot - g.yNeck) * i / N; ctx.lineTo(g.cx + g.halfBot(y), y); }
  for (let i = N; i >= 0; i--) { const y = g.yTop + (g.yNeck - g.yTop) * i / N; ctx.lineTo(g.cx + g.halfTop(y), y); }
  ctx.closePath(); ctx.fillStyle = `rgba(${rgb},${.05 * alpha})`; ctx.fill();
  const pts = pointsFor(g, compact), s = compact ? 1.6 : 2.4; ctx.fillStyle = `rgba(${rgb},${.9 * alpha})`;
  ctx.beginPath(); pts.forEach((p, i) => { if (!compact && i % 4 === 0) return; ctx.rect(p.x - s / 2, p.y - s / 2, s, s); }); ctx.fill();
  if (!compact) { ctx.font = "9px monospace"; ctx.textAlign = "center"; ctx.fillStyle = `rgba(${rgb},${.75 * alpha})`; pts.forEach((p, i) => { if (i % 4 === 0) ctx.fillText(p.d, p.x, p.y + 3); }); }
  ctx.fillStyle = `rgba(${rgb},${alpha})`; ctx.fillRect(g.cx - g.nh - 1.2, g.yNeck - .8, 1.6, 1.6); ctx.fillRect(g.cx + g.nh - .4, g.yNeck - .8, 1.6, 1.6);
}
