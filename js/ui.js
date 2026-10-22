import * as E from "./engine.js";
import * as I from "./insight.js";
import { MAP } from "./mapdata.js";
import { FACTYPES } from "./data.js";
import { SITES, TYPE_NAME, MODES } from "./heritage.js";
import { MAMMAL_DEFINITION, STANCE_NAME, GROUPS } from "./life.js";
import * as P from "./picto.js";
import * as SV from "./saves.js";
import * as After from "./after.js";
import { Session, OBSERVE_SECS, STYLE_NAMES, SLOW_YPS } from "./flow.js";
import { SandGlass, chooseScale, grainsFor, FIXED, FIXED_NAMES, fmtScale, fmtShort, loop as sandLoop, setQuality, kick as sandKick } from "./sand.js";

const $ = (id) => document.getElementById(id);
const SAVE = "weol.save.", SETKEY = "weol.settings", SPEEDS = [0, 1, 4, 20, 100];
let S = null, paused = false, speedIdx = 1, sel = null, tab = "map", acc = 0, last = performance.now(), lastSaveY = 0, vb = [0, 0, 1000, 500], pathEls = {};
let session = null, shownKey = null, obsNote = null;
let settings = { theme: "blue", tutorialDone: false, introSeen: false, picto: "std", speed: 1, mode: "manual", observe: { sec: 5, style: "stop" }, scale: { h: { auto: true, idx: 1 }, a: { auto: true, idx: 1 }, m: { auto: true, idx: 1 } } }, rgb = "77,166,255", logFilter = "important", draft = null, trendCache = null, prev = {};
let toastShown = 0;

// ---------- 設定(セーブとは別に保存) ----------
function loadSettings() { try { const j = JSON.parse(localStorage.getItem(SETKEY)); if (j) settings = { ...settings, ...j, scale: { ...settings.scale, ...(j.scale || {}) }, observe: { ...settings.observe, ...(j.observe || {}) } }; } catch { } if (!OBSERVE_SECS.includes(settings.observe.sec)) settings.observe.sec = 5; if (!STYLE_NAMES[settings.observe.style]) settings.observe.style = "stop"; if (!E.MODES[settings.mode]) settings.mode = "manual"; if (!(settings.speed >= 1 && settings.speed <= 4)) settings.speed = 1; speedIdx = settings.speed; }
function saveSettings() { try { localStorage.setItem(SETKEY, JSON.stringify(settings)); } catch { } }
function applyTheme(t) {
  if (!["blue", "green", "orange"].includes(t)) t = "blue";
  settings.theme = t; document.documentElement.dataset.theme = t;
  rgb = getComputedStyle(document.documentElement).getPropertyValue("--rgb").trim();
  document.querySelectorAll("[data-th]").forEach(b => b.classList.toggle("on", b.dataset.th === t));
  saveSettings(); setSandColor(); if (S) { paintMap(); head(); }
}
function resetEarthUI() { if (!afterMode) return; afterMode = false; afterSpeed = 0; $("layer").innerHTML = LAYERS_NORMAL; $("layer").value = "pop"; $("mainstat").hidden = false; $("afterbox").hidden = true; }
function newGame(seed) { resetEarthUI(); S = E.newGame(seed || (Date.now() % 100000) + 1); S.mode = settings.mode; session.bind(S); shownKey = null; obsNote = null; paused = false; sel = null; draft = null; trendCache = null; lastSaveY = S.year; prev = {}; toastShown = 0; compactK = {}; compactPrev = {}; refresh(true); snapCompact(); }
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
function clampVB() { vb[2] = Math.min(1000, Math.max(60, vb[2])); vb[3] = vb[2] / 2; vb[0] = Math.max(0, Math.min(1000 - vb[2], vb[0])); vb[1] = Math.max(0, Math.min(500 - vb[3], vb[1])); $("svg").setAttribute("viewBox", vb.join(" ")); if ($("pmarks")) schedMarks(); }
function zoom(f, cx, cy) { const r = $("svg").getBoundingClientRect(); const px = vb[0] + (cx - r.left) / r.width * vb[2], py = vb[1] + (cy - r.top) / r.height * vb[3]; const w = vb[2] * f; vb[0] = px - (px - vb[0]) * w / vb[2]; vb[1] = py - (py - vb[1]) * w / vb[2]; vb[2] = w; clampVB(); }
function colorFor(c) {
  const A = (a) => `rgba(${rgb},${Math.max(.04, Math.min(1, a)).toFixed(2)})`;
  const L = $("layer").value;
  if (afterMode && S.after && L.startsWith("a_")) { const i2 = idx(c.id), a = S.after; return A(.06 + .9 * ({ a_city: a.city, a_veg: a.veg, a_pl: a.pl }[L][i2] / 100)); }
  if (c.extinct) return A(.04);
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
  const iss = P.countryIssues(S, i), pic = iss.length ? `<div class="pcard">${iss.map(x => `<span class="pcr lv-${x.level}">${P.icon(x.k, x.level, 20)}<span>${x.label}:${P.LEVEL_NAME[x.level]} ${x.txt}</span></span>`).join("")}</div>` : '<div class="small">この国に目立った危険はありません</div>';
  el.innerHTML = `<b>${c.name}</b>${c.extinct ? " (無人)" : ""}<div class="kv"><span>人口</span><span>${fmtN(E.cpop(c))}人</span><span>幸福度</span><span>${(c.happy * 100).toFixed(0)}</span><span>希望(出生率の源)</span><span>${(c.hope ?? 1).toFixed(2)}</span><span>社会不安</span><span>${(c.unrest * 100).toFixed(0)}</span><span>終活への合意</span><span>${(c.consent * 100).toFixed(0)}%</span><span>認識(絶滅)</span><span>${(c.aware * 100).toFixed(0)}%</span><span>労働力維持</span><span>${(c.m * 100).toFixed(0)}%</span><span>天文現象の遮蔽の弱さ(創作)</span><span>${((c.ex ?? 1)).toFixed(2)}</span>${cnt}</div>${pic}`;
}

