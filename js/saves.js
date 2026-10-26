// 色別セーブ: 青・緑・橙の各CRTテーマに独立した世界を1つずつ対応させる。
// 安全設計: 既存セーブは削除も上書きもしない(旧形式の枠は「取り込み=コピー」のみ)。書き込みは検証し、失敗しても元のデータを残す。
import * as E from "./engine.js";
export const THEMES = ["blue", "green", "orange"];
export const THEME_NAME = { blue: "青", green: "緑", orange: "橙" };
export const slotKey = (t) => "weol.world." + t;
export const LEGACY_KEYS = ["weol.save.1", "weol.save.2", "weol.save.3", "weol.save.auto"];
export const legacyName = (k) => (k.endsWith("auto") ? "旧・自動セーブ" : "旧・枠" + k.slice(-1));

const validJson = (x) => { try { const j = JSON.parse(x); return !!j && Array.isArray(j.countries); } catch { return false; } };
export function summary(j) { return j && j.countries ? { year: j.year, pop: Math.round(E.total(j)), ended: !!j.ended } : null; }
// 読み込み: empty / ok / recovered(直前の保存から復元) / corrupt
export function read(store, key) {
  const one = (k) => { let raw = null; try { raw = store.getItem(k); } catch { return { status: "corrupt" }; }
    if (raw === null || raw === undefined) return { status: "empty" };
    try { const j = JSON.parse(raw); if (!j || !Array.isArray(j.countries) || typeof j.year !== "number") throw 0; return { status: "ok", state: E.migrate(j) }; } catch { return { status: "corrupt" }; } };
  const r = one(key); if (r.status !== "corrupt") return r;
  const p = one(key + ".prev"); return p.status === "ok" ? { status: "recovered", state: p.state } : { status: "corrupt" };
}
// 書き込み: 直前の内容を .prev に退避してから書き、読み戻して検証する。失敗したら元のデータはそのまま
export function write(store, key, state) {
  let str; try { str = JSON.stringify(state); } catch { return { ok: false, err: "serialize" }; }
  const put = () => { const old = store.getItem(key); if (old !== null && validJson(old)) { try { store.setItem(key + ".prev", old); } catch { try { store.removeItem(key + ".prev"); } catch { } } } store.setItem(key, str); return store.getItem(key) === str; };
  try { if (put()) return { ok: true }; } catch { }
  try { const cur = store.getItem(key); if (cur === null || validJson(cur)) store.removeItem(key + ".prev"); store.setItem(key, str); if (store.getItem(key) === str) return { ok: true, noPrev: true }; } catch { } // 容量不足: 退避を捨てて再試行(失敗しても元のデータは残る)
  return { ok: false, err: "quota" };
}
export function legacyList(store) {
  const out = []; for (const k of LEGACY_KEYS) { const r = read(store, k); if (r.status === "ok" || r.status === "recovered") out.push({ key: k, name: legacyName(k), sum: summary(r.state) }); } return out;
}
// 旧セーブの取り込み: 空の色スロットへコピーするだけ。元は残し、既にある世界は上書きしない
export function importLegacy(store, legacyKey, theme) {
  if (!THEMES.includes(theme)) return { ok: false, reason: "theme" };
  if (read(store, slotKey(theme)).status !== "empty") return { ok: false, reason: "occupied" };
  const r = read(store, legacyKey); if (r.status !== "ok" && r.status !== "recovered") return { ok: false, reason: "source" };
  const w = write(store, slotKey(theme), r.state); return w.ok ? { ok: true } : { ok: false, reason: w.err };
}
export function overview(store) { return THEMES.map(t => { const r = read(store, slotKey(t)); return { theme: t, status: r.status, sum: r.state ? summary(r.state) : null }; }); }
