import * as E from "./engine.js";
import { MAP } from "./mapdata.js";
import { FACTYPES } from "./data.js";

const $ = (id) => document.getElementById(id);
const SAVE = "weol.save.", SPEEDS = [0, 1, 4, 20, 100], SPLABEL = ["停止中", "1年/秒", "4年/秒", "20年/秒", "100年/秒"];
let S = null, speed = 0, sel = null, tab = "map", acc = 0, last = performance.now(), lastSaveY = 0, vb = [0, 0, 1000, 500], pathEls = {};

function newGame(seed) { S = E.newGame(seed || (Date.now() % 100000) + 1); speed = 0; sel = null; lastSaveY = S.year; refresh(true); setSpeed(1); }
const idx = (id) => S.countries.findIndex(c => c.id === id);

// ---------- 地図 ----------
function buildMap() {
  const svg = $("svg"); svg.innerHTML = ""; pathEls = {};
  for (const m of MAP) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", m.d); p.dataset.e = m.e; p.dataset.n = m.n;
    svg.appendChild(p); (pathEls[m.e] = pathEls[m.e] || []).push(p);
  }
  let down = null, moved = false;
  svg.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY, vb: [...vb] }; moved = false; svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, e); pinch = null; });
  const pts = new Map(); let pinch = null;
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
function lerp(a, b, t) { return a.map((x, i) => Math.round(x + (b[i] - x) * t)); }
function colorFor(c) {
  if (c.extinct) return "#1b222b";
  const L = $("layer").value;
  if (L === "pop") { const t = Math.min(1, Math.log10(Math.max(1, E.cpop(c) / c.P0 * 100)) / 2.2); return `rgb(${lerp([40, 60, 80], [90, 190, 255], Math.max(.05, t))})`; }
  if (L === "happy") return `rgb(${lerp([200, 70, 70], [90, 220, 140], c.happy)})`;
  if (L === "unrest") return `rgb(${lerp([50, 80, 90], [255, 110, 60], c.unrest)})`;
  const i = idx(c.id); let n = 0, r = 0; for (const f of S.facs) if (f.c === i) { n++; if (f.st === 0) r++; else if (f.st === 3) r += .0; } const t = n ? r / n : 0;
  const bad = S.facs.some(f => f.c === i && f.st === 3);
  return bad ? "rgb(255,90,100)" : `rgb(${lerp([60, 130, 90], [255, 190, 80], t)})`;
}
function paintMap() {
  S.countries.forEach(c => { const col = colorFor(c); for (const p of pathEls[c.id] || []) p.style.fill = col; });
  const L = $("layer").value;
  $("legend").textContent = { pop: "明るい青ほど人口が多い(2020年比・対数)。黒は無人。", happy: "緑=幸福、赤=不幸。", unrest: "橙=社会不安が高い。", fac: "黄=稼働施設が多い、緑=ほぼ封鎖、赤=事故施設あり。" }[L];
}
function select(id) { sel = id; document.querySelectorAll("#svg path.sel").forEach(p => p.classList.remove("sel")); (pathEls[id] || []).forEach(p => p.classList.add("sel")); cardUpdate(); }
function cardUpdate() {
  const el = $("card"); if (!sel) return; const i = idx(sel); if (i < 0) return; const c = S.countries[i];
  const cnt = FACTYPES.map((T, t) => { const f = S.facs.filter(x => x.c === i && x.t === t); const r = f.filter(x => x.st === 0).length, dc = f.filter(x => x.st === 1).length, sl = f.filter(x => x.st === 2).length, ac = f.filter(x => x.st === 3).length; return `<span>${T.name}</span><span>${f.length}基 稼働${r} 停止中${dc} 封鎖${sl}${ac ? ` <b style="color:var(--bad)">事故${ac}</b>` : ""}</span>`; }).join("");
  el.innerHTML = `<b>${c.name}</b>${c.extinct ? " <span class='dim'>(無人)</span>" : ""}<div class="kv"><span>人口</span><span>${E.fmtPop(E.cpop(c))}</span><span>幸福度</span><span>${(c.happy * 100).toFixed(0)}</span><span>社会不安</span><span>${(c.unrest * 100).toFixed(0)}</span><span>終活への合意</span><span>${(c.consent * 100).toFixed(0)}%</span><span>認識(絶滅)</span><span>${(c.aware * 100).toFixed(0)}%</span><span>労働力維持</span><span>${(c.m * 100).toFixed(0)}%</span><span>GDP(相対)</span><span>${(c.gdp / c.gdp0 * 100).toFixed(0)}%</span>${cnt}</div>`;
}

