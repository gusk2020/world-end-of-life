// 保護対象の遺産。type: cultural=文化遺産 / natural=自然遺産 / mixed=複合遺産 / original=ゲーム独自の候補
// 実在の対象は世界遺産(登録年はおおよそ・簡略化)。original は実在の登録ではなく、このゲームだけの架空の候補。
// [id, 名称, type, 国/地域ID, 登録年(実在のみ), 価値1-5]
const L = [
  ["machu", "マチュ・ピチュ", "mixed", "PER", 1983, 5],
  ["taishan", "泰山", "mixed", "CHN", 1987, 4],
  ["tongariro", "トンガリロ国立公園", "mixed", "OCE", 1990, 3],
  ["giza", "メンフィスとそのネクロポリス(ギザのピラミッド)", "cultural", "EGY", 1979, 5],
  ["greatwall", "万里の長城", "cultural", "CHN", 1987, 5],
  ["taj", "タージ・マハル", "cultural", "IND", 1983, 5],
  ["kyoto", "古都京都の文化財", "cultural", "JPN", 1994, 4],
  ["himeji", "姫路城", "cultural", "JPN", 1993, 3],
  ["acropolis", "アテネのアクロポリス", "cultural", "EUR", 1987, 5],
  ["venice", "ヴェネツィアとその潟", "cultural", "ITA", 1987, 4],
  ["versailles", "ヴェルサイユ宮殿と庭園", "cultural", "FRA", 1979, 3],
  ["montsaint", "モン・サン・ミシェル", "cultural", "FRA", 1979, 3],
  ["stonehenge", "ストーンヘンジ", "cultural", "GBR", 1986, 4],
  ["cologne", "ケルン大聖堂", "cultural", "DEU", 1996, 3],
  ["istanbul", "イスタンブール歴史地域", "cultural", "TUR", 1985, 4],
  ["gobekli", "ギョベクリ・テペ", "cultural", "TUR", 2018, 4],
  ["borobudur", "ボロブドゥールの仏教寺院群", "cultural", "IDN", 1991, 4],
  ["angkor", "アンコール", "cultural", "ASI", 1992, 5],
  ["petra", "ペトラ", "cultural", "MEC", 1985, 4],
  ["lalibela", "ラリベラの岩の聖堂群", "cultural", "ETH", 1978, 3],
  ["bagan", "バガン", "cultural", "MMR", 2019, 3],
  ["liberty", "自由の女神像", "cultural", "USA", 1984, 2],
  ["kremlin", "モスクワのクレムリンと赤の広場", "cultural", "RUS", 1990, 3],
  ["yellowstone", "イエローストーン国立公園", "natural", "USA", 1978, 4],
  ["yakushima", "屋久島", "natural", "JPN", 1993, 3],
  ["baikal", "バイカル湖", "natural", "RUS", 1996, 4],
  ["reef", "グレート・バリア・リーフ", "natural", "AUS", 1981, 5],
  ["serengeti", "セレンゲティ国立公園", "natural", "TZA", 1981, 4],
  ["amazon", "中央アマゾン保全地域群", "natural", "BRA", 2000, 5],
  ["galapagos", "ガラパゴス諸島", "natural", "LAM", 1978, 5],
  ["iguazu", "イグアス国立公園", "natural", "ARG", 1984, 3],
  ["victoria", "ヴィクトリアの滝(モシ・オ・トゥニャ)", "natural", "AFR", 1989, 3],
  // ゲーム独自の候補(実在の登録情報ではない)
  ["o_archive", "最後の街の記録庫", "original", "JPN", null, 3],
  ["o_sarcophagus", "石棺化された原子炉群", "original", "FRA", null, 3],
  ["o_forestcity", "森に還る無人都市", "original", "USA", null, 3],
  ["o_core", "旧管理AIセンター(停止したコアの安置所)", "original", "CHN", null, 3],
];
export const SITES = L.map(([id, name, type, cid, year, v]) => ({ id, name, type, cid, year, v, real: type !== "original" }));
export const TYPE_NAME = { cultural: "文化遺産", natural: "自然遺産", mixed: "複合遺産", original: "ゲーム独自候補" };
export const MODES = ["未決定", "保護", "記録保存", "自然還元"];
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

export function initSites() { return SITES.map(() => ({ st: 0, cond: 1, rec: false })); }

// 状態を1年進める。戻り値は他の指標への寄与。
export function stepSites(s, ctx) {
  const g = s.g; let bio = 0, hm = 0, drain = 0;
  SITES.forEach((d, i) => {
    const x = s.sites[i], c = s.countries.find(k => k.id === d.cid);
    const labour = c && !c.extinct ? c.m : Math.min(1, (g.machRemain || 0) / 60);
    let rate = .0018 + .01 * (c && !c.extinct ? c.unrest : 0) + (1 - ctx.hum) * .0025;
    if (x.st === 1) rate *= labour > .3 ? .12 : .3;
    if (x.st === 3) rate = .02;
    x.cond = clamp(x.cond - rate, 0, 1);
    if (x.st === 1) { if (labour > .3) drain += .0003 * d.v; hm += .0015 * d.v * x.cond; }
    if (x.st === 2) hm += .0007 * d.v;
    if (x.st === 3) {
      if (d.type === "natural" || d.type === "mixed") bio += .4 * d.v; else bio += .12 * d.v;
      if (d.type !== "natural") hm -= .002 * d.v * (1 - x.cond * .5);
    }
  });
  g.res = clamp(g.res - drain, 0, 100);
  g.sitesBio = clamp(bio, 0, 12); g.hMod = clamp(hm, -.04, .05);
}
export function siteValue(i, x) {
  const d = SITES[i];
  if (x.st === 3) return d.type === "natural" || d.type === "mixed" ? .75 : .3;
  if (x.st === 2) return Math.max(.6, x.cond * .8);
  if (x.st === 1) return x.cond;
  return Math.max(x.cond * .85, x.rec ? .6 : 0);
}
export function siteScore(s) {
  let a = 0, b = 0; SITES.forEach((d, i) => { a += d.v * siteValue(i, s.sites[i]); b += d.v; }); return a / b;
}
export function setSite(s, id, mode) {
  const i = SITES.findIndex(d => d.id === id); if (i < 0) return;
  const x = s.sites[i], d = SITES[i]; if (x.st === mode) return;
  if (mode === 2 && !x.rec) { x.rec = true; s.g.res = clamp(s.g.res - .02 * d.v, 0, 100); s.g.arch = clamp(s.g.arch + d.v * .5, 0, 100); }
  x.st = mode;
}
export function applySitePolicy(s, policy) {
  SITES.forEach((d, i) => {
    if (s.sites[i].st !== 0) return;
    let m = 0;
    if (policy === "protect") m = 1; else if (policy === "record") m = 2;
    else if (policy === "select") m = d.type === "natural" || d.type === "mixed" ? 3 : d.v >= 4 ? 1 : 2;
    if (m) setSite(s, d.id, m);
  });
}
export const undecided = (s) => s.sites.filter(x => x.st === 0).length;
export function siteSummary(s) {
  const n = [0, 0, 0, 0]; let lost = []; s.sites.forEach((x, i) => { n[x.st]++; if (x.cond < .15 && x.st !== 3 && x.st !== 2) lost.push(SITES[i].name); });
  return { n, lost };
}
