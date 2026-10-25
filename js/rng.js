// 乱数(mulberry32)。状態は s.rng に保持する。engine.js と world9.js が同じ列を共有する(1か所に集約)
export function rnd(s) {
  let t = (s.rng = (s.rng + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
