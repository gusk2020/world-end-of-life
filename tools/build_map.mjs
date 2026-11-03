// world-atlas(110m)から、国境付きの簡易SVG地図データ js/mapdata.js を生成する。
// 使い方: NODE_PATH=<node_modules親> node tools/build_map.mjs  (world-atlas, topojson-client, world-countries が必要)
import { createRequire } from "module";
import fs from "fs";
import { COUNTRY_DEFS } from "../js/data.js";
const require = createRequire(process.env.WB ? process.env.WB + "/" : import.meta.url);
const topo = JSON.parse(fs.readFileSync(require.resolve("world-atlas/countries-110m.json")));
const { feature } = require("topojson-client");
const wc = require("world-countries");
const byNum = {}; for (const c of wc) byNum[c.ccn3] = c;
const listed = new Set(COUNTRY_DEFS.map(c => c.id));
const W = 1000, H = 500;
const px = (lon, lat) => [((lon + 180) / 360 * W), ((90 - lat) / 180 * H)];
function bloc(c) {
  if (!c) return "AFR";
  const r = c.region, s = c.subregion;
  if (r === "Africa") return "AFR";
  if (r === "Europe") return "EUR";
  if (r === "Oceania") return "OCE";
  if (r === "Americas") return c.cca3 === "GRL" ? "EUR" : "LAM";
  if (s === "Western Asia" || s === "Central Asia") return "MEC";
  if (r === "Asia") return "ASI";
  return "ASI";
}
const manual = { "Kosovo": "EUR", "N. Cyprus": "EUR", "Somaliland": "AFR", "Antarctica": null };
const fc = feature(topo, topo.objects.countries).features;
const out = [];
for (const f of fc) {
  const name = f.properties.name;
  if (name === "Antarctica") continue;
  const c = byNum[String(f.id).padStart(3, "0")];
  let e = c && listed.has(c.cca3) ? c.cca3 : (name in manual ? manual[name] : bloc(c));
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let d = "";
  for (const poly of polys) for (const ring of poly) {
    d += ring.map((p, i) => { const [x, y] = px(p[0], p[1]); return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }).join("") + "Z";
  }
  out.push({ n: name, e, d });
}
fs.writeFileSync(new URL("../js/mapdata.js", import.meta.url),
  "// 自動生成: tools/build_map.mjs (Natural Earth由来 world-atlas 110m, パブリックドメイン)\nexport const MAP_W = 1000, MAP_H = 500;\nexport const MAP = " + JSON.stringify(out) + ";\n");
console.log("countries:", out.length, "bytes:", JSON.stringify(out).length);
const miss = out.filter(o => !COUNTRY_DEFS.some(c => c.id === o.e)); console.log("unmapped:", miss.map(m => m.n));
