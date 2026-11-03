// 天文現象の強度(時代で変わる)と、人類以外の大型哺乳類。DOM非依存。engine.js から呼ばれる。
//
// 【科学的に実在すること】宇宙線や太陽フレアが電子機器に誤動作(ソフトエラー)を起こすことは実在する。
//   超新星やガンマ線バーストが生物圏に影響しうるという仮説は、科学者の間でも議論されている。
// 【本作の創作仮説】「絶滅原因」の正体・到達時期・影響の強さが数百年かけて波打つこと・影響が大型哺乳類(人類を含む)にのみ
//   直接作用すること・AIのコアが影響を受けること。いずれも作品固有の仮設定で、現実に示された事実ではない。
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

export const MAMMAL_DEFINITION = "大型哺乳類 = 成体の体重がおよそ10kg以上の、人類以外の哺乳類。野生の4群と家畜・伴侶動物の1群の計5群を扱う。小型の哺乳類、昆虫・爬虫類・魚類・両生類・鳥類・細菌類・植物は、今回の天文現象の直接の影響を受けない(ただし生態系を通じた間接影響は起こりうる)。個体数はゲーム用の概数。";
// vuln=天文現象への感受性, wild=野生か
export const GROUPS = [
  { id: "carn", name: "大型肉食獣", desc: "ライオン・クマ・オオカミ・大型ネコ科など", n0: 4.0e6, rb: .10, rd: .09, vuln: 1.0, wild: true },
  { id: "herb", name: "大型草食獣(野生)", desc: "ゾウ・サイ・シカ・野生のウシ科など", n0: 1.2e8, rb: .22, rd: .21, vuln: .9, wild: true },
  { id: "prim", name: "霊長類(人類を除く)", desc: "類人猿・大型のサル類", n0: 3.0e7, rb: .12, rd: .11, vuln: 1.1, wild: true },
  { id: "sea", name: "海棲哺乳類", desc: "クジラ・イルカ・アザラシなど", n0: 1.0e8, rb: .12, rd: .115, vuln: .8, wild: true },
  { id: "dom", name: "家畜・伴侶動物(大型)", desc: "ウシ・ブタ・ヒツジ・ウマ・イヌなど。人類の世話に依存", n0: 5.0e9, rb: .40, rd: .39, vuln: .9, wild: false },
];
export const WILDLAND = { human: .1, balanced: .4, wild: .7 };
export const STANCE_NAME = { human: "人類優先", balanced: "均衡", wild: "野生優先" };

export function initMammals() { return GROUPS.map(g => ({ n: g.n0, bb: 0, dd: 0, hab: 1, w: .7, ext: null })); }
export const mammalN0 = () => GROUPS.reduce((p, g) => p + g.n0, 0);
export function mammalTotals(s) {
  let alive = 0, dead = 0, born = 0; s.mam.forEach(m => { alive += m.n; dead += m.dd; born += m.bb; });
  return { alive, dead, born, ever: mammalN0() + born };
}
export function wildAlive(s) { let a = 0, a0 = 0; GROUPS.forEach((g, i) => { if (g.wild) { a += s.mam[i].n; a0 += g.n0; } }); return { alive: a, n0: a0 }; }

// ---------- 天文現象 ----------
export function exposureOf(id) { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997; return .75 + .5 * (h / 996); } // 地域ごとの遮蔽の差(創作)
export function astroState(yr, seed) {
  const b = clamp((yr - 2040) / 650, 0, 1), base = Math.pow(b, .9) * 1.5 + Math.max(0, yr - 2690) * .0012; // 2690年以降も原因はゆっくり強まり続ける(遮蔽でしのげる期間は有限)
  const amp = .3 * Math.min(1, b * 4 + .15), phi = ((Math.imul(seed | 0, 2654435761) >>> 0) % 628) / 100;
  const osc = yr < 2050 ? 0 : amp * Math.sin(2 * Math.PI * (yr - 2040) / 160 + phi);
  return { base, osc, amp, lull: yr < 2050 ? 0 : clamp(-osc / amp, 0, 1), peak: yr < 2050 ? 0 : clamp(osc / amp, 0, 1) };
}
export function stepAstro(s, add) {
  const g = s.g, a = astroState(s.year, s.seed);
  g.surge = (g.surge || 0) * .92;
  g.lull = a.lull; g.peak = a.peak;
  if (s.year >= 2050) {
    const ph = a.lull > .5 ? "lull" : a.peak > .6 ? "peak" : "mid";
    if (ph !== g.astroPhase) {
      const prev = g.astroPhase; g.astroPhase = ph;
      if (ph === "peak") { g.surge += .2; add(`【天文】放射が強まる活発期に入った。AIコアの故障と生物の出生の減少が増える。人々の絶望は深まりやすい。`); }
      else if (ph === "lull" && prev) add(`【天文】放射が弱まる静穏期に入った。生活が安定し希望が残る地域では、出生率が持ち直し、人口の減少が止まることがある(終活支援・幸福・資源が条件)。`);
      else if (ph === "mid" && prev) add(`【天文】${prev === "lull" ? "静穏期が終わり、放射は再び強まりはじめた。" : "活発期が過ぎ、放射はやや落ち着いた。"}`);
    }
  }
  g.astro = clamp(a.base + a.osc + g.surge, 0, 1.8);
}
export function coreFailRate(s) {
  const g = s.g, shield = clamp(.5 * g.rsr / 100 + .35 * (s.flags.shield || 0), 0, .85);
  return .0005 + .03 * Math.pow(clamp(g.astro - .2, 0, 1.6), 1.4) * (1 - shield);
}