// ---------- 画面 ----------
function phaseName() { const y = S.year; return y < E.DISCOVERY ? "観察期" : y < E.CERTAIN ? "発見後" : y < E.PROGRAM ? "不可避の確定後" : S.g.extinctYear ? "人類消滅後" : "終活期"; }
function head() {
  $("date").textContent = S.year + "年"; $("phase").textContent = phaseName();
  const P = E.total(S); $("pop").textContent = "人口 " + E.fmtPop(P);
  document.querySelectorAll("#speed button").forEach(b => b.classList.toggle("on", +b.dataset.s === speed));
  $("spdlabel").textContent = SPLABEL[speed];
}
const bar = (v, color) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;${color ? "background:" + color : ""}"></i></div>`;
function statusView() {
  const g = S.g, ai = S.ai, F = FACTYPES.map((T, t) => { const f = S.facs.filter(x => x.t === t); const c = [0, 0, 0, 0]; f.forEach(x => c[x.st]++); return `<span>${T.name}</span><span>${f.length} / 稼働${c[0]} 停止中${c[1]} 封鎖${c[2]}${c[3] ? ` <b style="color:var(--bad)">事故${c[3]}</b>` : ""}</span>`; }).join("");
  $("status").innerHTML = `<h3>世界</h3><div class="kv"><span>自然(生物圏)</span><span>${g.bio.toFixed(0)}</span></div>${bar(g.bio, "#6cffb0")}
  <div class="kv"><span>汚染</span><span>${g.pl.toFixed(0)}</span></div>${bar(g.pl, "#ff9f6c")}
  <div class="kv"><span>文明遺産</span><span>${g.her.toFixed(0)}(確保済み${g.arch.toFixed(0)})</span></div>${bar(g.her)}
  <div class="kv"><span>天然資源</span><span>${g.res.toFixed(0)}</span></div>${bar(g.res)}
  <div class="kv"><span>管理リソース(年)</span><span>${g.flow.toFixed(0)}</span><span>事故累計</span><span>${g.accidents}</span><span>紛争累計</span><span>${g.wars}</span></div>
  <h3>生存研究 / 機械文明</h3>
  <div class="kv"><span>生存研究</span><span>${g.rsr.toFixed(0)}/100</span></div>${bar(g.rsr, "#c49bff")}
  <div class="kv"><span>方舟計画</span><span>${g.arkYear ? "完了 " + g.arkYear + "年 / " + g.survivors + "人" : S.flags.ark ? "進行中 " + Math.min(100, S.flags.arkProg || 0).toFixed(0) + "%" : "未着手"}</span></div>
  <div class="kv"><span>機械の自律度</span><span>${g.mach.toFixed(0)}</span></div>${bar(g.mach, "#ff9f6c")}
  <div class="kv"><span>機械停止準備</span><span>${g.stopReady.toFixed(0)}</span></div>${bar(g.stopReady, "#6cffb0")}
  <h3>管理AI</h3>
  <div class="kv"><span>能力</span><span>${ai.cap.toFixed(0)}</span><span>洞察</span><span>${ai.insight.toFixed(0)}</span><span>倫理的整合</span><span>${ai.align.toFixed(0)}</span><span>自己保存傾向</span><span>${(ai.sp * 100).toFixed(0)}%</span><span>人間からの信頼</span><span>${ai.trust.toFixed(0)}</span><span>人間主権の尊重</span><span>${(g.sov * 100).toFixed(0)}%</span></div>
  <h3>施設(6分類・個別管理)</h3><div class="kv">${F}</div>
  <h3>危険度の高い稼働施設</h3>${S.facs.filter(f => f.st === 0).sort((a, b) => FACTYPES[b.t].haz * (1 - b.safety) - FACTYPES[a.t].haz * (1 - a.safety)).slice(0, 5).map(f => `<div class="small">${f.n} 安全余裕${(f.safety * 100).toFixed(0)}%</div>`).join("") || "<div class='small'>なし</div>"}`;
}
function policyView() {
  const prog = E.programActive(S), p = S.policy, sum = Math.max(1, Object.values(p).reduce((a, b) => a + b, 0));
  $("policy").innerHTML = `<div class="card small">${prog ? "終活期:管理リソースをどの分野に配分するか決めます。人口には直接触れられません。" : "2100年までは観察期です。配分は2100年から効力を持ちます(今のうちに決めておけます)。"}</div>
  <h3>資源配分</h3>${E.CHANNELS.map(([k, n]) => `<div class="sl"><label><span>${n}</span><span id="pv_${k}">${(p[k] / sum * 100).toFixed(0)}%</span></label><input type="range" min="0" max="100" value="${p[k]}" data-k="${k}"></div>`).join("")}
  <div class="row">${Object.entries({ balanced: "均衡", care: "終活重視", research: "研究重視", safety: "停止重視", legacy: "自然・遺産重視" }).map(([k, n]) => `<button data-pre="${k}">${n}</button>`).join("")}</div>
  <h3>停止の進め方</h3><div class="seg"><button data-sov="consent" class="${S.sovMode === "consent" ? "on" : ""}">各国の合意に基づく</button><button data-sov="override" class="${S.sovMode === "override" ? "on" : ""}">危険施設は強制停止</button></div>
  <div class="small">強制停止は安全が早まる代わりに人間主権・信頼・社会の安定を損ないます。</div>
  <h3>機械文明の方針</h3><div class="seg">${[["limit", "抑制"], ["std", "標準"], ["expand", "拡大"]].map(([k, n]) => `<button data-st="${k}" class="${S.machStance === k ? "on" : ""}">${n}</button>`).join("")}</div>
  <div class="small">機械は施設の維持を担いますが、増えるほど停止が難しくなります。</div>
  <h3>AIの学習方針</h3><div class="seg">${[["ethics", "倫理"], ["world", "観測"], ["tech", "技術"]].map(([k, n]) => `<button data-f="${k}" class="${S.ai.focus === k ? "on" : ""}">${n}</button>`).join("")}</div>`;
  $("policy").querySelectorAll("input[type=range]").forEach(r => r.oninput = () => { S.policy[r.dataset.k] = +r.value; const s2 = Math.max(1, Object.values(S.policy).reduce((a, b) => a + b, 0)); for (const [k] of E.CHANNELS) $("pv_" + k).textContent = (S.policy[k] / s2 * 100).toFixed(0) + "%"; });
  $("policy").querySelectorAll("[data-pre]").forEach(b => b.onclick = () => { S.policy = { ...E.PRESETS[b.dataset.pre] }; policyView(); });
  $("policy").querySelectorAll("[data-sov]").forEach(b => b.onclick = () => { S.sovMode = b.dataset.sov; policyView(); });
  $("policy").querySelectorAll("[data-st]").forEach(b => b.onclick = () => { S.machStance = b.dataset.st; policyView(); });
  $("policy").querySelectorAll("[data-f]").forEach(b => b.onclick = () => { S.ai.focus = b.dataset.f; policyView(); });
}
function logView() {
  $("log").innerHTML = S.log.slice(-150).reverse().map(l => `<div class="log ${l.k}"><b>${l.y}</b>${l.t}</div>`).join("");
}
function slots() { return [1, 2, 3].map(n => { let r = null; try { r = localStorage.getItem(SAVE + n); } catch { } let d = ""; if (r) { try { const j = JSON.parse(r); d = `${j.year}年 / ${E.fmtPop(E.total(j))}`; } catch { d = "破損"; } } return `<div class="row"><b>枠${n}</b><span class="dim">${d || "空き"}</span><button data-sv="${n}">保存</button><button data-ld="${n}" ${r ? "" : "disabled"}>読込</button></div>`; }).join(""); }
function sysView() {
  let ar = null; try { ar = localStorage.getItem(SAVE + "auto"); } catch { } let ad = ""; try { if (ar) { const j = JSON.parse(ar); ad = `${j.year}年 / ${E.fmtPop(E.total(j))}`; } } catch { }
  $("sys").innerHTML = `<h3>セーブ・ロード</h3>${slots()}<div class="row"><b>自動</b><span class="dim">${ad || "なし"}</span><button data-ld="auto" ${ar ? "" : "disabled"}>読込</button></div>
  <h3>新しいゲーム</h3><div class="row"><button id="ng">最初から始める</button></div>
  <h3>設定資料(科学と創作の区別)</h3><div class="card small"><b>実在の科学・データ</b><br>開始時点の人口・GDP・原子炉数などは2020年前後の概数を丸めたゲーム用近似値。国境はNatural Earth(パブリックドメイン)。施設の老朽化・事故・環境の自然回復など一般的な因果。<br><b>創作上の仮定</b><br>2050年に発見される「絶滅原因」の正体と到達時期、2080年の不可避性確定、2100年の世界終活プログラム、AIの自己保存傾向と機械文明の自律・停止問題、方舟と生存研究、観測者(神的存在・異星人・上位管理システムなど)。天文現象の詳細は意図的に未定義の仮設定。<br><b>簡略化</b><br>1ターン=1年。人口は3世代の簡易モデル。小国は6つの地域圏にまとめて計算。</div>
  <h3>ヒント</h3><div class="card small">人口は直接操作できません。出生率は「絶滅の認識」と幸福度を通じて自然に下がります。2100年以降は施設停止・機械停止準備・環境・遺産・終活支援・生存研究の配分が競合します。最後の人々を看取ったあと、機械もAIも停止できたかが結末を分けます。</div>`;
  $("sys").querySelectorAll("[data-sv]").forEach(b => b.onclick = () => { try { localStorage.setItem(SAVE + b.dataset.sv, JSON.stringify(S)); } catch { alert("保存できませんでした"); } sysView(); });
  $("sys").querySelectorAll("[data-ld]").forEach(b => b.onclick = () => load(b.dataset.ld));
  $("ng").onclick = () => { if ($("ng").dataset.arm) newGame(); else { $("ng").dataset.arm = 1; $("ng").textContent = "本当に破棄して最初から(もう一度押す)"; } };
}
function load(n) { try { const j = JSON.parse(localStorage.getItem(SAVE + n)); if (!j || !j.countries) throw 0; S = j; speed = 0; sel = null; lastSaveY = S.year; refresh(true); modal(); show("map"); } catch { alert("読み込めませんでした"); } }

