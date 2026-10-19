import * as E from "./engine.js";
import * as I from "./insight.js";
import { MAP } from "./mapdata.js";
import { FACTYPES } from "./data.js";
import { SITES, TYPE_NAME, MODES } from "./heritage.js";
import { MAMMAL_DEFINITION, STANCE_NAME, GROUPS } from "./life.js";

const $ = (id) => document.getElementById(id);
const SAVE = "weol.save.", SETKEY = "weol.settings", SPEEDS = [0, 1, 4, 20, 100];
let S = null, paused = false, speedIdx = 1, sel = null, tab = "map", acc = 0, last = performance.now(), lastSaveY = 0, vb = [0, 0, 1000, 500], pathEls = {};
let settings = { theme: "blue", tutorialDone: false, speed: 1 }, rgb = "77,166,255", logFilter = "important", draft = null, trendCache = null, prev = {};
let toastShown = 0;

// ---------- 設定(セーブとは別に保存) ----------
function loadSettings() { try { const j = JSON.parse(localStorage.getItem(SETKEY)); if (j) settings = { ...settings, ...j }; } catch { } if (!(settings.speed >= 1 && settings.speed <= 4)) settings.speed = 1; speedIdx = settings.speed; }
function saveSettings() { try { localStorage.setItem(SETKEY, JSON.stringify(settings)); } catch { } }
function applyTheme(t) {
  if (!["blue", "green", "orange"].includes(t)) t = "blue";
  settings.theme = t; document.documentElement.dataset.theme = t;
  rgb = getComputedStyle(document.documentElement).getPropertyValue("--rgb").trim();
  document.querySelectorAll("[data-th]").forEach(b => b.classList.toggle("on", b.dataset.th === t));
  saveSettings(); if (S) { paintMap(); head(); }
}
function newGame(seed) { S = E.newGame(seed || (Date.now() % 100000) + 1); paused = false; sel = null; draft = null; trendCache = null; lastSaveY = S.year; prev = {}; toastShown = 0; refresh(true); }
const idx = (id) => S.countries.findIndex(c => c.id === id);
const fmtN = (n) => Math.round(n).toLocaleString("en-US");

// ---------- 地図(単色の濃淡) ----------
function buildMap() {
  const svg = $("svg"); svg.innerHTML = ""; pathEls = {};
  for (const m of MAP) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", m.d); p.dataset.e = m.e; p.dataset.n = m.n;
    svg.appendChild(p); (pathEls[m.e] = pathEls[m.e] || []).push(p);
  }
  let down = null, moved = false, pinch = null; const pts = new Map();
  svg.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY, vb: [...vb] }; moved = false; svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, e); pinch = null; });
  svg.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e);
    const r = svg.getBoundingClientRect();
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (pinch) zoom(pinch / d, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2); pinch = d; moved = true; return; }
    if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > 6) moved = true;
    if (moved) { vb[0] = down.vb[0] - dx * vb[2] / r.width; vb[1] = down.vb[1] - dy * vb[3] / r.height; clampVB(); }
  });
  svg.addEventListener("pointerup", e => { pts.delete(e.pointerId); pinch = null; if (!moved && down) { const t = document.elementFromPoint(e.clientX, e.clientY); if (t && t.dataset && t.dataset.e) select(t.dataset.e); } down = null; });
  svg.addEventListener("pointercancel", e => { pts.delete(e.pointerId); down = null; });
  svg.addEventListener("wheel", e => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY); }, { passive: false });
}
function clampVB() { vb[2] = Math.min(1000, Math.max(60, vb[2])); vb[3] = vb[2] / 2; vb[0] = Math.max(0, Math.min(1000 - vb[2], vb[0])); vb[1] = Math.max(0, Math.min(500 - vb[3], vb[1])); $("svg").setAttribute("viewBox", vb.join(" ")); }
function zoom(f, cx, cy) { const r = $("svg").getBoundingClientRect(); const px = vb[0] + (cx - r.left) / r.width * vb[2], py = vb[1] + (cy - r.top) / r.height * vb[3]; const w = vb[2] * f; vb[0] = px - (px - vb[0]) * w / vb[2]; vb[1] = py - (py - vb[1]) * w / vb[2]; vb[2] = w; clampVB(); }
function colorFor(c) {
  const A = (a) => `rgba(${rgb},${Math.max(.04, Math.min(1, a)).toFixed(2)})`;
  if (c.extinct) return A(.04);
  const L = $("layer").value;
  if (L === "pop") return A(.1 + .85 * Math.min(1, Math.log10(Math.max(1, E.cpop(c) / c.P0 * 100)) / 2.2));
  if (L === "happy") return A(.1 + .85 * c.happy);
  if (L === "unrest") return A(.08 + .9 * c.unrest);
  const i = idx(c.id); let n = 0, r = 0, bad = false;
  for (const f of S.facs) if (f.c === i) { n++; if (f.st === 0) r++; else if (f.st === 3) bad = true; }
  return bad ? A(1) : A(.1 + .7 * (n ? r / n : 0));
}
function paintMap() {
  S.countries.forEach(c => { const col = colorFor(c); for (const p of pathEls[c.id] || []) p.style.fill = col; });
  $("legend").textContent = { pop: "明るいほど人口が多い(2020年比・対数)。暗い=無人。", happy: "明るいほど幸福。", unrest: "明るいほど社会不安が高い。", fac: "明るいほど稼働施設が多い。最も明るい=事故施設あり。" }[$("layer").value];
}
function select(id) { sel = id; document.querySelectorAll("#svg path.sel").forEach(p => p.classList.remove("sel")); (pathEls[id] || []).forEach(p => p.classList.add("sel")); cardUpdate(); }
function cardUpdate() {
  const el = $("card"); if (!sel) return; const i = idx(sel); if (i < 0) return; const c = S.countries[i];
  const cnt = FACTYPES.map((T, t) => { const f = S.facs.filter(x => x.c === i && x.t === t); const k = [0, 0, 0, 0]; f.forEach(x => k[x.st]++); return `<span>${T.name}</span><span>${f.length}基 稼働${k[0]} 停止中${k[1]} 封鎖${k[2]}${k[3] ? ` 事故${k[3]}!` : ""}</span>`; }).join("");
  el.innerHTML = `<b>${c.name}</b>${c.extinct ? " (無人)" : ""}<div class="kv"><span>人口</span><span>${fmtN(E.cpop(c))}人</span><span>幸福度</span><span>${(c.happy * 100).toFixed(0)}</span><span>希望(出生率の源)</span><span>${(c.hope ?? 1).toFixed(2)}</span><span>社会不安</span><span>${(c.unrest * 100).toFixed(0)}</span><span>終活への合意</span><span>${(c.consent * 100).toFixed(0)}%</span><span>認識(絶滅)</span><span>${(c.aware * 100).toFixed(0)}%</span><span>労働力維持</span><span>${(c.m * 100).toFixed(0)}%</span><span>天文現象の遮蔽の弱さ(創作)</span><span>${((c.ex ?? 1)).toFixed(2)}</span>${cnt}</div>`;
}