// ---------- 大型哺乳類 ----------
// ctx: { pr: 人口比, bio: 生物圏, prot: 保護の強さ0-1(終活期の配分), care: 0-1 }
export function stepMammals(s, ctx, add) {
  const g = s.g, A = g.astro, wl = WILDLAND[s.wildStance || "balanced"] + .2 * ctx.prot;
  const prF = Math.min(1.3, ctx.pr), care = s.flags.wildCare ? .12 : 0;
  GROUPS.forEach((G, i) => {
    const m = s.mam[i]; if (m.n <= 0) return;
    const protG = G.wild ? clamp(ctx.prot * (G.id === "sea" ? .6 : 1) + care, 0, 1) : 0;
    let K;
    if (G.wild) {
      const habT = clamp(1 + .6 * (1 - prF) * (.3 + wl) + .15 * ctx.prot, .3, 1.3);
      m.hab += (habT - m.hab) * .03;
      K = G.n0 * m.hab * (.55 + .45 * ctx.bio / 78);
    } else K = G.n0 * Math.pow(Math.max(prF, 0), .9);
    const fm = clamp(1 - .9 * A * G.vuln, .03, 1) * (1 + .6 * protG);
    const thr = protG > .5 ? 20 : 100;
    let births = m.n >= thr ? m.n * G.rb * fm * (1 + .6 * Math.max(-.5, (K - m.n) / Math.max(1, K))) : 0;
    const starv = m.n > K ? Math.min(1, (m.n - K) / Math.max(1, K)) : 0;
    let deaths = m.n * G.rd * (1 - .5 * protG) * (1 + .5 * A * G.vuln) + m.n * .35 * starv + (K < m.n * .02 ? m.n * .4 : 0);
    let n2 = m.n + births - deaths;
    if (n2 < 1) { deaths = m.n + births; n2 = 0; m.ext = s.year; if (G.wild) add(`${s.year}年、${G.name}の最後の個体が死んだ。${protG > .4 ? "保護の手は届いたが、天文現象による出生の減少には勝てなかった。" : "保護の手が届かないまま、静かに途絶えた。"}`); }
    m.n = n2; m.bb += births; m.dd += deaths;
    m.w = G.wild ? clamp(.35 + .35 * Math.min(1, m.hab) + .25 * protG - .3 * starv - .3 * Math.min(1, A * G.vuln) * (1 - .7 * protG), 0, 1) : clamp(.4 + .4 * ctx.care - .3 * (1 - Math.min(1, ctx.pr * 3)), 0, 1);
    if (G.wild) { g.wAcc = (g.wAcc || 0) + m.w * m.n; g.wW = (g.wW || 0) + m.n; }
  });
  if (g.mamWildExt == null && GROUPS.every((G, i) => !G.wild || s.mam[i].n <= 0)) g.mamWildExt = s.year;
}
// 大型哺乳類が担う生態系の機能(1=健全)。減ると生物圏(植物・昆虫など)に間接的な悪影響が出る。
export function ecoFunction(s) {
  const f = (id) => { const i = GROUPS.findIndex(G => G.id === id); return clamp(s.mam[i].n / GROUPS[i].n0, 0, 1); };
  return clamp(1 - .5 * (1 - f("herb")) - .3 * (1 - f("carn")) - .2 * (1 - f("prim")), 0, 1);
}
// 評価: 絶滅までの福祉・生息環境・生き延びた時間・生態系への影響(絶滅が不可避でも、保護の意味は評価に残る)
export function mammalScore(s) {
  const g = s.g, wMean = g.wW ? g.wAcc / g.wW : .5;
  let hab = 0, k = 0; GROUPS.forEach((G, i) => { if (G.wild) { hab += Math.min(1, s.mam[i].hab); k++; } }); hab /= k;
  const ext = g.mamWildExt ?? Math.max(s.year, 2600), time = clamp((ext - 2060) / 500, 0, 1);
  const eco = g.ecoMean ? g.ecoSum / g.ecoMean : ecoFunction(s);
  return { score: 100 * (.4 * wMean + .2 * hab + .2 * time + .2 * eco), welfare: wMean, habitat: hab, time, eco, extYear: g.mamWildExt };
}