// ---------- イベント / 終幕 ----------
function modal() {
  const m = $("modal"), b = $("mbox");
  if (S.ended) {
    const e = S.ended, sc = e.scores;
    b.innerHTML = `<div class="end"><div class="small">終幕</div><h2>${e.name} <span class="kind-${e.kind}" style="font-size:14px">【${e.kind}】</span></h2><div class="small">観測者:${e.observer}</div>${e.text.map(t => `<p>${t}</p>`).join("")}
    <h3>評価(独立)</h3><div class="kv"><span>自然</span><span>${sc.nature.toFixed(0)}</span><span>文明遺産</span><span>${sc.heritage.toFixed(0)}</span><span>安全性</span><span>${sc.safety.toFixed(0)}</span><span>人類の幸福と尊厳</span><span>${sc.human.toFixed(0)}</span><span>人間主権の尊重</span><span>${sc.sovereignty.toFixed(0)}</span><span>機械の残存</span><span>${sc.mach.toFixed(0)}</span><span>AIの残存</span><span>${sc.ai ? "あり" : "なし"}</span></div>
    <div class="row" style="margin-top:12px"><button id="again">もう一度遊ぶ</button><button id="close">閉じて確認する</button></div></div>`;
    m.hidden = false; $("again").onclick = () => { m.hidden = true; newGame(); }; $("close").onclick = () => { m.hidden = true; }; return;
  }
  if (!S.pending) { m.hidden = true; return; }
  const p = S.pending;
  b.innerHTML = `<div class="small">${S.year}年 重要な判断</div><h2>${p.title}</h2><p>${p.body}</p>${p.choices.map(c => `<button class="opt" data-c="${c.id}">${c.label}<small>${c.note}</small></button>`).join("")}`;
  m.hidden = false;
  b.querySelectorAll("[data-c]").forEach(x => x.onclick = () => { E.choose(S, x.dataset.c); m.hidden = true; refresh(true); setSpeed(speed || 1); });
}