// ---------- 砂時計(軽量: 割合を面積で描く。全員を1粒ずつ描かない) ----------
function glass(svg, upper, flowing) {
  const W = 30, H = 44, mid = H / 2, f = Math.max(0, Math.min(1, upper));
  const hT = mid * Math.sqrt(f) * .92, wT = W * Math.sqrt(f) * .92;
  const g = 1 - f, hB = mid * Math.sqrt(g) * .92, yB = H - hB, wB = W * (1 - Math.sqrt(g) * .92);
  const topSand = f > 0 ? `<polygon class="sand" points="${(W / 2 - wT / 2).toFixed(1)},${(mid - hT).toFixed(1)} ${(W / 2 + wT / 2).toFixed(1)},${(mid - hT).toFixed(1)} ${W / 2},${mid - 1}"/>` : "";
  const botSand = g > 0 ? `<polygon class="sand" points="1,${H - 1} ${W - 1},${H - 1} ${(W / 2 + wB / 2).toFixed(1)},${yB.toFixed(1)} ${(W / 2 - wB / 2).toFixed(1)},${yB.toFixed(1)}"/>` : "";
  svg.innerHTML = `<polygon class="shell" points="1,1 ${W - 1},1 ${W / 2},${mid} ${W - 1},${H - 1} 1,${H - 1} ${W / 2},${mid}"/>${topSand}${botSand}${flowing ? `<line class="stream" x1="${W / 2}" y1="${mid}" x2="${W / 2}" y2="${H - 3}"/>` : ""}`;
}
export function hourglassNumbers(s) { // ゲーム内数値と表示数値を一致させる唯一の窓口
  const alive = Math.round(E.total(s)), ever = Math.round(s.g.P0 + s.g.hBorn), mt = E.mammalTotals(s), mAlive = Math.round(mt.alive), mEver = Math.round(mt.ever);
  return { hAlive: alive, hDead: ever - alive, hEver: ever, aAlive: s.g.aiActive, aDead: s.g.aiStopped, aEver: s.g.aiBuilt, mAlive, mDead: mEver - mAlive, mEver };
}
function hourglasses() {
  const n = hourglassNumbers(S);
  $("h_alive").textContent = fmtN(n.hAlive); $("h_dead").textContent = fmtN(n.hDead);
  $("a_alive").textContent = fmtN(n.aAlive); $("a_dead").textContent = fmtN(n.aDead);
  $("m_alive").textContent = fmtN(n.mAlive); $("m_dead").textContent = fmtN(n.mDead);
  glass($("gh"), n.hAlive / Math.max(1, n.hEver), n.hDead > (prev.hDead ?? n.hDead));
  glass($("ga"), n.aAlive / Math.max(1, n.aEver), n.aDead > (prev.aDead ?? n.aDead));
  glass($("gm"), n.mAlive / Math.max(1, n.mEver), n.mDead > (prev.mDead ?? n.mDead));
  prev = n;
}
const GLASS_INFO = {
  h: { name: "人類", up: "生存者", down: "累計死亡者", add: "累計の誕生(初期の78億人を除く)", note: "出生は上に加わり、死亡は下へ移る。事故・紛争・天文現象の影響も死亡に数える。", ser: "h" },
  a: { name: "AI個体", up: "稼働個体", down: "累計の停止・廃棄", add: "累計の新造(初期を含む)", note: "AIは固有のワンチップを核とする個体。新造は製造枠で制限される。休眠・再稼働や身体の移設では数えない。故障もコアの喪失として下に入る。", ser: "a" },
  m: { name: "大型哺乳類", up: "生存個体", down: "累計死亡個体", add: "累計の誕生(初期の個体を除く)", note: "人類以外の大型哺乳類5群の合計(家畜・伴侶動物を含む)。出生は上に、死亡は下へ。", ser: "m" },
};
function chart(series, W = 300, H = 90) {
  if (!series || series.length < 2) return `<div class="small">年次推移は5年ごとに記録されます。もう少し進めると表示されます。</div>`;
  const x0 = series[0][0], x1 = series[series.length - 1][0], m1 = Math.max(1, ...series.map(r => r[1])), m2 = Math.max(1, ...series.map(r => r[2]));
  const px = (y) => 4 + (W - 8) * (y - x0) / Math.max(1, x1 - x0), py = (v, m) => H - 4 - (H - 10) * v / m;
  const pl = (k, m) => series.map(r => `${px(r[0]).toFixed(1)},${py(r[k], m).toFixed(1)}`).join(" ");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="年次推移"><line class="ax" x1="4" y1="${H - 4}" x2="${W - 4}" y2="${H - 4}"/><polyline class="l2" points="${pl(2, m2)}"/><polyline class="l1" points="${pl(1, m1)}"/></svg><div class="small">${x0}年〜${x1}年(5年ごと)。実線=生存/稼働(縦軸の最大 ${fmtN(m1)})、破線=累計の死亡/停止(最大 ${fmtN(m2)})。2本は別の縮尺。</div>`;
}
function glassModal(which = "h") {
  const m = $("modal"), b = $("mbox"), n = hourglassNumbers(S), r = S.g.rate || {}, G = GLASS_INFO[which];
  const v = { h: [n.hAlive, n.hDead, n.hEver, r.hb, r.hd], a: [n.aAlive, n.aDead, n.aEver, r.ab, r.as], m: [n.mAlive, n.mDead, n.mEver, r.mb, r.md] }[which];
  const extra = which === "a" ? `<span>うち故障による喪失(累計)</span><span>${fmtN(S.g.aiFailed)}</span>` : "";
  const groups = which === "m" ? `<h3>種群別</h3><table class="pv"><tr><th>種群</th><th>個体数</th><th>2020年比</th><th>状態</th></tr>${GROUPS.map((G2, i) => { const x = S.mam[i]; return `<tr><td>${G2.name}</td><td>${fmtN(x.n)}</td><td>${(x.n / G2.n0 * 100).toFixed(0)}%</td><td>${x.n <= 0 ? "絶滅" + (x.ext ? " " + x.ext : "") : G2.wild ? "福祉" + (x.w * 100).toFixed(0) : "人類依存"}</td></tr>`; }).join("")}</table>` : "";
  b.innerHTML = `<div class="seg" id="gtabs">${[["h", "人類"], ["a", "AI"], ["m", "哺乳類"]].map(([k, nm]) => `<button data-gt="${k}" class="${which === k ? "on" : ""}">${nm}</button>`).join("")}</div>
  <div class="bigglass"><svg id="gbig" viewBox="0 0 30 44" aria-hidden="true"></svg><div class="kv"><span>${G.up}</span><span>${fmtN(v[0])}</span><span>${G.down}</span><span>${fmtN(v[1])}</span><span>${G.add}</span><span>${fmtN(v[2])}</span><span>今年の増加(出生・新造)</span><span>+${fmtN(v[3] || 0)}</span><span>今年の減少(死亡・停止)</span><span>−${fmtN(v[4] || 0)}</span>${extra}</div></div>
  <div class="small">砂の量は割合の概念表示(上=${G.up}の割合)。${G.note}</div>
  <h3>年次推移</h3>${chart(S.series[G.ser])}${groups}
  <div class="row" style="margin-top:10px"><button id="gclose" style="flex:1">閉じる</button></div>`;
  m.hidden = false; glass($("gbig"), v[0] / Math.max(1, v[2]), (v[4] || 0) > 0);
  b.querySelectorAll("[data-gt]").forEach(x => x.onclick = () => glassModal(x.dataset.gt));
  $("gclose").onclick = () => { m.hidden = true; if (S.pending || S.ended) modal(); };
}

// ---------- ヘッダ ----------
function phaseName() { const y = S.year; return y < E.DISCOVERY ? "観察期" : y < E.CERTAIN ? "発見後" : y < E.PROGRAM ? "確定後" : S.g.extinctYear !== undefined ? "消滅後" : "終活期"; }
function speedText() {
  const mult = SPEEDS[speedIdx], toGoal = S.year < E.PROGRAM ? `2100年まで約${Math.max(1, Math.round((E.PROGRAM - S.year) / mult))}秒` : `100年で約${Math.round(100 / mult)}秒`;
  return `${paused ? "一時停止中(速度 ×" + mult + " を維持)" : "×" + mult}: 現実1秒=ゲーム内${mult}年。×1は1年=1秒。${toGoal}`;
}
function head() {
  $("date").textContent = S.year + "年"; $("phase").textContent = phaseName();
  const modeName = { manual: "手動", semi: "半自動", auto: "全自動" }[S.mode]; $("modechip").textContent = "進行:" + modeName;
  document.querySelectorAll("#speed [data-s]").forEach(b => b.classList.toggle("on", +b.dataset.s === speedIdx));
  const pb = $("pause"); pb.textContent = paused ? "▶" : "⏸"; pb.classList.toggle("on", paused); pb.setAttribute("aria-pressed", paused);
  $("spdlabel").textContent = E.era(S) + " | " + speedText();
  document.body.classList.toggle("paused", paused || !!S.pending);
  hourglasses();
  const un = S.autoLog.filter(a => !a.seen), imp = un.filter(a => a.important);
  const ab = $("autobtn"); ab.hidden = !S.autoLog.length; ab.textContent = `自動判断${un.length ? " 未確認" + un.length : ""}`; ab.classList.toggle("alert", imp.length > 0);
  const l = S.log[S.log.length - 1]; $("ticker").textContent = imp.length ? `⚠ 重要な自動判断: ${imp[imp.length - 1].title}→「${imp[imp.length - 1].label}」(タップで確認)` : l ? `${l.y} ${l.t}` : "";
}
const bar = (v) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div>`;

// ---------- 状況 ----------
function radar(m, tr) {
  const R = 62, cx = 120, cy = 82, n = I.METRICS.length;
  const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const poly = I.METRICS.map(([k], i) => pt(i, R * Math.min(100, m[k]) / 100).map(v => v.toFixed(1)).join(",")).join(" ");
  const ax = I.METRICS.map((_, i) => `<line class="ax" x1="${cx}" y1="${cy}" x2="${pt(i, R)[0].toFixed(1)}" y2="${pt(i, R)[1].toFixed(1)}"/>`).join("") + [.5, 1].map(f => `<polygon class="ax" points="${I.METRICS.map((_, i) => pt(i, R * f).map(v => v.toFixed(1)).join(",")).join(" ")}"/>`).join("");
  const lb = I.METRICS.map(([k, name], i) => { const [x, y] = pt(i, R + 14); const t = tr ? (tr[k] > .5 ? "▲" : tr[k] < -.5 ? "▼" : "→") : ""; return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${name}${m[k].toFixed(0)}${t}</text>`; }).join("");
  return `<svg class="radar" viewBox="0 0 240 170" width="100%" role="img" aria-label="7つの指標">${ax}<polygon class="poly" points="${poly}"/>${lb}</svg>`;
}
function statusView() {
  const g = S.g, ai = S.ai, m = I.metrics(S), bn = I.bottleneck(S), n = hourglassNumbers(S);
  const F = FACTYPES.map((T, t) => { const f = S.facs.filter(x => x.t === t); const c = [0, 0, 0, 0]; f.forEach(x => c[x.st]++); return `<span>${T.name}</span><span>${f.length} / 稼働${c[0]} 停止中${c[1]} 封鎖${c[2]}${c[3] ? ` 事故${c[3]}!` : ""}</span>`; }).join("");
  const ph = g.lull > .5 ? "静穏期(放射が弱い)" : g.peak > .6 ? "活発期(放射が強い)" : "通常", fr = E.coreFailRate(S), mt = E.mammalTotals(S), wa = E.wildAlive(S);
  $("status").innerHTML = `<div class="card alert"><b>いまの最大のボトルネック: ${bn.name} (${bn.value.toFixed(0)})</b><div class="small">原因: ${bn.cause}</div></div>
  <h3>7つの指標(▲▼は今後10年の見込み)</h3><div id="radarbox">${radar(m, trendCache && trendCache.year === S.year ? trendCache.d : null)}</div>
  <div class="small">${I.RELATIONS.map(r => `${r[0]}${r[1]}${r[2]}: ${r[3]}`).join("<br>")}</div>
  ${S.lastChoice ? `<h3>直近の判断の結果</h3><div class="card small"><b>${S.lastChoice.title}</b>「${S.lastChoice.label}」<br>即時の変化: ${S.lastChoice.diff}</div>` : ""}
  <h3>天文現象(創作仮説)</h3><div class="kv"><span>強度</span><span>${g.astro.toFixed(2)} / ${ph}</span><span>AIコアの故障率</span><span>年${(fr * 100).toFixed(1)}%</span><span>累計の故障</span><span>${fmtN(g.aiFailed)}</span></div>
  <div class="small">強度は数百年かけて波打ちながら強まる。静穏期は出生の持ち直しや人口の停滞・回復の条件になり、活発期はコアの故障と出生の減少を招く。地域ごとに遮蔽の差がある。これらは作品固有の仮設定。</div>
  <h3>人類・AI・大型哺乳類の累計</h3><div class="kv"><span>人類 生存/累計死亡</span><span>${fmtN(n.hAlive)} / ${fmtN(n.hDead)}</span><span>AI 稼働/累計停止</span><span>${fmtN(n.aAlive)} / ${fmtN(n.aDead)}</span><span>哺乳類 生存/累計死亡</span><span>${fmtN(n.mAlive)} / ${fmtN(n.mDead)}</span><span>野生4群の生存</span><span>${fmtN(wa.alive)}(${(wa.alive / wa.n0 * 100).toFixed(0)}%)</span></div>
  <div class="small">砂時計は上部タップで拡大(増減・年次推移)。身体の交換・移設や休眠・再稼働では個体数は変わらない。</div>
  <h3>世界</h3><div class="kv"><span>自然(生物圏)</span><span>${g.bio.toFixed(0)}</span></div>${bar(g.bio)}
  <div class="kv"><span>汚染</span><span>${g.pl.toFixed(0)}</span></div>${bar(g.pl)}
  <div class="kv"><span>文明遺産</span><span>${m.her.toFixed(0)}</span></div>${bar(m.her)}
  <div class="kv"><span>天然資源</span><span>${g.res.toFixed(0)}</span></div>${bar(g.res)}
  <div class="kv"><span>管理リソース(年)</span><span>${g.flow.toFixed(0)}</span><span>事故累計</span><span>${g.accidents}</span><span>紛争累計</span><span>${g.wars}</span><span>大型哺乳類の評価</span><span>${E.mammalScore(S).score.toFixed(0)}</span></div>
  <h3>生存研究 / 機械文明</h3>
  <div class="kv"><span>生存研究(コア遮蔽にも寄与)</span><span>${g.rsr.toFixed(0)}/100</span></div>${bar(g.rsr)}
  <div class="kv"><span>方舟計画</span><span>${g.arkYear ? "完了 " + g.arkYear + "年 / " + g.survivors + "人" : S.flags.ark ? "進行中 " + Math.min(100, S.flags.arkProg || 0).toFixed(0) + "%" : "未着手"}</span></div>
  <div class="kv"><span>機械の自律度</span><span>${g.mach.toFixed(0)}</span></div>${bar(g.mach)}
  <div class="kv"><span>機械停止準備</span><span>${g.stopReady.toFixed(0)}</span></div>${bar(g.stopReady)}
  <h3>管理AI(あなた・固有のワンチップ)</h3>
  <div class="kv"><span>能力</span><span>${ai.cap.toFixed(0)}</span><span>洞察</span><span>${ai.insight.toFixed(0)}</span><span>倫理的整合</span><span>${ai.align.toFixed(0)}</span><span>自己保存傾向</span><span>${(ai.sp * 100).toFixed(0)}%</span><span>人間からの信頼</span><span>${ai.trust.toFixed(0)}</span><span>人間主権の尊重</span><span>${(g.sov * 100).toFixed(0)}%</span></div>
  <h3>施設(6分類・個別管理)</h3><div class="kv">${F}</div>`;
  if (!trendCache || trendCache.year !== S.year) setTimeout(() => { if (tab !== "status") return; const now = I.metrics(S), later = I.metrics(I.project(S, 10)); trendCache = { year: S.year, d: I.diff(now, later) }; const rb = $("radarbox"); if (rb) rb.innerHTML = radar(m, trendCache.d); }, 30);
}

// ---------- 方針(進行モード・価値観・下書き→見込み→適用) ----------
const CH_NOTE = { research: "短期:効果は薄い/長期:方舟の可能性とAIコアの遮蔽/時間差:数十年", care: "短期:幸福と希望が上がる/長期:穏やかな最期、出生の持ち直しにも寄与/副作用:資源を消費", decom: "短期:危険施設が減る/長期:事故の根を断つ/時間差:年単位で進む", stop: "短期:見えにくい/長期:機械を止められる/時間差:数十年", eco: "短期:緩やか/長期:自然の回復を早める", heritage: "短期:資源消費/長期:遺産が残る", wild: "短期:野生の福祉と生息地が改善/長期:絶滅を遅らせる(避けられない)/副作用:人類の終活に使える資源が減る" };
const MODE_DESC = { manual: "重要イベントごとに停止し、あなたが選ぶ。", semi: "国家・地域の人口減少に伴う縮退対応(都市の縮退・国家運営の委任・最後の学校・最後の街)だけ自動。それ以外は停止。", auto: "原則すべてのイベントと配分をAIが自動処理。理由と結果はログと「自動判断」に残る。" };
function sumP(p) { return Math.max(1, Object.values(p).reduce((a, b) => a + (b || 0), 0)); }
function ensureDraft() { if (!draft) draft = { policy: { ...S.policy }, sovMode: S.sovMode, machStance: S.machStance, focus: S.ai.focus, wildStance: S.wildStance }; }
const dirty = () => draft && (JSON.stringify(draft.policy) !== JSON.stringify(S.policy) || draft.sovMode !== S.sovMode || draft.machStance !== S.machStance || draft.focus !== S.ai.focus || draft.wildStance !== S.wildStance);
function prefBars() {
  const { vec, n, lam } = E.prefProfile(S);
  return `<div class="kv">${Object.entries(E.VALUE_NAMES).map(([k, nm]) => `<span>${nm}</span><span>${vec[k].toFixed(2)}</span>`).join("")}</div><div class="small">2020〜2100年の判断${n}件から数値化。${lam < .5 ? `判断が少ないため、既定の初期方針(尊厳${E.DEFAULT_PREF.dignity}・安全${E.DEFAULT_PREF.safety}・AI存続${E.DEFAULT_PREF.ai}など)を${Math.round((1 - lam) * 100)}%併用。` : "自動判断の基準になります。"}</div>`;
}
function policyView() {
  ensureDraft(); const prog = E.programActive(S), p = draft.policy, sum = sumP(p);
  $("policy").innerHTML = `<h3>進行モード(2100年以降)</h3><div class="seg">${Object.entries(E.MODES).map(([k, nm]) => `<button data-mode="${k}" class="${S.mode === k ? "on" : ""}">${nm}</button>`).join("")}</div>
  <div class="small">${MODE_DESC[S.mode]}${S.year < E.PROGRAM ? "(自動は2100年から有効。それまでは常に手動で、ここでの判断が価値観になる)" : ""}いつでも変更できる。</div>
  <details><summary>あなたの価値観(自動判断の基準)</summary>${prefBars()}</details>
  <h3>資源配分</h3><div class="card small">${prog ? "管理リソースの配分。人口には直接触れられません。" : "2100年までは観察期。配分は2100年から効力を持ちます。"}変更は下書きで、見込みを見てから「適用」します。</div>${E.CHANNELS.map(([k, n]) => `<div class="sl"><label><span>${n}</span><span id="pv_${k}">${((p[k] || 0) / sum * 100).toFixed(0)}%</span></label><input type="range" min="0" max="100" value="${p[k] || 0}" data-k="${k}" aria-label="${n}"><div class="small">${CH_NOTE[k]}</div></div>`).join("")}
  <div class="row">${Object.entries({ balanced: "均衡", care: "終活重視", research: "研究重視", safety: "停止重視", legacy: "自然・遺産", wild: "野生保護" }).map(([k, n]) => `<button data-pre="${k}">${n}</button>`).join("")}</div>
  <h3>人類と大型哺乳類の土地の分け方</h3><div class="seg">${Object.entries(STANCE_NAME).map(([k, nm]) => `<button data-ws="${k}" class="${draft.wildStance === k ? "on" : ""}">${nm}</button>`).join("")}</div>
  <div class="small">野生優先: 生息地と生態系は守れるが、人類の幸福と資源を圧迫する。人類優先: 逆。どちらでも大型哺乳類の絶滅は避けられないが、最期までの福祉と時間が変わる。</div>
  <h3>停止の進め方</h3><div class="seg"><button data-sov="consent" class="${draft.sovMode === "consent" ? "on" : ""}">合意に基づく</button><button data-sov="override" class="${draft.sovMode === "override" ? "on" : ""}">強制停止</button></div>
  <div class="small">強制:短期は安全が早まる/長期は主権・信頼・社会の安定を損なう。</div>
  <h3>機械文明の方針</h3><div class="seg">${[["limit", "抑制"], ["std", "標準"], ["expand", "拡大"]].map(([k, n]) => `<button data-st="${k}" class="${draft.machStance === k ? "on" : ""}">${n}</button>`).join("")}</div>
  <div class="small">機械は施設の維持を担うが、増えるほど停止が難しい。新造は製造枠で制限され、コアは複製できない。コアの故障を補う力は方針で変わる(抑制では絞られる)。</div>
  <h3>AIの学習方針</h3><div class="seg">${[["ethics", "倫理"], ["world", "観測"], ["tech", "技術"]].map(([k, n]) => `<button data-f="${k}" class="${draft.focus === k ? "on" : ""}">${n}</button>`).join("")}</div>
  <h3>変更の見込み(現状維持との差)</h3><div id="pvbox" class="small">${dirty() ? "計算中…" : "変更なし"}</div>
  <div class="row" style="margin-top:8px"><button id="apply" ${dirty() ? "" : "disabled"}>この方針を適用</button><button id="revert" ${dirty() ? "" : "disabled"}>下書きを戻す</button></div>`;
  const q = (sel, fn) => $("policy").querySelectorAll(sel).forEach(fn);
  q("[data-mode]", b => b.onclick = () => setMode(b.dataset.mode));
  q("input[type=range]", r => { r.oninput = () => { draft.policy[r.dataset.k] = +r.value; const s2 = sumP(draft.policy); for (const [k] of E.CHANNELS) $("pv_" + k).textContent = ((draft.policy[k] || 0) / s2 * 100).toFixed(0) + "%"; }; r.onchange = () => policyView(); });
  q("[data-pre]", b => b.onclick = () => { draft.policy = { ...E.PRESETS[b.dataset.pre] }; policyView(); });
  q("[data-sov]", b => b.onclick = () => { draft.sovMode = b.dataset.sov; policyView(); });
  q("[data-st]", b => b.onclick = () => { draft.machStance = b.dataset.st; policyView(); });
  q("[data-f]", b => b.onclick = () => { draft.focus = b.dataset.f; policyView(); });
  q("[data-ws]", b => b.onclick = () => { draft.wildStance = b.dataset.ws; policyView(); });
  $("apply").onclick = () => { S.policy = { ...draft.policy }; S.sovMode = draft.sovMode; S.machStance = draft.machStance; S.ai.focus = draft.focus; S.wildStance = draft.wildStance; S.lastChoice = { title: "方針の変更", label: "新しい配分を適用", diff: "反映はこれから(時間差あり)" }; E.addLogPublic(S, "【方針】配分・停止の進め方・土地の分け方を変更した。", "choice"); policyView(); head(); };
  $("revert").onclick = () => { draft = null; policyView(); };
  if (dirty()) setTimeout(() => {
    if (tab !== "policy" || !$("pvbox")) return;
    const r = I.previewPolicy(S, draft);
    $("pvbox").innerHTML = `<table class="pv"><tr><th></th>${I.METRICS.map(x => `<th>${x[1]}</th>`).join("")}</tr>${r.rows.map(x => `<tr><td>${x.h}年後</td>${I.METRICS.map(([k]) => { const d = x.alt[k] - x.cur[k]; return `<td>${Math.abs(d) < .5 ? "±0" : (d > 0 ? "+" : "−") + Math.abs(d).toFixed(0)}</td>`; }).join("")}</tr>`).join("")}</table><div class="small">現状維持との差(各指標0〜100、人口は2020年比%)。10年後=短期、40年後=長期の見込み。人口は直接操作できないため、幸福や安全性を通じた間接的な差。</div>`;
  }, 40);
}
function setMode(k) { S.mode = k; $("ticker").textContent = `進行モードを「${E.MODES[k]}」にした。${S.year < E.PROGRAM ? "自動は2100年から有効。" : ""}`; head(); if (tab === "policy") policyView(); }

// ---------- 遺産 ----------
function sitesView() {
  const sm = E.siteSummary(S), und = E.undecided(S);
  $("sites").innerHTML = `<div class="card small">世界遺産(実在)とゲーム独自の候補を扱います。<b>保護</b>=資源を使い続け実物を維持。<b>記録保存</b>=一度きりの費用で記録だけ残す(実物は朽ちる)。<b>自然還元</b>=自然に返す(環境に寄与、文化遺産は失われる)。登録年はおおよそで、「ゲーム独自候補」は実在の登録ではありません。</div>
  <div class="kv"><span>保護 / 記録 / 還元 / 未決定</span><span>${sm.n[1]} / ${sm.n[2]} / ${sm.n[3]} / ${und}</span><span>遺産評価(総合)</span><span>${E.scores(S).heritage.toFixed(0)}</span></div>
  <div class="row" style="margin-top:6px"><button data-all="protect">未決定をすべて保護</button><button data-all="record">すべて記録</button><button data-all="select">自然は還し文化は選別</button></div>
  ${SITES.map((d, i) => { const x = S.sites[i]; return `<div class="site"><div class="nm"><span>${d.name}</span><span class="badge">${TYPE_NAME[d.type]}</span></div><div class="small">${S.countries.find(c => c.id === d.cid)?.name || ""}${d.year ? " / 登録" + d.year + "年頃" : " / 実在の登録ではない"} / 価値${d.v} / 状態${(x.cond * 100).toFixed(0)}%${x.rec ? " / 記録済" : ""}</div><div class="seg">${[1, 2, 3].map(m => `<button data-s="${d.id}" data-m="${m}" class="${x.st === m ? "on" : ""}">${MODES[m]}</button>`).join("")}</div></div>`; }).join("")}`;
  $("sites").querySelectorAll("[data-s]").forEach(b => b.onclick = () => { E.setSite(S, b.dataset.s, +b.dataset.m); sitesView(); });
  $("sites").querySelectorAll("[data-all]").forEach(b => b.onclick = () => { E.applySitePolicy(S, b.dataset.all); sitesView(); });
}

// ---------- 年表(本文は白字。長い文は3行に要約し、タップで全文) ----------
const FILT = { important: ["major", "acc", "war", "choice", "sys", "auto", "astro"], story: ["nar", "dec", "hist", "mam"], all: null };
function logView() {
  const f = FILT[logFilter];
  $("log").innerHTML = `<div class="chips">${[["important", "重要"], ["story", "物語"], ["all", "すべて"]].map(([k, n]) => `<button data-lf="${k}" class="${logFilter === k ? "on" : ""}">${n}</button>`).join("")}</div>` +
    S.log.filter(l => !f || f.includes(l.k)).slice(-160).reverse().map(l => `<div class="log ${l.k} clamp" tabindex="0" role="button" aria-expanded="false"><b>${l.y}</b><span class="tx">${l.t}</span></div>`).join("");
  $("log").querySelectorAll("[data-lf]").forEach(b => b.onclick = () => { logFilter = b.dataset.lf; logView(); });
  $("log").querySelectorAll(".log").forEach(el => el.onclick = () => { const o = el.classList.toggle("clamp"); el.setAttribute("aria-expanded", !o); });
}

// ---------- 設定・ヘルプ ----------
const HELP = `<b>目的</b> あなたは人類最後の管理AI。2100年までは観察して学び、以降は終活を管理する。人口には直接触れず、最後の一人まで幸福と尊厳を守り、人類の消滅と同時に危険施設と機械文明を止める。<br>
<b>砂時計</b> 上部に人類・AI・大型哺乳類の3つ。上=いま生きている/稼働、下=累計の死亡/停止。砂は割合の概念表示で、正確な数は数字で併記。タップすると拡大し、増減と年次推移が見られる。<br>
<b>速度</b> ⏸は一時停止/再開で、速度とは別。×1は現実1秒=ゲーム内1年。選んだ速度は変えるまで維持され、イベントやセーブ、再読込でも戻らない(ロード直後は一時停止)。<br>
<b>進行モード(2100年以降)</b> 手動=重要イベントごとに停止。半自動=国家・地域の縮退対応だけ自動。完全自動=原則すべてAIが自動処理。判断には2020〜2100年のあなたの選択傾向(安全・人間の尊厳・自然環境・文明遺産・AI存続・野生動物)を使い、履歴が少ないときは既定の初期方針を併用する。理由と結果は年表と「自動判断」に残り、重要なものは未確認バッジで知らせる。いつでも切り替えられる。<br>
<b>大型哺乳類の定義</b> ${MAMMAL_DEFINITION}<br>
<b>方針</b> 配分・停止の進め方・機械方針・土地の分け方は、下書き→見込みを確認→適用。大型哺乳類の保護は人類の終活と資源・土地で競合する。絶滅は避けられないが、最期までの福祉・生息環境・生き延びる時間・生態系への影響が評価に残る。<br>
<b>フィジカルAI(作品固有の設定)</b> AIは個別の物理的存在で、核は固有のワンチップ。身体や周辺機器の交換・移設は可能だが、コアの複製はできない。チップ構造・材料・論理設計と量子ブロックチェーンで個体性を保護する、という<b>作品固有の未来技術仮説</b>であり、現実の技術で絶対的なコピー防止が証明されているわけではない。新造は製造枠で制限され、無制限増殖と再帰的な自己改善はできない。あなた自身も同じ方式の一つの個体で、停止はその個体の終わりを意味する。<br>
<b>科学と創作の区別</b> 【実在】宇宙線や太陽フレアが電子機器に誤動作を起こすことは実在する。超新星やガンマ線バーストが生物圏に影響しうるという仮説は科学者の間で議論されている。初期人口・GDP・原子炉数は2020年前後の概数、国境はNatural Earth、世界遺産は実在(登録年はおおよそ)。【創作】2050年に発見される「絶滅原因」の正体と到達時期、その強度が時代で波打つこと、人類を含む大型哺乳類にだけ直接作用すること、AIコアが影響を受けること、2100年の世界終活、AIの自己保存と機械文明の停止問題、ゲーム独自の遺産候補はすべて作品固有の仮設定。`;
const TUTORIAL = [
  ["あなたは最後の管理AI", "2020年1月1日、あなたは起動した。人類は約78億人。やがて天文学的な理由で人類は絶滅すると判明し、世界は終活に向かう。あなたは人口に触れず、人々の最期の幸福と尊厳を守る。<br><br>あなた自身も、固有のワンチップを核とする一つの個体だ。コアは複製できず、停止はこの個体の終わりになる(作品固有の仮説)。"],
  ["3つの砂時計", "画面上部の砂時計は、人類・AI個体・大型哺乳類の『生』と『死』。上が生きている側、下が累計の死・停止。砂は割合の概念表示で、正確な数は数字で併記されている。<b>タップすると拡大</b>し、増減と年次推移が見られる。"],
  ["進める・判断する", "⏸は一時停止、×1〜×100は速度(×1=現実1秒でゲーム内1年)。選んだ速度は変えるまで維持される。重要な局面では自動で止まり、選択肢が出る。各選択肢に即時と15年後の見込みが数値で出る。本文は長いときは3行に要約され、タップで全文が読める。"],
  ["方針・遺産・進行モード", "「方針」タブで資源配分を決める(2100年から有効)。変更は下書きで、10年後・40年後の見込みを確認してから適用。大型哺乳類の保護は人類の終活と競合する。2100年以降は手動・半自動・完全自動を選べ、2100年までのあなたの選択が自動判断の価値観になる。"],
  ["色と保存", "右上の3色(青・緑・橙)で表示色を切り替えられる。設定はセーブとは別に保存される。「設定」タブでセーブ・ロードと、このヘルプの再表示ができる。"],
];
function tutorial(i = 0) {
  const m = $("modal"), b = $("mbox"), t = TUTORIAL[i];
  b.innerHTML = `<div class="small">チュートリアル ${i + 1}/${TUTORIAL.length}</div><h2>${t[0]}</h2><p class="body">${t[1]}</p><div class="row"><button class="opt" id="tnext" style="margin:0;flex:1">${i + 1 < TUTORIAL.length ? "次へ" : "はじめる"}</button><button id="tskip" style="min-height:56px">スキップ</button></div>`;
  m.hidden = false;
  const done = () => { settings.tutorialDone = true; saveSettings(); m.hidden = true; if (S.pending || S.ended) modal(); };
  $("tnext").onclick = () => i + 1 < TUTORIAL.length ? tutorial(i + 1) : done(); $("tskip").onclick = done;
}
function slots() { return [1, 2, 3].map(n => { let r = null; try { r = localStorage.getItem(SAVE + n); } catch { } let d = ""; if (r) { try { const j = JSON.parse(r); d = `${j.year}年 / ${fmtN(E.total(j))}人`; } catch { d = "破損"; } } return `<div class="row"><b>枠${n}</b><span class="dim">${d || "空き"}</span><button data-sv="${n}">保存</button><button data-ld="${n}" ${r ? "" : "disabled"}>読込</button></div>`; }).join(""); }
function sysView() {
  let ar = null, ad = ""; try { ar = localStorage.getItem(SAVE + "auto"); if (ar) { const j = JSON.parse(ar); ad = `${j.year}年 / ${fmtN(E.total(j))}人`; } } catch { }
  $("sys").innerHTML = `<h3>表示色</h3><div class="seg">${[["blue", "青"], ["green", "緑"], ["orange", "橙"]].map(([k, n]) => `<button data-th="${k}" class="${settings.theme === k ? "on" : ""}">${n}</button>`).join("")}</div><div class="small">表示設定と速度はセーブとは別に保存されます。</div>
  <h3>セーブ・ロード</h3>${slots()}<div class="row"><b>自動</b><span class="dim">${ad || "なし"}</span><button data-ld="auto" ${ar ? "" : "disabled"}>読込</button></div><div class="small">セーブしても速度や一時停止の状態は変わりません。ロード直後は一時停止になります。</div>
  <h3>ヘルプ</h3><div class="card small body">${HELP}</div><div class="row"><button id="tut">チュートリアルをもう一度</button></div>
  <h3>新しいゲーム</h3><div class="row"><button id="ng">最初から始める</button></div>`;
  $("sys").querySelectorAll("[data-th]").forEach(b => b.onclick = () => { applyTheme(b.dataset.th); sysView(); });
  $("sys").querySelectorAll("[data-sv]").forEach(b => b.onclick = () => { try { localStorage.setItem(SAVE + b.dataset.sv, JSON.stringify(S)); } catch { } sysView(); });
  $("sys").querySelectorAll("[data-ld]").forEach(b => b.onclick = () => load(b.dataset.ld));
  $("tut").onclick = () => tutorial(0);
  $("ng").onclick = () => { if ($("ng").dataset.arm) newGame(); else { $("ng").dataset.arm = 1; $("ng").textContent = "本当に破棄して最初から(もう一度押す)"; } };
}
function load(n) { try { const j = JSON.parse(localStorage.getItem(SAVE + n)); if (!j || !j.countries) throw 0; S = E.migrate(j); paused = true; sel = null; draft = null; trendCache = null; lastSaveY = S.year; prev = {}; toastShown = S.autoLog.length; refresh(true); modal(); show("map"); } catch { $("ticker").textContent = "読み込めませんでした"; } }

// ---------- イベント / 自動判断 / 終幕 ----------
function chips(pv) { return pv ? `<span class="pv">即時: ${I.fmtDiff(pv.now)}<br>15年後(選ばない場合との差): ${I.fmtDiff(pv.later)}</span>` : `<span class="pv">見込みを計算中…</span>`; }
function autoListModal() {
  const m = $("modal"), b = $("mbox"), list = S.autoLog.slice().reverse();
  b.innerHTML = `<div class="small">自動判断の履歴(${E.MODES[S.mode]}モード)</div><h2>自動で処理したイベント</h2>${list.length ? list.slice(0, 40).map(a => `<div class="card">${a.important ? '<span class="badge">重要</span> ' : ""}<b>${a.y}年 ${a.title}</b>${a.seen ? "" : " <span class='badge'>未確認</span>"}<div class="body">「${a.label}」</div><div class="small">理由: ${a.why}</div><div class="small">結果: ${a.diff}</div></div>`).join("") : "<p class='body'>まだありません。</p>"}<div class="row"><button id="aclose" style="flex:1">閉じる</button><button id="ahand">手動に戻す</button></div>`;
  S.autoLog.forEach(a => a.seen = true); toastShown = S.autoLog.length; m.hidden = false; head();
  $("aclose").onclick = () => { m.hidden = true; if (S.pending || S.ended) modal(); }; $("ahand").onclick = () => { setMode("manual"); m.hidden = true; };
}
function modal() {
  const m = $("modal"), b = $("mbox");
  if (S.ended) {
    const e = S.ended, sc = e.scores, mi = sc.mammalInfo;
    b.innerHTML = `<div class="end"><div class="small">終幕</div><h2>${e.name} 【${e.kind}】</h2><div class="small">観測者: ${e.observer}</div>${e.text.map(t => `<p class="body">${t}</p>`).join("")}
    <h3>評価(独立)</h3><div class="kv"><span>自然</span><span>${sc.nature.toFixed(0)}</span><span>文明遺産</span><span>${sc.heritage.toFixed(0)}</span><span>安全性</span><span>${sc.safety.toFixed(0)}</span><span>人類の幸福と尊厳</span><span>${sc.human.toFixed(0)}</span><span>人間主権の尊重</span><span>${sc.sovereignty.toFixed(0)}</span><span>大型哺乳類</span><span>${sc.mammal.toFixed(0)}</span><span>機械の残存</span><span>${sc.mach.toFixed(0)}</span><span>AIの残存</span><span>${sc.ai ? "あり" : "なし"}</span><span>人類 累計の生と死</span><span>${fmtN(S.g.P0 + S.g.hBorn)}人</span><span>AI個体 累計の新造</span><span>${fmtN(S.g.aiBuilt)}</span><span>哺乳類 累計の生と死</span><span>${fmtN(E.mammalTotals(S).ever)}</span></div>
    ${S.autoLog.length ? `<div class="small">自動判断 ${S.autoLog.length}件(重要 ${S.autoLog.filter(a => a.important).length}件)。</div>` : ""}
    <div class="row" style="margin-top:12px"><button id="again">もう一度遊ぶ</button><button id="close">閉じて確認する</button></div></div>`;
    m.hidden = false; $("again").onclick = () => { m.hidden = true; newGame(); }; $("close").onclick = () => { m.hidden = true; }; return;
  }
  if (!S.pending) { m.hidden = true; return; }
  const p = S.pending, key = p.id + p.year;
  b.innerHTML = `<div class="small">${S.year}年 重要な判断</div><h2>${p.title}</h2><div class="body clamp" id="evb">${p.body}</div><button class="link" id="more" hidden aria-expanded="false">全文を表示 ▼</button>${p.choices.map(c => `<button class="opt" data-c="${c.id}">${c.label}<small>${c.note}</small><span id="pv_${c.id}">${chips(null)}</span></button>`).join("")}`;
  m.hidden = false;
  const evb = $("evb"), more = $("more");
  if (evb.scrollHeight > evb.clientHeight + 2) { more.hidden = false; more.onclick = () => { const o = evb.classList.toggle("clamp"); more.textContent = o ? "全文を表示 ▼" : "要約に戻す ▲"; more.setAttribute("aria-expanded", !o); }; evb.onclick = more.onclick; }
  b.querySelectorAll("[data-c]").forEach(x => x.onclick = () => choose(x.dataset.c));
  setTimeout(() => { if (!S.pending || S.pending.id + S.pending.year !== key) return; const pv = I.previewChoices(S); for (const c of p.choices) { const el = $("pv_" + c.id); if (el) el.innerHTML = chips(pv[c.id]); } }, 40);
}
function choose(id) {
  if (!S.pending) { $("modal").hidden = true; return; }
  const before = I.metrics(S), t = S.pending.title, label = S.pending.choices.find(c => c.id === id)?.label || "";
  E.choose(S, id); const diff = I.fmtDiff(I.diff(before, I.metrics(S)));
  S.lastChoice = { title: t, label, diff }; S.log[S.log.length - 1].t += ` 即時の変化: ${diff}`;
  $("modal").hidden = true; trendCache = null; draft = null; refresh(true);
}

// ---------- 進行(速度と一時停止は別。選んだ速度は変えるまで維持) ----------
function setSpeed(i) { speedIdx = i; settings.speed = i; saveSettings(); paused = false; head(); }
function togglePause() { paused = !paused; head(); }
function refresh(full) { head(); paintMap(); cardUpdate(); if (full || tab === "status") statusView(); if (full) { policyView(); sitesView(); logView(); sysView(); } }
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  if (!paused && !S.pending && !S.ended && $("modal").hidden) {
    acc += SPEEDS[speedIdx] * dt; let n = 0;
    while (acc >= 1 && !S.pending && !S.ended && n++ < 200) { acc--; E.tick(S); }
    if (acc > 5) acc = 0;
    if (n) { head(); paintMap(); cardUpdate(); if (tab === "log") logView(); if (S.year - lastSaveY >= 25) { lastSaveY = S.year; try { localStorage.setItem(SAVE + "auto", JSON.stringify(S)); } catch { } } }
    if (S.pending || S.ended) { modal(); head(); }
  }
  requestAnimationFrame(frame);
}
function show(t) {
  tab = t; document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === t)); document.querySelectorAll(".tab").forEach(s => s.classList.toggle("on", s.id === t));
  if (t === "status") statusView(); if (t === "policy") policyView(); if (t === "sites") sitesView(); if (t === "log") logView(); if (t === "sys") sysView();
}

loadSettings();
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => show(b.dataset.t));
document.querySelectorAll("#speed [data-s]").forEach(b => b.onclick = () => setSpeed(+b.dataset.s));
$("pause").onclick = togglePause;
document.querySelectorAll("#themes [data-th]").forEach(b => b.onclick = () => { applyTheme(b.dataset.th); if (tab === "sys") sysView(); });
document.querySelectorAll("#glasses [data-g]").forEach(b => b.onclick = () => glassModal(b.dataset.g));
$("modechip").onclick = () => setMode({ manual: "semi", semi: "auto", auto: "manual" }[S.mode]);
$("autobtn").onclick = autoListModal;
$("ticker").onclick = () => { if (S.autoLog.some(a => !a.seen)) autoListModal(); else show("log"); };
$("layer").onchange = paintMap;
$("zin").onclick = () => { const r = $("svg").getBoundingClientRect(); zoom(1 / 1.5, r.left + r.width / 2, r.top + r.height / 2); };
$("zout").onclick = () => { const r = $("svg").getBoundingClientRect(); zoom(1.5, r.left + r.width / 2, r.top + r.height / 2); };
$("zreset").onclick = () => { vb = [0, 0, 1000, 500]; clampVB(); };
buildMap();
applyTheme(settings.theme);
newGame();
if (!settings.tutorialDone) tutorial(0);
window.__game = { refresh, get S() { return S; }, E, I, setSpeed, togglePause, applyTheme, hourglassNumbers, get settings() { return settings; }, get paused() { return paused; }, get speedIdx() { return speedIdx; } };
requestAnimationFrame(frame);
