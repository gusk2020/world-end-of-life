// 3AI体制(tri) と、同じ仕組みで1つの方針にそろえた統一AI(unified)、従来の単一AI(legacy)の比較。固定シード。
// node tests/bench/triad.mjs <シード> <tri|unified|legacy>
import * as E from "../../js/engine.js";
const seed=+process.argv[2], mode=process.argv[3]; const s=E.newGame(seed); s.mode="auto"; let init=false; const legacy=mode==="legacy";
while(!s.ended&&s.year<6500){ if(!legacy&&s.year===2099&&!init){init=true;E.initTriad(s,["blue","green","orange"][seed%3]);}
 if(s.tri&&mode==="unified"&&s.year>=2100&&s.year%5===0){ const t=s.tri; const ps=t.ai.map((A,i)=>i===t.player?s.policy:A.policy).filter(Boolean); const avg={}; for(const k of E.TRI_KEYS){avg[k]=Math.round(ps.reduce((a,p)=>a+(p[k]||0),0)/ps.length)} s.policy={...avg}; for(const A of t.ai){ if(A.policy)A.policy={...avg}; A.open=.5;A.aggr=0;A.share=.5 } }
 E.tick(s); if(s.pending)E.choose(s,s.pending.choices.find(x=>x.id==="manual")?.id||s.pending.choices[0].id);}
const T=s.tri;console.log(JSON.stringify({seed,mode,ext:s.g.extinctYear,end:s.ended&&s.ended.id,human:s.ended&&Math.round(s.ended.scores.human),nature:s.ended&&Math.round(s.ended.scores.nature),heritage:s.ended&&Math.round(s.ended.scores.heritage),slips:T&&T.stat.slips,wars:T&&T.stat.wars,mir:!!s.flags.miracle}));