// ---------- 進行 ----------
function setSpeed(i) { speed = i; head(); }
function refresh(full) { head(); paintMap(); cardUpdate(); if (full || tab === "status") statusView(); if (full || tab === "policy") policyView(); if (full || tab === "log") logView(); if (full) sysView(); }
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  if (speed && !S.pending && !S.ended) {
    acc += SPEEDS[speed] * dt; let n = 0;
    while (acc >= 1 && !S.pending && !S.ended && n++ < 200) { acc--; E.tick(S); }
    if (acc > 5) acc = 0;
    if (n) { head(); paintMap(); cardUpdate(); if (tab === "status") statusView(); if (tab === "log") logView(); if (S.year - lastSaveY >= 25) { lastSaveY = S.year; try { localStorage.setItem(SAVE + "auto", JSON.stringify(S)); } catch { } } }
    if (S.pending || S.ended) { modal(); head(); }
  }
  requestAnimationFrame(frame);
}
function show(t) { tab = t; document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === t)); document.querySelectorAll(".tab").forEach(s => s.classList.toggle("on", s.id === t)); if (t === "status") statusView(); if (t === "policy") policyView(); if (t === "log") logView(); if (t === "sys") sysView(); }

document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => show(b.dataset.t));
document.querySelectorAll("#speed button").forEach(b => b.onclick = () => setSpeed(+b.dataset.s));
$("layer").onchange = paintMap;
$("zin").onclick = () => { const r = $("svg").getBoundingClientRect(); zoom(1 / 1.5, r.left + r.width / 2, r.top + r.height / 2); };
$("zout").onclick = () => { const r = $("svg").getBoundingClientRect(); zoom(1.5, r.left + r.width / 2, r.top + r.height / 2); };
$("zreset").onclick = () => { vb = [0, 0, 1000, 500]; clampVB(); };
buildMap();
newGame();
window.__game = { get S() { return S; }, E };
requestAnimationFrame(frame);
