// 世界の状態と選択に連動する短い描写。ランダムな飾りではなく、条件(人口比・幸福・不安・方針・遺産の扱い)で文面を決める。
const CITY = { USA: "ニューヨーク", CHN: "上海", IND: "ムンバイ", IDN: "ジャカルタ", PAK: "カラチ", BRA: "サンパウロ", NGA: "ラゴス", BGD: "ダッカ", RUS: "モスクワ", MEX: "メキシコシティ", JPN: "東京", ETH: "アディスアベバ", PHL: "マニラ", EGY: "カイロ", VNM: "ホーチミン", COD: "キンシャサ", TUR: "イスタンブール", IRN: "テヘラン", DEU: "ベルリン", THA: "バンコク", GBR: "ロンドン", FRA: "パリ", ITA: "ローマ", ZAF: "ヨハネスブルグ", TZA: "ダルエスサラーム", MMR: "ヤンゴン", KOR: "ソウル", COL: "ボゴタ", KEN: "ナイロビ", ESP: "マドリード", ARG: "ブエノスアイレス", DZA: "アルジェ", UKR: "キーウ", SDN: "ハルツーム", IRQ: "バグダッド", CAN: "トロント", POL: "ワルシャワ", MAR: "カサブランカ", SAU: "リヤド", PER: "リマ", MYS: "クアラルンプール", AUS: "シドニー", AFR: "アクラ", MEC: "ドバイ", ASI: "シンガポール", EUR: "アムステルダム", LAM: "サンティアゴ", OCE: "オークランド" };
export const cityOf = (id) => CITY[id] || id;
const cp = (c) => c.y + c.a + c.o;

export function era(s) {
  const y = s.year;
  if (s.g.extinctYear !== undefined) return "無人の時代";
  if (y < 2050) return "観察の時代";
  if (y < 2080) return "動揺の時代";
  if (y < 2100) return "準備の時代";
  const r = Object.values(s.countries).reduce((p, c) => p + cp(c), 0) / s.g.P0;
  return r > .5 ? "終活の前半" : r > .1 ? "終活の後半" : r > .001 ? "黄昏の時代" : "最後の世代";
}

// 国ごとの縮退描写(閾値を初めて下回った時に1回)
const STEPS = [[.5, "half"], [.2, "fifth"], [.05, "twentieth"], [.005, "last"]];
export function cityNarratives(s, emit) {
  if (s.year < 2060) return;
  let n = 0;
  for (const c of s.countries) {
    if (c.extinct && s.flags["nar:" + c.id + ":gone"]) continue;
    const r = cp(c) / c.P0, city = cityOf(c.id);
    if (c.extinct && !s.flags["nar:" + c.id + ":gone"]) { s.flags["nar:" + c.id + ":gone"] = 1; if (n++ < 3) emit(`${c.name}で最後の住人が亡くなった。${city}の灯りは、${s.g.mach > 25 ? "無人の機械だけが点検して回る" : "誰にも見られないまま消えた"}。`); continue; }
    for (const [th, key] of STEPS) {
      const f = "nar:" + c.id + ":" + key;
      if (r > th || s.flags[f]) continue;
      s.flags[f] = 1; if (n++ >= 3) continue;
      const care = s.policy.care / Math.max(1, Object.values(s.policy).reduce((a, b) => a + b, 0)) > .3;
      const mood = c.happy > .65 ? "穏やか" : c.happy < .4 ? "荒んだ" : "静か";
      const t = {
        half: `${city}の人通りが2020年の半分になった。${c.unrest > .5 ? "閉店する店の前で言い争いが絶えない。" : "商店街は日曜だけ開く店が増えた。"}`,
        fifth: `${c.name}の人口は2020年の2割。${city}の外周が封鎖され、住民は中心部に集まって暮らす。${care ? "巡回診療の車が毎朝回る。" : "診療所は週に数日しか開かない。"}`,
        twentieth: `${city}の機能は解体され、${s.g.bio > 55 ? "旧市街には森と川が戻り、鹿の群れが信号待ちをしていた道を横切る。" : "放棄された区画は、汚染の残る荒れ地のまま広がる。"}残った人々の暮らしは${mood}だ。`,
        last: `${c.name}の最後の集落。数十人が、${c.happy > .6 ? "夕食を囲み、昔の歌を歌っている" : "互いに言葉も少なく暮らしている"}。`,
      }[key];
      emit(t);
    }
  }
}

// 10年ごとの時代描写。時代・状態・選択から文面を決める。
export function decadeNarrative(s, ctx) {
  const e = era(s), g = s.g, hp = ctx.hp, pr = ctx.pr, out = [];
  const hist = ctx.siteSum;
  if (e === "観察の時代") out.push(g.pl > 50 ? "空気と海の傷みが年々数字に表れ、管理AIは各国の統計に小さな警告を添え続けている。" : "世界は成長を続け、あなたは学び続けている。人々はまだ、ここが終わりに向かうとは知らない。");
  else if (e === "動揺の時代") out.push(ctx.unrest > .4 ? "終わりを知った人々は二つに割れた。祈る者と、最後まで稼ぐ者。街角の演説が絶えない。" : "終わりの知らせは、思ったより静かに受け止められた。人々は家族と過ごす時間を増やしている。");
  else if (e === "準備の時代") out.push(s.flags.disclosure === "silent" ? "隠されていた事実が明るみに出たあとの不信は、まだ癒えていない。" : "各国は終活の準備を始めた。遺言、記録、施設台帳。紙とデータが山のように積まれていく。");
  else if (e === "終活の前半") out.push(g.mach > 40 ? "人手の足りない現場を、機械が黙々と埋めている。便利だが、止め方を知る人は減った。" : "子どもの声が減った学校は統合され、空いた校舎は図書館や診療所に姿を変えた。");
  else if (e === "終活の後半") out.push(hp > .6 ? "人々は旅をし、再会し、語り残している。終わりは悲しみだけではなかった。" : "社会の維持が難しくなり、人々は疲れている。AIは声をかけ、記録を取り続ける。");
  else if (e === "黄昏の時代") out.push(g.bio > 70 ? "人のいない大地に森が広がり、川は澄んだ。最後の世代は窓から鹿を眺めて暮らす。" : "自然は癒えきらないまま、人々だけが少なくなっていく。");
  else if (e === "最後の世代") out.push("世界に残るのは数千人。互いの顔を全員が知る共同体で、AIは最後の看取り手としてそばにいる。");
  else out.push(g.aiRemain ? "人のいない世界で、停止しなかった個体が観測を続けている。" : "世界は静かだ。止まった機械の上を、風と草が通り過ぎていく。");
  if (hist && e.startsWith("終活") && hist.n[1] + hist.n[2] > 0 && ctx.year % 50 === 0) out.push(`遺産の扱いは、保護${hist.n[1]}・記録${hist.n[2]}・自然還元${hist.n[3]}。${hist.lost.length ? "失われつつあるもの:" + hist.lost.slice(0, 2).join("、") + "。" : ""}`);
  if (pr < .5 && ctx.rs < 55 && e.startsWith("終活")) out.push("資源の余裕が細り、物流の遅れが各地で目立つ。");
  return out;
}