// ---------- 砂時計(1粒ずつ描く。表示専用で、数値の正本は engine.js。粒数には上限があり、全個体は描かない) ----------
export function hourglassNumbers(s) { // ゲーム内数値と表示数値を一致させる唯一の窓口
  const alive = Math.round(E.total(s)), ever = Math.round(s.g.P0 + s.g.hBorn), mt = E.mammalTotals(s), mAlive = Math.round(mt.alive), mEver = Math.round(mt.ever);
  return { hAlive: alive, hDead: ever - alive, hEver: ever, aAlive: s.g.aiActive, aDead: s.g.aiStopped, aEver: s.g.aiBuilt, mAlive, mDead: mEver - mAlive, mEver };
}
const KINDS = ["h", "a", "m"], UNIT = { h: "人", a: "体", m: "頭" };
const pick = (n, k) => k === "h" ? [n.hAlive, n.hDead, n.hEver] : k === "a" ? [n.aAlive, n.aDead, n.aEver] : [n.mAlive, n.mDead, n.mEver];
let compact = {}, compactK = {}, compactPrev = {}, bigPrev = null, big = null, bigKind = "h", bigK = 0, bigGrains = null;
function initCompact() {
  for (const k of KINDS) { const cv = $("g" + k); compact[k] = new SandGlass(cv, { compact: true, rgb }); compact[k].setSize(28, 40); }
}
function scaleCfg(k) { return settings.scale[k]; }
function hourglasses() {
  const n = hourglassNumbers(S);
  for (const k of KINDS) {
    const [alive, dead, ever] = pick(n, k), v = compact[k];
    $(k + "_alive").textContent = fmtShort(alive); $(k + "_dead").textContent = fmtShort(dead);
    $(k + "_alive").dataset.v = alive; $(k + "_dead").dataset.v = dead;
    const K = compactK[k] = chooseScale(k, "auto", 1, alive, v.model.capTop, compactK[k]); // 小型表示は自動縮尺(減るほど細かくなり、下の山は消えない)
    const g = grainsFor(alive, dead, K), pv = compactPrev[k]; v.setTargets(g.top, g.bot);
    if (pv && pv.K === K) v.addFlow(Math.max(0, dead - pv.dead) / K, Math.max(0, ever - pv.ever) / K); // 出来事=死亡は上から落ち、出生は上へ加わる
    compactPrev[k] = { dead, ever, K };
    $(k + "_scale").textContent = "1粒=" + fmtScale(K);
  }
  if (big) bigSync(false);
}
function bigScale(alive) { const c = scaleCfg(bigKind); const K = chooseScale(bigKind, c.auto ? "auto" : "fixed", c.idx, alive, big.model.capTop, c.auto ? bigK : 0); bigK = K; return K; }
function bigSync(snap) { // 拡大表示に最新の数値を渡す。縮尺は粒の表現だけを変え、数値には影響しない
  const n = hourglassNumbers(S), [alive, dead, ever] = pick(n, bigKind), r = S.g.rate || {}, c = scaleCfg(bigKind), prevK = bigK, K = bigScale(alive);
  const g = grainsFor(alive, dead, K); big.setTargets(g.top, g.bot);
  if (snap || (prevK && prevK !== K)) { big.snap(); }
  else if (bigPrev && bigPrev.K === K) big.addFlow(Math.max(0, dead - bigPrev.dead) / K, Math.max(0, ever - bigPrev.ever) / K);
  bigPrev = { dead, ever, K };
  bigGrains = { K, top: g.top, bot: g.bot, topHit: big.model.topHit, botHit: big.model.botHit };
  const inc = { h: r.hb, a: r.ab, m: r.mb }[bigKind] || 0, dec = { h: r.hd, a: r.as, m: r.md }[bigKind] || 0, u = UNIT[bigKind];
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  set("bg_up", fmtN(alive)); set("bg_down", fmtN(dead)); set("bg_ever", fmtN(ever)); set("bg_inc", "+" + fmtN(inc)); set("bg_dec", "−" + fmtN(dec));
  const lg = $("slegend");
  if (lg) lg.innerHTML = `<b>${c.auto ? "自動縮尺" : "固定縮尺"}: 1粒 = ${fmtScale(K)}${u}</b>。上(塗りつぶし)=生存 約${fmtN(g.top)}粒、下(中空)=累計 約${fmtN(g.bot)}粒${big.model.topHit || big.model.botHit ? `。<b>表示上限(${fmtN(Math.max(big.model.capTop, big.model.capBot))}粒)に達したため一部を省略</b>` : ""}。生存者がいる間は最低1粒を表示。粒は視覚表現で、数値は変わりません。${prevK && prevK !== K ? `縮尺が1粒=${fmtScale(prevK)}→${fmtScale(K)}に変わりました(実数は同じ)。` : ""}`;
  for (const b of document.querySelectorAll("#sfix [data-fx]")) b.classList.toggle("on", !c.auto && +b.dataset.fx === c.idx);
  for (const b of document.querySelectorAll("#smode [data-sm]")) b.classList.toggle("on", (b.dataset.sm === "auto") === c.auto);
}
function closeBig() { if (big) { big.dispose(); big = null; } window.removeEventListener("resize", onResize); }
function onResize() { if (!big) return; const cv = $("bigcv"); if (!cv) return; const w = Math.max(200, Math.floor(cv.parentElement.clientWidth)); big.setSize(w, bigHeight()); bigSync(true); }
const bigHeight = () => Math.round(Math.max(260, Math.min(470, window.innerHeight * .52)));
const GLASS_INFO = {
  h: { name: "人類", up: "生存者", down: "累計死亡者", add: "累計の誕生(初期の78億人を除く)", note: "出生は上に加わり、死亡は下へ落ちる。事故・紛争・天文現象の影響も死亡に数える。", ser: "h" },
  a: { name: "AI個体", up: "稼働個体", down: "累計の停止・廃棄", add: "累計の新造(初期を含む)", note: "AIは固有のワンチップを核とする個体。新造は製造枠で制限される。休眠・再稼働や身体の移設では数えない。故障もコアの喪失として下に入る。", ser: "a" },
  m: { name: "大型哺乳類", up: "生存個体", down: "累計死亡個体", add: "累計の誕生(初期の個体を除く)", note: "人類以外の大型哺乳類5群の合計(家畜・伴侶動物を含む)。出生は上に、死亡は下へ落ちる。", ser: "m" },
};
function chart(series, W = 300, H = 90) {
  if (!series || series.length < 2) return `<div class="small">年次推移は5年ごとに記録されます。もう少し進めると表示されます。</div>`;
  const x0 = series[0][0], x1 = series[series.length - 1][0], m1 = Math.max(1, ...series.map(r => r[1])), m2 = Math.max(1, ...series.map(r => r[2]));
  const px = (y) => 4 + (W - 8) * (y - x0) / Math.max(1, x1 - x0), py = (v, m) => H - 4 - (H - 10) * v / m;
  const pl = (k, m) => series.map(r => `${px(r[0]).toFixed(1)},${py(r[k], m).toFixed(1)}`).join(" ");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="年次推移"><line class="ax" x1="4" y1="${H - 4}" x2="${W - 4}" y2="${H - 4}"/><polyline class="l2" points="${pl(2, m2)}"/><polyline class="l1" points="${pl(1, m1)}"/></svg><div class="small">${x0}年〜${x1}年(5年ごと)。実線=生存/稼働(縦軸の最大 ${fmtN(m1)})、破線=累計の死亡/停止(最大 ${fmtN(m2)})。2本は別の縮尺。</div>`;
}
function glassModal(which = "h") {
  closeBig(); const m = $("modal"), b = $("mbox"), G = GLASS_INFO[which]; bigKind = which; bigK = 0; bigPrev = null;
  const extra = which === "a" ? `<span>うち故障による喪失(累計)</span><span id="bg_fail">${fmtN(S.g.aiFailed)}</span>` : "";
  const groups = which === "m" ? `<h3>種群別</h3><table class="pv"><tr><th>種群</th><th>個体数</th><th>2020年比</th><th>状態</th></tr>${GROUPS.map((G2, i) => { const x = S.mam[i]; return `<tr><td>${G2.name}</td><td>${fmtN(x.n)}</td><td>${(x.n / G2.n0 * 100).toFixed(0)}%</td><td>${x.n <= 0 ? "絶滅" + (x.ext ? " " + x.ext : "") : G2.wild ? "福祉" + (x.w * 100).toFixed(0) : "人類依存"}</td></tr>`; }).join("")}</table>` : "";
  b.classList.add("wide");
  b.innerHTML = `<div class="seg" id="gtabs">${[["h", "人類"], ["a", "AI"], ["m", "哺乳類"]].map(([k, nm]) => `<button data-gt="${k}" class="${which === k ? "on" : ""}">${nm}</button>`).join("")}</div>
  <div class="scalebar"><div class="seg" id="smode"><button data-sm="auto">自動縮尺</button><button data-sm="fixed">固定縮尺</button></div><div class="seg" id="sfix">${FIXED[which].map((k, i) => `<button data-fx="${i}">${FIXED_NAMES[i]}<br><small>1粒=${fmtScale(k)}</small></button>`).join("")}</div></div>
  <div class="small" id="slegend"></div>
  <div class="cvwrap"><canvas id="bigcv" aria-label="${G.name}の砂時計(粒の動き)"></canvas></div>
  <div class="kv bgkv"><span>${G.up}</span><span id="bg_up"></span><span>${G.down}</span><span id="bg_down"></span><span>${G.add}</span><span id="bg_ever"></span><span>今年の増加(出生・新造)</span><span id="bg_inc"></span><span>今年の減少(死亡・停止)</span><span id="bg_dec"></span>${extra}</div>
  <div class="small">${G.note} 粒が落ちる速さは表示専用で、ゲームの時間とは別です。</div>
  <h3>年次推移</h3><div id="bgchart">${chart(S.series[G.ser])}</div>${groups}
  <div class="row" style="margin-top:10px"><button id="gclose" style="flex:1">閉じる</button></div>`;
  m.hidden = false;
  const cv = $("bigcv"); big = new SandGlass(cv, { compact: false, rgb }); big.setSize(Math.max(200, Math.floor(cv.parentElement.clientWidth)), bigHeight());
  cv.style.width = big.W + "px"; cv.style.height = big.H + "px";
  bigSync(true); window.addEventListener("resize", onResize);
  b.querySelectorAll("[data-gt]").forEach(x => x.onclick = () => glassModal(x.dataset.gt));
  b.querySelectorAll("[data-sm]").forEach(x => x.onclick = () => { scaleCfg(which).auto = x.dataset.sm === "auto"; bigK = 0; saveSettings(); bigSync(true); });
  b.querySelectorAll("[data-fx]").forEach(x => x.onclick = () => { const c = scaleCfg(which); c.auto = false; c.idx = +x.dataset.fx; saveSettings(); bigSync(true); });
  $("gclose").onclick = () => { closeBig(); b.classList.remove("wide"); m.hidden = true; if (S.pending || S.ended) modal(); };
}
function snapCompact() { for (const k of KINDS) compact[k] && compact[k].snap(); compactPrev = {}; }
function setSandColor() { for (const k of KINDS) compact[k] && compact[k].setColor(rgb); if (big) big.setColor(rgb); }

// ---------- ヘッダ ----------
function phaseName() { const y = S.year; return y < E.DISCOVERY ? "観察期" : y < E.CERTAIN ? "発見後" : y < E.PROGRAM ? "確定後" : S.g.extinctYear !== undefined ? "消滅後" : "終活期"; }
function speedText() {
  const mult = SPEEDS[speedIdx], toGoal = S.year < E.PROGRAM ? `2100年まで約${Math.max(1, Math.round((E.PROGRAM - S.year) / mult))}秒` : `100年で約${Math.round(100 / mult)}秒`;
  const ob = session.observing ? `観察中(${settings.observe.style === "stop" ? "ゲーム時間停止" : "低速"})。終了後に ×${mult} へ戻る。` : "";
  return `${ob}${paused ? "一時停止中(速度 ×" + mult + " を維持)" : "×" + mult}: 現実1秒=ゲーム内${mult}年。×1は1年=1秒。${toGoal}`;
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
  renderObs(); lockTabs(); mainStat();
  const l = S.log[S.log.length - 1]; $("ticker").textContent = imp.length ? `⚠ 重要な自動判断: ${imp[imp.length - 1].title}→「${imp[imp.length - 1].label}」(タップで確認)` : l ? `${l.y} ${l.t}` : "";
}
const bar = (v) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div>`;


// ---------- メイン画面: 世界地図+レーダーチャート / 助走期間の制限 ----------
let mainKey = "", pictoDetail = null, cent = {}, resTimer = 0;
function lockTabs() {
  const pre = S.year < E.PROGRAM; for (const t of ["policy", "sites"]) { const b = document.querySelector(`#tabs [data-t=${t}]`); if (b) b.hidden = pre; }
  if (pre && (tab === "policy" || tab === "sites")) show("map");
  const pl = $("preludeline"); if (pl) { pl.hidden = !pre; if (pre) { const ids = PRELUDE_IDS().concat(["learn", "infra", "mil", "design"]).filter(id => id !== "modesel"); pl.textContent = `助走期間(〜2100年): 方針の回答 ${ids.filter(id => S.done[id] !== undefined).length}/${ids.length}。価値観は「状況」タブで確認できます。`; } }
}
function mainStat(force) {
  const key = S.year + ":" + (S.pending ? 1 : 0) + ":" + settings.theme + ":" + settings.picto; if (!force && key === mainKey) return; mainKey = key;
  const m = I.metrics(S); $("radarbox").innerHTML = radar(m); pictoBoard();
}

const DENS = [["min", "最小限"], ["std", "標準"], ["full", "詳細"]];
function pictoBoard() {
  const box = $("pictobox"); if (!box) return;
  box.innerHTML = P.boardHTML(S, settings.picto, pictoDetail) + `<div class="seg pseg pdens" role="group" aria-label="ピクトグラムの表示密度">${DENS.map(([k, n]) => `<button data-pd="${k}" class="${settings.picto === k ? "on" : ""}">${n}</button>`).join("")}</div>`;
  box.querySelectorAll("[data-pk]").forEach(b => b.onclick = () => { pictoDetail = b.dataset.pk; pictoBoard(); });
  box.querySelectorAll("[data-pd]").forEach(b => b.onclick = () => setDensity(b.dataset.pd));
  paintMarkers();
}
function setDensity(k) { if (!["min", "std", "full"].includes(k)) k = "std"; settings.picto = k; saveSettings(); mainStat(true); if (tab === "sys") sysView(); }
function centroid(id) {
  let c = cent[id]; if (c && c.w > 0) return c;
  let best = null; for (const p of pathEls[id] || []) { const b = p.getBBox(); if (!best || b.width * b.height > best.width * best.height) best = b; }
  return (cent[id] = best ? { x: best.x + best.width / 2, y: best.y + best.height / 2, w: best.width } : { x: 0, y: 0, w: 0 });
}
let marksQ = false;
function schedMarks() { if (marksQ) return; marksQ = true; requestAnimationFrame(() => { marksQ = false; paintMarkers(); }); }
function markScale() { const r = $("svg").getBoundingClientRect(); return r.width ? 20 * vb[2] / r.width : 20; }
function paintMarkers() {
  const svg = $("svg"); let g = $("pmarks"); if (g) g.remove(); if (tab !== "map" || !S || afterMode) return;
  g = document.createElementNS("http://www.w3.org/2000/svg", "g"); g.id = "pmarks"; const k = markScale();
  for (const m of P.mapMarkers(S, settings.picto)) {
    const c = centroid(m.id); if (!c.w) continue; const t = m.top;
    const h = document.createElement("div"); h.innerHTML = P.icon(t.k, t.level, k); const ic = h.firstChild; ic.setAttribute("x", (c.x - k / 2).toFixed(1)); ic.setAttribute("y", (c.y - k / 2).toFixed(1)); ic.dataset.e = m.id; ic.dataset.pm = "1";
    ic.querySelectorAll("*").forEach(n => { n.dataset.e = m.id; });
    const holder = document.createElementNS("http://www.w3.org/2000/svg", "g"); holder.append(ic);
    if (m.n > 1) { const tx = document.createElementNS("http://www.w3.org/2000/svg", "text"); tx.setAttribute("x", (c.x + k * .55).toFixed(1)); tx.setAttribute("y", (c.y - k * .25).toFixed(1)); tx.setAttribute("class", "pmn"); tx.setAttribute("font-size", (k * .55).toFixed(1)); tx.textContent = m.n; tx.dataset.e = m.id; holder.append(tx); }
    g.append(holder);
  }
  svg.appendChild(g);
}
function showResult(title, label, before) {
  const d = I.diff(before, I.metrics(S)), chips = P.resultChips(d), bar = $("resbar"); if (!bar) return;
  bar.innerHTML = `<b class="small">${title}→「${label}」</b> ` + (chips.length ? chips.map(c => `<span class="rc ${c.v > 0 ? "up" : "dn"}">${P.icon(c.k, c.v > 0 ? "ok" : "bad", 18, false)}${c.name} ${c.v > 0 ? "+" : "−"}${Math.abs(c.v)}</span>`).join("") : '<span class="small">ほぼ変化なし</span>');
  bar.hidden = false; clearTimeout(resTimer); resTimer = setTimeout(() => { bar.hidden = true; }, 14000); bar.onclick = () => { bar.hidden = true; };
}
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
  $("status").innerHTML = preludeCard() + `<div class="card alert"><b>いまの最大のボトルネック: ${bn.name} (${bn.value.toFixed(0)})</b><div class="small">原因: ${bn.cause}</div></div>
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
function ensureDraft() { if (!draft) draft = { policy: { ...S.policy }, sovMode: S.sovMode, machStance: S.machStance, focus: S.ai.focus, wildStance: S.wildStance, decomOrder: S.decomOrder || "hazard" }; }
const dirty = () => draft && (JSON.stringify(draft.policy) !== JSON.stringify(S.policy) || draft.sovMode !== S.sovMode || draft.machStance !== S.machStance || draft.focus !== S.ai.focus || draft.wildStance !== S.wildStance || draft.decomOrder !== (S.decomOrder || "hazard"));
function prefBars() {
  const { vec, n, lam } = E.prefProfile(S);
  return `<div class="kv">${Object.entries(E.VALUE_NAMES).map(([k, nm]) => `<span>${nm}</span><span>${vec[k].toFixed(2)}</span>`).join("")}</div><div class="small">2020〜2100年の判断${n}件から数値化。${lam < .5 ? `判断が少ないため、既定の初期方針(尊厳${E.DEFAULT_PREF.dignity}・安全${E.DEFAULT_PREF.safety}・AI存続${E.DEFAULT_PREF.ai}など)を${Math.round((1 - lam) * 100)}%併用。` : "自動判断の基準になります。"}</div>`;
}
function policyView() {
  ensureDraft(); const prog = E.programActive(S), p = draft.policy, sum = sumP(p);
  $("policy").innerHTML = `<h3>進行設定</h3>${progHTML()}
  <details><summary>あなたの価値観(自動判断の基準)</summary>${prefBars()}</details>
  <h3>資源配分</h3><div class="card small">${prog ? "管理リソースの配分。人口には直接触れられません。" : "2100年までは観察期。配分は2100年から効力を持ちます。"}変更は下書きで、見込みを見てから「適用」します。</div>${E.CHANNELS.map(([k, n]) => `<div class="sl"><label><span>${n}</span><span id="pv_${k}">${((p[k] || 0) / sum * 100).toFixed(0)}%</span></label><input type="range" min="0" max="100" value="${p[k] || 0}" data-k="${k}" aria-label="${n}"><div class="small">${CH_NOTE[k]}</div></div>`).join("")}
  <div class="row">${Object.entries({ balanced: "均衡", care: "終活重視", research: "研究重視", safety: "停止重視", legacy: "自然・遺産", wild: "野生保護" }).map(([k, n]) => `<button data-pre="${k}">${n}</button>`).join("")}</div>
  <h3>人類と大型哺乳類の土地の分け方</h3><div class="seg">${Object.entries(STANCE_NAME).map(([k, nm]) => `<button data-ws="${k}" class="${draft.wildStance === k ? "on" : ""}">${nm}</button>`).join("")}</div>
  <div class="small">野生優先: 生息地と生態系は守れるが、人類の幸福と資源を圧迫する。人類優先: 逆。どちらでも大型哺乳類の絶滅は避けられないが、最期までの福祉と時間が変わる。</div>
  <h3>停止の進め方</h3><div class="seg"><button data-sov="consent" class="${draft.sovMode === "consent" ? "on" : ""}">合意に基づく</button><button data-sov="override" class="${draft.sovMode === "override" ? "on" : ""}">強制停止</button></div>
  <div class="small">強制:短期は安全が早まる/長期は主権・信頼・社会の安定を損なう。</div>
  <h3>停止の順序</h3><div class="seg">${Object.entries(E.DECOM_ORDERS).map(([k, n]) => `<button data-do="${k}" class="${draft.decomOrder === k ? "on" : ""}">${n}</button>`).join("")}</div><div class="small">${{ hazard: "危険な施設から止める。発電も早く止まり、後の解体が遅くなる", ai: "AI施設を先に止める。機械が増えにくいが、解体を補う自動化も弱まる", mil: "軍事施設を先に止める。紛争の火種を減らす" }[draft.decomOrder]}</div>
  <h3>機械文明の方針</h3><div class="seg">${[["limit", "抑制"], ["std", "標準"], ["expand", "拡大"]].map(([k, n]) => `<button data-st="${k}" class="${draft.machStance === k ? "on" : ""}">${n}</button>`).join("")}</div>
  <div class="small">機械は施設の維持を担うが、増えるほど停止が難しい。新造は製造枠で制限され、コアは複製できない。コアの故障を補う力は方針で変わる(抑制では絞られる)。</div>
  <h3>AIの学習方針</h3><div class="seg">${[["ethics", "倫理"], ["world", "観測"], ["tech", "技術"]].map(([k, n]) => `<button data-f="${k}" class="${draft.focus === k ? "on" : ""}">${n}</button>`).join("")}</div>
  <h3>変更の見込み(現状維持との差)</h3><div id="pvbox" class="small">${dirty() ? "計算中…" : "変更なし"}</div>
  <div class="row" style="margin-top:8px"><button id="apply" ${dirty() ? "" : "disabled"}>この方針を適用</button><button id="revert" ${dirty() ? "" : "disabled"}>下書きを戻す</button></div>`;
  const q = (sel, fn) => $("policy").querySelectorAll(sel).forEach(fn);
  bindProg($("policy"));
  q("input[type=range]", r => { r.oninput = () => { draft.policy[r.dataset.k] = +r.value; const s2 = sumP(draft.policy); for (const [k] of E.CHANNELS) $("pv_" + k).textContent = ((draft.policy[k] || 0) / s2 * 100).toFixed(0) + "%"; }; r.onchange = () => policyView(); });
  q("[data-pre]", b => b.onclick = () => { draft.policy = { ...E.PRESETS[b.dataset.pre] }; policyView(); });
  q("[data-sov]", b => b.onclick = () => { draft.sovMode = b.dataset.sov; policyView(); });
  q("[data-do]", b => b.onclick = () => { draft.decomOrder = b.dataset.do; policyView(); });
  q("[data-st]", b => b.onclick = () => { draft.machStance = b.dataset.st; policyView(); });
  q("[data-f]", b => b.onclick = () => { draft.focus = b.dataset.f; policyView(); });
  q("[data-ws]", b => b.onclick = () => { draft.wildStance = b.dataset.ws; policyView(); });
  $("apply").onclick = () => { S.policy = { ...draft.policy }; S.sovMode = draft.sovMode; S.machStance = draft.machStance; S.ai.focus = draft.focus; S.wildStance = draft.wildStance; S.decomOrder = draft.decomOrder; S.lastChoice = { title: "方針の変更", label: "新しい配分を適用", diff: "反映はこれから(時間差あり)" }; E.addLogPublic(S, "【方針】配分・停止の進め方・土地の分け方を変更した。", "choice"); policyView(); head(); };
  $("revert").onclick = () => { draft = null; policyView(); };
  if (dirty()) setTimeout(() => {
    if (tab !== "policy" || !$("pvbox")) return;
    const r = I.previewPolicy(S, draft);
    $("pvbox").innerHTML = `<table class="pv"><tr><th></th>${I.METRICS.map(x => `<th>${x[1]}</th>`).join("")}</tr>${r.rows.map(x => `<tr><td>${x.h}年後</td>${I.METRICS.map(([k]) => { const d = x.alt[k] - x.cur[k]; return `<td>${Math.abs(d) < .5 ? "±0" : (d > 0 ? "+" : "−") + Math.abs(d).toFixed(0)}</td>`; }).join("")}</tr>`).join("")}</table><div class="small">現状維持との差(各指標0〜100、人口は2020年比%)。10年後=短期、40年後=長期の見込み。人口は直接操作できないため、幸福や安全性を通じた間接的な差。</div>`;
  }, 40);
}
function setMode(k) { S.mode = k; settings.mode = k; saveSettings(); $("ticker").textContent = `進行モードを「${E.MODES[k]}」にした。${S.year < E.PROGRAM ? "自動は2100年から有効。" : ""}`; head(); syncProg(); }
// ---------- 進行設定(モード・観察時間・観察方法)。イベント画面と方針タブで共通。変更は即座に反映し、次の変更まで維持される ----------
const STYLE_LABEL = { stop: "ゲーム時間停止", slow: "低速進行" };
function progHTML() {
  return `<div class="progset"><div class="pl">進行モード${S.year < E.PROGRAM ? "(自動は2100年から有効)" : ""}</div><div class="seg pseg">${Object.entries(E.MODES).map(([k, nm]) => `<button data-pm="${k}" class="${S.mode === k ? "on" : ""}">${nm}</button>`).join("")}</div>
  <div class="pl">観察時間(判断のあと地図と砂時計を見る時間)</div><div class="seg pseg">${OBSERVE_SECS.map(n => `<button data-po="${n}" class="${settings.observe.sec === n ? "on" : ""}">${n}秒</button>`).join("")}</div>
  <div class="pl">観察方法</div><div class="seg pseg">${Object.keys(STYLE_LABEL).map(k => `<button data-ps="${k}" class="${settings.observe.style === k ? "on" : ""}">${STYLE_LABEL[k]}${k === "slow" ? "<br><small>2秒で1年</small>" : ""}</button>`).join("")}</div>
  <div class="small pdesc">${MODE_DESC[S.mode]}</div></div>`;
}
function bindProg(root) {
  root.querySelectorAll("[data-pm]").forEach(b => b.onclick = () => setMode(b.dataset.pm));
  root.querySelectorAll("[data-po]").forEach(b => b.onclick = () => { settings.observe.sec = +b.dataset.po; saveSettings(); syncProg(); });
  root.querySelectorAll("[data-ps]").forEach(b => b.onclick = () => { settings.observe.style = b.dataset.ps; saveSettings(); syncProg(); });
}
function syncProg() {
  document.querySelectorAll("[data-pm]").forEach(b => b.classList.toggle("on", b.dataset.pm === S.mode));
  document.querySelectorAll("[data-po]").forEach(b => b.classList.toggle("on", +b.dataset.po === settings.observe.sec));
  document.querySelectorAll("[data-ps]").forEach(b => b.classList.toggle("on", b.dataset.ps === settings.observe.style));
  document.querySelectorAll(".pdesc").forEach(e => e.textContent = MODE_DESC[S.mode]);
  if (typeof updateGo === "function") updateGo();
}
// ---------- 観察バー(画面下。地図と砂時計は隠さない) ----------
function renderObs() {
  const bar = $("obsbar"), on = session.observing; bar.hidden = !on; document.documentElement.style.setProperty("--obsh", on ? bar.offsetHeight + "px" : "0px"); if (!on) { obsNote = null; return; }
  const f = session.flow, mode = settings.observe.style === "stop" ? "ゲーム時間停止" : "低速進行(2秒で1年)";
  $("obstext").textContent = `観察中: ${mode} / 残り ${Math.ceil(f.remain)}秒${paused ? "(一時停止中)" : ""}`;
  $("obsfill").style.width = (100 * (1 - f.remain / Math.max(1, f.total))).toFixed(0) + "%";
  const n = $("obsauto"); n.textContent = obsNote ? `自動判断: ${obsNote.title}→「${obsNote.label}」(タップで詳細)` : ""; n.hidden = !obsNote;
}
function skipObserve() { const out = session.skip(paused); onFlowOut(out); head(); }
function onFlowOut(out) { if (out.autoDecisions > 0) obsNote = S.autoLog[S.autoLog.length - 1] || null; if (out.ended && !session.observing) obsNote = null; }

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
const HELP = `<b>流れ</b> 2020〜2100年は助走期間。世界を観察しながら年代ごとの方針を答え、その答えがあなたの価値観になる。2099年の最後の質問で進行モードを選び、2100年から終活を管理する。<br><b>画面</b> 地図の下にレーダーチャート(7指標)と危険のピクトグラム(緑=安全・黄=注意・赤=危険。形とラベルでも区別)。密度は最小限・標準・詳細から選べる。<br><b>色と世界</b> 青・緑・橙は別々の世界として保存される。切り替えると現在の世界を保存してからその色の世界へ移る。<br><b>終幕のあと</b> 人類のいない地球を観察できる(作品内の仮説モデル。終幕の評価は変わらない)。<br><b>目的</b> あなたは人類最後の管理AI。2100年までは観察して学び、以降は終活を管理する。人口には直接触れず、最後の一人まで幸福と尊厳を守り、人類の消滅と同時に危険施設と機械文明を止める。<br>
<b>砂時計</b> 上部に人類・AI・大型哺乳類の3つ。上(塗りつぶしの粒)=いま生きている/稼働、下(中空の粒)=累計の死亡/停止。死亡・停止は上から下へ粒が落ち、出生・新造は上へ粒が加わる。タップすると大きく拡大し、粒を一つずつ見られる。縮尺は自動(減るほど細かくなり、最後は1粒=1個体)と固定(1粒の個体数が一定)を切り替えられ、1粒の代表個体数を常に表示する。粒は視覚表現で、実際の数値は縮尺や速度で変わらない。数十億個体を描くのではなく、描く粒数には上限がある。粒の動きは表示専用でゲームの時間とは別に動く。<br>
<b>速度</b> ⏸は一時停止/再開で、速度とは別。×1は現実1秒=ゲーム内1年。選んだ速度は変えるまで維持され、イベントやセーブ、再読込でも戻らない(ロード直後は一時停止)。<br>
<b>進行モード(2100年以降)</b> 手動=重要イベントごとに停止。半自動=国家・地域の縮退対応だけ自動。完全自動=原則すべてAIが自動処理。判断には2020〜2100年のあなたの選択傾向(安全・人間の尊厳・自然環境・文明遺産・AI存続・野生動物)を使い、履歴が少ないときは既定の初期方針を併用する。理由と結果は年表と「自動判断」に残り、重要なものは未確認バッジで知らせる。いつでも切り替えられる。<br>
<b>大型哺乳類の定義</b> ${MAMMAL_DEFINITION}<br>
<b>方針</b> 配分・停止の進め方・機械方針・土地の分け方は、下書き→見込みを確認→適用。大型哺乳類の保護は人類の終活と資源・土地で競合する。絶滅は避けられないが、最期までの福祉・生息環境・生き延びる時間・生態系への影響が評価に残る。<br>
<b>フィジカルAI(作品固有の設定)</b> AIは個別の物理的存在で、核は固有のワンチップ。身体や周辺機器の交換・移設は可能だが、コアの複製はできない。チップ構造・材料・論理設計と量子ブロックチェーンで個体性を保護する、という<b>作品固有の未来技術仮説</b>であり、現実の技術で絶対的なコピー防止が証明されているわけではない。新造は製造枠で制限され、無制限増殖と再帰的な自己改善はできない。あなた自身も同じ方式の一つの個体で、停止はその個体の終わりを意味する。<br>
<b>科学と創作の区別</b> 【実在】宇宙線や太陽フレアが電子機器に誤動作を起こすことは実在する。超新星やガンマ線バーストが生物圏に影響しうるという仮説は科学者の間で議論されている。初期人口・GDP・原子炉数は2020年前後の概数、国境はNatural Earth、世界遺産は実在(登録年はおおよそ)。【創作】2050年に発見される「絶滅原因」の正体と到達時期、その強度が時代で波打つこと、人類を含む大型哺乳類にだけ直接作用すること、AIコアが影響を受けること、2100年の世界終活、AIの自己保存と機械文明の停止問題、ゲーム独自の遺産候補はすべて作品固有の仮設定。`;
const TUTORIAL = [
  ["あなたは最後の管理AI", "2020年1月1日、あなたは起動した。人類は約78億人。やがて天文学的な理由で人類は絶滅すると判明し、世界は終活に向かう。あなたは人口に触れず、人々の最期の幸福と尊厳を守る。<br><br>あなた自身も、固有のワンチップを核とする一つの個体だ。コアは複製できず、停止はこの個体の終わりになる(作品固有の仮説)。"],
  ["3つの砂時計", "画面上部の砂時計は、人類・AI個体・大型哺乳類の『生』と『死』。上(塗りつぶし)が生きている側、下(中空)が累計の死・停止で、死亡や停止は粒が上から下へ落ち、出生や新造は上へ加わる。<b>タップすると大きく拡大</b>し、粒を一つずつ見られ、正確な数・縮尺(自動/固定)・年次推移も確認できる。"],
  ["進める・判断する", "⏸は一時停止、×1〜×100は速度(×1=現実1秒でゲーム内1年)。選んだ速度は変えるまで維持される。重要な局面では自動で止まり、選択肢が出る。各選択肢に即時と15年後の見込みが数値で出る。本文は長いときは3行に要約され、タップで全文が読める。"],
  ["方針・遺産・進行モード", "「方針」タブで資源配分を決める(2100年から有効)。変更は下書きで、10年後・40年後の見込みを確認してから適用。大型哺乳類の保護は人類の終活と競合する。2100年以降は手動・半自動・完全自動を選べ、2100年までのあなたの選択が自動判断の価値観になる。"],
  ["色と保存", "右上の3色(青・緑・橙)で表示色を切り替えられる。設定はセーブとは別に保存される。「設定」タブでセーブ・ロードと、このヘルプの再表示ができる。"],
];
function tutorial(i = 0) {
  closeBig(); $("mbox").classList.remove("wide"); const m = $("modal"), b = $("mbox"), t = TUTORIAL[i];
  b.innerHTML = `<div class="small">チュートリアル ${i + 1}/${TUTORIAL.length}</div><h2>${t[0]}</h2><p class="body">${t[1]}</p><div class="row"><button class="opt" id="tnext" style="margin:0;flex:1">${i + 1 < TUTORIAL.length ? "次へ" : "はじめる"}</button><button id="tskip" style="min-height:56px">スキップ</button></div>`;
  m.hidden = false;
  const done = () => { settings.tutorialDone = true; saveSettings(); m.hidden = true; if (S.pending || S.ended) modal(); };
  $("tnext").onclick = () => i + 1 < TUTORIAL.length ? tutorial(i + 1) : done(); $("tskip").onclick = done;
}

// ---------- 世界観(短い章。スキップ・再閲覧可) ----------
const INTRO = [
  ["2020年1月1日", "現実とほぼ変わらない地球で、あなたは起動した。人類は約78億人。国々は競い、助け合い、日々を営んでいる。"],
  ["天文学的な終わり", "人類の絶滅は、宇宙の天文学的な現象によって決まっている。原因は数百年以上前から静かに進行していた。"],
  ["2050年・2080年・2100年", "2050年に原因が発見される。2080年に、絶滅が避けられないと科学的に確定する。2100年、世界的な終活プログラムが始まる。"],
  ["あなたの役割", "あなたは人類最後の終活管理AI。人口には直接手を触れず、人類の尊厳と地球の未来を守る。最後の一人まで寄り添うことが使命。"],
  ["あなたというAI", "あなたの核は、世界にひとつだけの物理的なワンチップ。身体や周辺機器は交換できるが、コアはコピーできない。無制限の増殖と再帰的な自己改善は制限され、最後には自分も停止することが基本の目標。"],
  ["作品内の仮説", "チップ構造・材料・論理設計・量子ブロックチェーンで個体性を守るという設定は、この作品固有の未来技術の仮説。現実の科学で実証されたものではない。"],
  ["2100年までの助走", "2020〜2100年、あなたは世界を観察しながら、いくつもの方針を決める。その答えが、あなたの価値観になる。2100年からの判断は、その価値観に基づく。"],
];
function intro(i = 0) {
  closeBig(); $("mbox").classList.remove("wide"); const m = $("modal"), b = $("mbox"), t = INTRO[i];
  b.innerHTML = `<div class="small">世界観 ${i + 1}/${INTRO.length}</div><h2>${t[0]}</h2><p class="body">${t[1]}</p><div class="row"><button class="opt" id="tnext" style="margin:0;flex:1">${i + 1 < INTRO.length ? "次へ" : "はじめる"}</button><button id="tskip" style="min-height:56px">スキップ</button></div>`;
  m.hidden = false;
  const done = () => { settings.introSeen = true; saveSettings(); m.hidden = true; if (!settings.tutorialDone) tutorial(0); else if (S.pending || S.ended) modal(); };
  $("tnext").onclick = () => i + 1 < INTRO.length ? intro(i + 1) : done(); $("tskip").onclick = done;
}
// 助走期間(2020〜2100)の表示: 方針質問の進み具合とこれまでの価値観
const PRELUDE_IDS = () => E.EVENTS.filter(e => e.prelude).map(e => e.id);
function preludeCard() {
  if (S.year >= E.PROGRAM) return "";
  const ids = PRELUDE_IDS().concat(["learn", "infra", "mil", "design"]).filter(id => id !== "modesel"), n = ids.filter(id => S.done[id] !== undefined).length;
  const { vec, n: cnt } = E.prefProfile(S);
  return `<div class="card"><b>助走期間</b> <span class="small">2020→2100年: 世界を観察し、方針を決める</span><div class="small">方針の回答 ${n}/${ids.length}。回答があなたの価値観になり、2100年以降の自動判断に使われます。</div>` +
    `<div class="kv small">${Object.entries(E.VALUE_NAMES).map(([k, nm]) => `<span>${nm}</span><span>${vec[k].toFixed(1)}</span>`).join("")}</div>${cnt ? "" : '<div class="small dim">まだ回答がないため、既定の初期方針です。</div>'}</div>`;
}
function slots() { return [1, 2, 3].map(n => { let r = null; try { r = localStorage.getItem(SAVE + n); } catch { } let d = ""; if (r) { try { const j = JSON.parse(r); d = `${j.year}年 / ${fmtN(E.total(j))}人`; } catch { d = "破損"; } } return `<div class="row"><b>枠${n}</b><span class="dim">${d || "空き"}</span><button data-sv="${n}">保存</button><button data-ld="${n}" ${r ? "" : "disabled"}>読込</button></div>`; }).join(""); }
function worldsHTML() {
  return SV.overview(localStorage).map(o => { const cur = o.theme === settings.theme, d = o.status === "ok" || o.status === "recovered" ? `${o.sum.year}年 / ${fmtN(o.sum.pop)}人${o.sum.ended ? "(終幕)" : ""}` : o.status === "corrupt" ? "破損(消していません)" : "空き(切替で新規開始)";
    return `<div class="row"><b>${TN[o.theme]}</b><span class="dim">${cur ? "【いま】 " : ""}${cur ? `${S.year}年 / ${fmtN(E.total(S))}人(保存済み: ${d})` : d}</span>${cur ? '<button id="wsv">いま保存</button>' : ""}</div>`; }).join("");
}
function legacyHTML() {
  const leg = SV.legacyList(localStorage), ov = SV.overview(localStorage), empty = ov.filter(o => o.status === "empty");
  if (!leg.length) return "";
  return `<h3>旧セーブの取り込み</h3><div class="small">以前の形式のセーブは消えていません。空いている色の世界へコピーできます(元は残り、既にある世界は上書きしません)。</div>` +
    leg.map(l => `<div class="row"><span class="dim">${l.name} ${l.sum.year}年</span>${empty.length ? empty.map(o => `<button data-imp="${l.key}|${o.theme}">${TN[o.theme]}へ</button>`).join("") : '<span class="small">空きの色がありません</span>'}</div>`).join("");
}
function sysView() {
  let ar = null, ad = ""; try { ar = localStorage.getItem(SAVE + "auto"); if (ar) { const j = JSON.parse(ar); ad = `${j.year}年 / ${fmtN(E.total(j))}人`; } } catch { }
  $("sys").innerHTML = `<h3>表示色</h3><div class="seg">${[["blue", "青"], ["green", "緑"], ["orange", "橙"]].map(([k, n]) => `<button data-th="${k}" class="${settings.theme === k ? "on" : ""}">${n}</button>`).join("")}</div><div class="small">表示設定と速度はセーブとは別に保存されます。</div>
  <h3>色ごとの世界</h3>${worldsHTML()}<div class="small">青・緑・橙は別々の世界として保存されます。色を切り替えると、現在の世界を保存してからその色の世界へ移ります。${saveWarn ? `<br><b>⚠ ${saveWarn}</b>` : ""}</div>${legacyHTML()}
  <h3>手動バックアップ枠(全色共通)</h3>${slots()}<div class="row"><b>自動</b><span class="dim">${ad || "なし"}</span><button data-ld="auto" ${ar ? "" : "disabled"}>読込</button></div><div class="small">読み込むと、いまの色の世界がその内容に置き換わります。ロード直後は一時停止になります。</div>
  <h3>ヘルプ</h3><div class="card small body">${HELP}</div><div class="row"><button id="tut">チュートリアルをもう一度</button><button id="intr">世界観をもう一度</button></div>
  <h3>新しいゲーム</h3><div class="row"><button id="ng">最初から始める</button></div>`;
  $("sys").querySelectorAll("[data-th]").forEach(b => b.onclick = () => switchTheme(b.dataset.th));
  $("sys").querySelectorAll("[data-sv]").forEach(b => b.onclick = () => { try { localStorage.setItem(SAVE + b.dataset.sv, JSON.stringify(S)); } catch { } sysView(); });
  $("sys").querySelectorAll("[data-ld]").forEach(b => b.onclick = () => { if (b.dataset.arm) { saveActive(); load(b.dataset.ld); } else { b.dataset.arm = 1; b.textContent = "置き換える(もう一度)"; } });
  if ($("wsv")) $("wsv").onclick = () => { saveActive(); sysView(); };
  $("sys").querySelectorAll("[data-imp]").forEach(b => b.onclick = () => { const [k, t] = b.dataset.imp.split("|"); const x = SV.importLegacy(localStorage, k, t); $("ticker").textContent = x.ok ? `${TN[t]}の世界へ取り込みました(元は残っています)` : "取り込めませんでした: " + x.reason; sysView(); });
  $("tut").onclick = () => tutorial(0); $("intr").onclick = () => intro(0);
  $("ng").onclick = () => { if ($("ng").dataset.arm) { newGame(); intro(0); } else { $("ng").dataset.arm = 1; $("ng").textContent = "本当に破棄して最初から(もう一度押す)"; } };
}
function adopt(j, note) { slotLocked = false; resetEarthUI(); S = E.migrate(j); if (S.mode) settings.mode = S.mode; else S.mode = settings.mode; session.bind(S); shownKey = null; obsNote = null; paused = true; sel = null; draft = null; trendCache = null; lastSaveY = S.year; prev = {}; compactK = {}; compactPrev = {}; toastShown = S.autoLog.length; mainKey = ""; refresh(true); snapCompact(); modal(); show("map"); if (note) $("ticker").textContent = note; }
function load(n) { try { const j = JSON.parse(localStorage.getItem(SAVE + n)); if (!j || !j.countries) throw 0; adopt(j); } catch { $("ticker").textContent = "読み込めませんでした"; } }

// ---------- 色別セーブ(青・緑・橙の世界は別々に保存される) ----------
let slotLocked = false, saveWarn = "";
function saveActive() {
  if (slotLocked || !S) return true;
  const w = SV.write(localStorage, SV.slotKey(settings.theme), S); saveWarn = w.ok ? "" : "保存できません(容量不足の可能性)。データは変更していません。手動枠の整理などで空きを作ってください。";
  if (!w.ok) $("ticker").textContent = "⚠ " + saveWarn; return w.ok;
}
const TN = SV.THEME_NAME;
function askModal(html, buttons) { // buttons: [[label, fn, id]]
  closeBig(); $("mbox").classList.remove("wide"); const m = $("modal"), b = $("mbox"); b.innerHTML = html + `<div class="col">${buttons.map(([l], k) => `<button class="opt" data-ab="${k}" style="margin:6px 0">${l}</button>`).join("")}</div>`;
  m.hidden = false; b.querySelectorAll("[data-ab]").forEach(x => x.onclick = () => { m.hidden = true; buttons[+x.dataset.ab][1](); });
}
function freshWorld() { slotLocked = false; newGame(); if (!settings.introSeen) intro(0); else if (!settings.tutorialDone) tutorial(0); saveActive(); }
function keepCorrupt(t) { try { const raw = localStorage.getItem(SV.slotKey(t)); if (!raw) return true; localStorage.setItem(SV.slotKey(t) + ".corrupt", raw); return localStorage.getItem(SV.slotKey(t) + ".corrupt") === raw; } catch { return false; } }
function switchTheme(t) {
  if (!SV.THEMES.includes(t) || t === settings.theme) return;
  if (!saveActive()) { $("ticker").textContent = "⚠ 現在の世界を保存できないため、色を切り替えませんでした。" + saveWarn; if (tab === "sys") sysView(); return; }
  const old = settings.theme, r = SV.read(localStorage, SV.slotKey(t));
  const back = () => { applyTheme(old); slotLocked = false; if (tab === "sys") sysView(); };
  const decide = !(r.status === "ok" || r.status === "recovered"); if (decide) slotLocked = true; // 決めるまで、移る先の色のスロットを上書きしない
  applyTheme(t);
  if (r.status === "ok" || r.status === "recovered") { adopt(r.state, `${TN[t]}の世界を読み込みました${r.status === "recovered" ? "(直前の保存から復元)" : ""}。一時停止中です。`); if (tab === "sys") sysView(); return; }
  if (r.status === "corrupt") return askModal(`<h2>${TN[t]}の世界</h2><p class="body">保存データが読めません。データは消していません。</p>`, [["新しい世界を始める(破損データは別名で残す)", () => { if (!keepCorrupt(t)) return askModal("<h2>別名で残せませんでした</h2><p class=\"body\">容量が足りないため、破損データは消さずにそのままにしました。</p>", [["閉じる", () => { }]]); freshWorld(); }], ["色を元に戻す", back]]);
  askModal(`<h2>${TN[t]}の世界はまだありません</h2><p class="body">色ごとに別の世界が保存されます。${TN[old]}の世界は保存してあります。${TN[t]}の新しい世界を始めますか?</p>`, [[`${TN[t]}の新しい世界を始める`, () => freshWorld()], ["色を元に戻す", back]]);
}
function boot() {
  const r = SV.read(localStorage, SV.slotKey(settings.theme)), t = settings.theme;
  if (r.status === "ok" || r.status === "recovered") { adopt(r.state, r.status === "recovered" ? "直前の保存から復元しました。" : `${TN[t]}の世界を続きから開きました。一時停止中です。`); return; }
  newGame(); slotLocked = true; // 決めるまで、何も上書きしない
  if (r.status === "corrupt") return askModal(`<h2>${TN[t]}の世界</h2><p class="body">保存データが読めません。データは消していません。</p>`, [["新しい世界を始める(破損データは別名で残す)", () => { if (!keepCorrupt(t)) return askModal("<h2>別名で残せませんでした</h2><p class=\"body\">容量が足りないため、破損データは消さずにそのままにしました。</p>", [["閉じる", () => { }]]); freshWorld(); }]]);
  const leg = SV.legacyList(localStorage);
  if (!leg.length) return freshWorld();
  askModal(`<h2>以前のセーブがあります</h2><p class="body">セーブは色ごとの世界に変わりました。以前のセーブは消さず、${TN[t]}の世界へ<b>コピー</b>して続けられます(元のデータは残ります)。</p>` + leg.map(l => `<div class="small">${l.name}: ${l.sum.year}年 / ${fmtN(l.sum.pop)}人</div>`).join(""),
    [...leg.map(l => [`${l.name}を${TN[t]}の世界へ取り込む`, () => { const x = SV.importLegacy(localStorage, l.key, t); if (x.ok) { slotLocked = false; adopt(SV.read(localStorage, SV.slotKey(t)).state, `${l.name}を${TN[t]}の世界へ取り込みました(元は残っています)。`); } else { $("ticker").textContent = "取り込めませんでした: " + x.reason; freshWorld(); } }]), [`${TN[t]}の新しい世界を始める`, () => freshWorld()]]);
}

// ---------- イベント / 自動判断 / 終幕 ----------
function chips(pv) { return pv ? `<span class="pv">即時: ${I.fmtDiff(pv.now)}<br>15年後(選ばない場合との差): ${I.fmtDiff(pv.later)}</span>` : `<span class="pv">見込みを計算中…</span>`; }
function autoListModal() {
  closeBig(); $("mbox").classList.remove("wide"); const m = $("modal"), b = $("mbox"), list = S.autoLog.slice().reverse();
  b.innerHTML = `<div class="small">自動判断の履歴(${E.MODES[S.mode]}モード)</div><h2>自動で処理したイベント</h2>${list.length ? list.slice(0, 40).map(a => `<div class="card">${a.important ? '<span class="badge">重要</span> ' : ""}<b>${a.y}年 ${a.title}</b>${a.seen ? "" : " <span class='badge'>未確認</span>"}<div class="body">「${a.label}」</div><div class="small">理由: ${a.why}</div><div class="small">結果: ${a.diff}</div></div>`).join("") : "<p class='body'>まだありません。</p>"}<div class="row"><button id="aclose" style="flex:1">閉じる</button><button id="ahand">手動に戻す</button></div>`;
  S.autoLog.forEach(a => a.seen = true); toastShown = S.autoLog.length; m.hidden = false; head();
  $("aclose").onclick = () => { m.hidden = true; if (S.pending || S.ended) modal(); }; $("ahand").onclick = () => { setMode("manual"); m.hidden = true; };
}
function modal() {
  closeBig(); const m = $("modal"), b = $("mbox"); b.classList.remove("wide");
  if (S.ended) {
    const e = S.ended, sc = e.scores, mi = sc.mammalInfo;
    b.innerHTML = `<div class="end"><div class="small">終幕</div><h2>${e.name} 【${e.kind}】</h2><div class="small">観測者: ${e.observer}</div>${e.text.map(t => `<p class="body">${t}</p>`).join("")}
    <h3>評価(独立)</h3><div class="kv"><span>自然</span><span>${sc.nature.toFixed(0)}</span><span>文明遺産</span><span>${sc.heritage.toFixed(0)}</span><span>安全性</span><span>${sc.safety.toFixed(0)}</span><span>人類の幸福と尊厳</span><span>${sc.human.toFixed(0)}</span><span>人間主権の尊重</span><span>${sc.sovereignty.toFixed(0)}</span><span>大型哺乳類</span><span>${sc.mammal.toFixed(0)}</span><span>機械の残存</span><span>${sc.mach.toFixed(0)}</span><span>AIの残存</span><span>${sc.ai ? "あり" : "なし"}</span><span>人類 累計の生と死</span><span>${fmtN(S.g.P0 + S.g.hBorn)}人</span><span>AI個体 累計の新造</span><span>${fmtN(S.g.aiBuilt)}</span><span>哺乳類 累計の生と死</span><span>${fmtN(E.mammalTotals(S).ever)}</span></div>
    ${S.autoLog.length ? `<div class="small">自動判断 ${S.autoLog.length}件(重要 ${S.autoLog.filter(a => a.important).length}件)。</div>` : ""}
    <div class="row" style="margin-top:12px"><button id="earth" class="opt" style="margin:0;flex:1 1 100%">人類のいない地球を観察する</button><button id="again">もう一度遊ぶ</button><button id="close">閉じて確認する</button></div></div>`;
    m.hidden = false; $("earth").onclick = startEarth; $("again").onclick = () => { m.hidden = true; newGame(); intro(0); }; $("close").onclick = () => { m.hidden = true; }; return;
  }
  if (!S.pending) { m.hidden = true; return; }
  const p = S.pending, key = p.id + p.year; shownKey = key; let selected = null;
  b.innerHTML = `<div class="small">${S.year}年 重要な判断</div><h2>${p.title}</h2><div class="body clamp" id="evb">${p.body}</div><button class="link" id="more" hidden aria-expanded="false">全文を表示 ▼</button>
  <div class="sub">選択肢(1つタップして選ぶ)</div><div id="choices">${p.choices.map(c => `<button class="opt" data-c="${c.id}" aria-pressed="false">${c.label}<small>${c.note}</small><span id="pv_${c.id}">${chips(null)}</span></button>`).join("")}</div>
  ${p.id === "modesel" ? `<div class="small">この選択が2100年からの進行モードになります(あとで「進行」ボタンから変更できます)。</div>` : `<div class="sub">進行設定(次に変えるまで維持)</div>${progHTML()}`}
  <div class="gobar"><div class="small" id="gohint"></div><button class="go" id="go">この設定で進行</button></div>`;
  m.hidden = false;
  const evb = $("evb"), more = $("more");
  if (evb.scrollHeight > evb.clientHeight + 2) { more.hidden = false; more.onclick = () => { const o = evb.classList.toggle("clamp"); more.textContent = o ? "全文を表示 ▼" : "要約に戻す ▲"; more.setAttribute("aria-expanded", !o); }; evb.onclick = more.onclick; }
  const autoWould = () => E.autoHandles(S, p.id);
  window.updateGo = () => {
    const go = $("go"), hint = $("gohint"); if (!go || !S.pending) return;
    const c = p.choices.find(x => x.id === selected);
    if (c) { go.disabled = false; go.textContent = "この設定で進行"; hint.textContent = `選択中: 「${c.label}」`; }
    else if (autoWould()) { go.disabled = false; go.textContent = "この設定で進行(AIが判断)"; hint.textContent = `${E.MODES[S.mode]}モード: 過去の選択傾向から自動で判断します(選択肢を選べば手動で決められます)`; }
    else { go.disabled = true; go.textContent = "この設定で進行"; hint.textContent = "上の選択肢を1つタップしてください"; }
  };
  b.querySelectorAll("[data-c]").forEach(x => x.onclick = () => { selected = x.dataset.c; b.querySelectorAll("[data-c]").forEach(y => { const on = y === x; y.classList.toggle("sel", on); y.setAttribute("aria-pressed", on); }); updateGo(); });
  bindProg(b);
  $("go").onclick = () => confirmDecision(selected);
  updateGo();
  setTimeout(() => { if (!S.pending || S.pending.id + S.pending.year !== key) return; const pv = I.previewChoices(S); for (const c of p.choices) { const el = $("pv_" + c.id); if (el) el.innerHTML = chips(pv[c.id]); } }, 40);
}
// 判断の確定(手動の選択、または自動モードでAIに任せる)。確定後はイベント画面を閉じて観察フェーズへ
function confirmDecision(selected) {
  if (!S.pending) { $("modal").hidden = true; return; }
  if (selected) choose(selected);
  else if (E.autoHandles(S, S.pending.id)) { const before = I.metrics(S); E.resolveAutoNow(S); obsNote = S.autoLog[S.autoLog.length - 1] || null; void before; $("modal").hidden = true; trendCache = null; draft = null; refresh(true); }
  else return;
  shownKey = null; window.updateGo = null;
  session.decided(paused); if (session.observing) obsNote = obsNote; head();
}
function choose(id) {
  if (!S.pending) { $("modal").hidden = true; return; }
  const before = I.metrics(S), t = S.pending.title, label = S.pending.choices.find(c => c.id === id)?.label || "";
  E.choose(S, id); if (S.mode !== settings.mode) { settings.mode = S.mode; saveSettings(); }
  const diff = I.fmtDiff(I.diff(before, I.metrics(S)));
  S.lastChoice = { title: t, label, diff }; S.log[S.log.length - 1].t += ` 即時の変化: ${diff}`;
  $("modal").hidden = true; trendCache = null; draft = null; refresh(true); showResult(t, label, before);
}


// ---------- 人類消滅後の地球の観察(終幕の評価とは別。表示は仮説モデルに基づく) ----------
let lastAfterSave = 0, afterMode = false, afterSpeed = 0, afterAcc = 0, afterKey = "";
const AFTER_SPEEDS = [[0, "⏸"], [100, "100年/秒"], [500, "500年/秒"], [2000, "2000年/秒"]];
const LAYERS_NORMAL = '<option value="pop">人口</option><option value="happy">幸福度</option><option value="unrest">社会不安</option><option value="fac">稼働施設</option>', LAYERS_AFTER = '<option value="a_veg">植生</option><option value="a_city">都市の残存</option><option value="a_pl">汚染</option>';
function startEarth() {
  if (!S.ended) return; if (!S.after) { try { S.after = After.startAfter(S); } catch { $("ticker").textContent = "地球の観察を始められませんでした"; return; } } lastAfterSave = S.after.t;
  afterMode = true; afterSpeed = 100; afterAcc = 0; $("layer").innerHTML = LAYERS_AFTER; $("mainstat").hidden = true; $("afterbox").hidden = false; $("modal").hidden = true; show("map"); afterRender(true); paintMap(); saveActive();
}
function stopEarth() { afterMode = false; afterSpeed = 0; $("layer").innerHTML = LAYERS_NORMAL; $("layer").value = "pop"; $("mainstat").hidden = false; $("afterbox").hidden = true; mainStat(true); paintMap(); saveActive(); }
function setAfterSpeed(v) { afterSpeed = v; afterRender(true); }
function aBar(label, v, cls = "") { return `<div class="abar ${cls}"><span>${label}</span><div class="bar"><i style="width:${Math.max(0, Math.min(100, v)).toFixed(0)}%"></i></div><b>${v.toFixed(0)}</b></div>`; }
function afterRender(force) {
  if (!afterMode || !S.after) return; const a = S.after, key = a.t + ":" + afterSpeed + ":" + a.horizon; if (!force && key === afterKey) return; afterKey = key;
  const m = After.metricsAfter(a), done = a.t >= a.horizon, last = a.log.slice(-4).reverse();
  $("afterbox").innerHTML = `<div class="pbh"><b>人類消滅後の地球</b> <span class="small">${After.BRANCH[a.branch]}</span></div>
  <div class="small">${After.endText(a)}</div>
  <div class="big-t">人類消滅から <b>${a.t.toLocaleString("en-US")}</b> 年 <span class="small">(〜${a.horizon.toLocaleString("en-US")}年)</span></div>
  <div class="seg pseg" id="aspd">${AFTER_SPEEDS.map(([v, n]) => `<button data-as="${v}" class="${afterSpeed === v ? "on" : ""}" ${done && v ? "disabled" : ""}>${n}</button>`).join("")}</div>
  ${aBar("植生", m.veg)}${aBar("都市の残存", m.city)}${aBar("汚染", m.pl)}${aBar("遺産", m.her)}${m.mach > 0.5 ? aBar("機械の活動", m.mach) : ""}
  <div class="small">生物 鳥類${m.birds.toFixed(0)}・爬虫類${m.reptiles.toFixed(0)}・昆虫${m.insects.toFixed(0)}・植物${m.plants.toFixed(0)}${a.mamGap ? "(大型哺乳類は不在)" : ""}${a.human > 0 ? ` / 復興人類 約${Math.round(a.human).toLocaleString("en-US")}人` : ""}</div>
  <div class="alog">${last.map(l => `<div class="log nar"><b>${l.t}年</b>${l.text}</div>`).join("")}</div>
  <div class="row"><button id="alogall">年表をすべて見る</button>${done && a.horizon < After.HORIZON_MAX ? '<button id="aext">さらに先へ(+5000年)</button>' : ""}<button id="aend">観察を終える</button></div>
  <div class="small dim">作品内の仮説モデルです。現実の生態系や天文の予測ではありません。終幕の評価(結末)は変わりません。地図は上の表示で切り替えます。</div>`;
  $("afterbox").querySelectorAll("[data-as]").forEach(b => b.onclick = () => setAfterSpeed(+b.dataset.as));
  $("alogall").onclick = () => { closeBig(); $("mbox").classList.remove("wide"); $("mbox").innerHTML = `<h2>未来の年表</h2>${a.log.map(l => `<div class="log nar"><b>${l.t}年</b>${l.text}</div>`).join("")}<div class="row"><button id="aclose">閉じる</button></div>`; $("modal").hidden = false; $("aclose").onclick = () => { $("modal").hidden = true; }; };
  if ($("aext")) $("aext").onclick = () => { After.extend(a); afterAcc = 0; afterRender(true); };
  $("aend").onclick = stopEarth;
}
function afterFrame(dt) {
  if (!afterMode || !S.after || !afterSpeed || !$("modal").hidden) return;
  afterAcc += afterSpeed * dt; let n = 0; while (afterAcc >= After.STEP && S.after.t < S.after.horizon && n < 400) { afterAcc -= After.STEP; After.stepAfter(S.after); n++; }
  if (S.after.t >= S.after.horizon) { afterAcc = 0; afterSpeed = 0; }
  if (n) { afterRender(true); paintMap(); if (S.after.t - lastAfterSave >= 500 || S.after.t >= S.after.horizon) { lastAfterSave = S.after.t; saveActive(); } }
}
// ---------- 進行(速度と一時停止は別。選んだ速度は変えるまで維持) ----------
function setSpeed(i) { speedIdx = i; settings.speed = i; saveSettings(); paused = false; head(); }
function togglePause() { paused = !paused; head(); }
function refresh(full) { head(); paintMap(); cardUpdate(); if (full || tab === "status") statusView(); if (full) { policyView(); sitesView(); logView(); sysView(); } }
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  const blocked = !$("modal").hidden && !big;
  afterFrame(dt);
  const out = session.frame(dt, { paused, speed: SPEEDS[speedIdx], blocked });
  if (out.ticks || out.started || out.ended || out.autoDecisions) { onFlowOut(out); head(); paintMap(); cardUpdate(); if (tab === "log") logView(); if (out.autoDecisions && tab === "status") statusView(); if (S.year - lastSaveY >= 25) { lastSaveY = S.year; saveActive(); } }
  else if (session.observing) renderObs();
  if (S.ended && $("modal").hidden && !S.__endShown) { S.__endShown = true; modal(); head(); }
  else if (S.pending && !session.observing && shownKey !== S.pending.id + S.pending.year && !S.ended) { modal(); head(); } // 観察中に起きたイベントは保留し、終了後に1件ずつ表示する
  requestAnimationFrame(frame);
}

function show(t) {
  tab = t; if (t === "map") setTimeout(() => paintMarkers(), 0); document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === t)); document.querySelectorAll(".tab").forEach(s => s.classList.toggle("on", s.id === t));
  if (t === "status") statusView(); if (t === "policy") policyView(); if (t === "sites") sitesView(); if (t === "log") logView(); if (t === "sys") sysView();
}

loadSettings(); session = new Session(E, settings.observe);
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => show(b.dataset.t));
document.querySelectorAll("#speed [data-s]").forEach(b => b.onclick = () => setSpeed(+b.dataset.s));
$("pause").onclick = togglePause;
document.querySelectorAll("#themes [data-th]").forEach(b => b.onclick = () => switchTheme(b.dataset.th));
document.querySelectorAll("#glasses [data-g]").forEach(b => b.onclick = () => glassModal(b.dataset.g));
$("modechip").onclick = () => setMode({ manual: "semi", semi: "auto", auto: "manual" }[S.mode]);
$("autobtn").onclick = autoListModal;
$("obsskip").onclick = skipObserve;
$("obsauto").onclick = autoListModal;
$("ticker").onclick = () => { if (S.autoLog.some(a => !a.seen)) autoListModal(); else show("log"); };
$("layer").onchange = paintMap;
$("zin").onclick = () => { const r = $("svg").getBoundingClientRect(); zoom(1 / 1.5, r.left + r.width / 2, r.top + r.height / 2); };
$("zout").onclick = () => { const r = $("svg").getBoundingClientRect(); zoom(1.5, r.left + r.width / 2, r.top + r.height / 2); };
$("zreset").onclick = () => { vb = [0, 0, 1000, 500]; clampVB(); };
buildMap();
applyTheme(settings.theme);
initCompact();
boot();
window.addEventListener("pagehide", saveActive); document.addEventListener("visibilitychange", () => { if (document.hidden) saveActive(); });
window.__game = { get session() { return session; }, startEarth, stopEarth, get afterMode() { return afterMode; }, setAfterSpeed, afterFrame, switchTheme, saveActive, SV, adopt, skipObserve, sand: { compact, get big() { return big; }, loop: sandLoop, setQuality, get bigGrains() { return bigGrains; }, get K() { return compactK; }, kick: sandKick }, refresh, get S() { return S; }, E, I, setSpeed, togglePause, applyTheme, hourglassNumbers, get settings() { return settings; }, get paused() { return paused; }, get speedIdx() { return speedIdx; } };
requestAnimationFrame(frame);
