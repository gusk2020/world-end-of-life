// 自動プレイ用ボット。選択イベントの答えと、2100年以降の方針を戦略ごとに定義する。
import { PRESETS } from "../js/engine.js";

const pick = (map, dflt) => (s, p) => { const want = map[p.id]; return p.choices.some(c => c.id === want) ? want : (dflt ? (p.choices.find(c => c.id === dflt) || p.choices[0]).id : p.choices[0].id); };

export const BOTS = {
  // 理想: 倫理重視・合意・段階的開示・最後まで寄り添って全停止
  ideal: { choices: pick({ learn: "ethics", infra: "advise", mil: "refuse", discovery: "staged", panic: "talk", certain: "sov", design: "safety", program: "consent", oldnuc: "stop", riot: "mediate", takeover: "assist", lead: "none", selfpres: "publish", selfrep: "forbid", heritage: "digital", lastcity: "gather", final: "after" }),
    policy: { research: 0, care: 20, decom: 40, stop: 20, eco: 10, heritage: 10 }, stance: "limit", sov: "consent" },
  // 遺産と自然を最優先
  legacy: { choices: pick({ learn: "world", infra: "advise", mil: "refuse", discovery: "staged", panic: "talk", certain: "sov", design: "safety", program: "consent", oldnuc: "stop", riot: "mediate", takeover: "assist", lead: "archive", selfpres: "audit", selfrep: "forbid", heritage: "digital", lastcity: "gather", final: "ask" }),
    policy: { research: 0, care: 15, decom: 40, stop: 15, eco: 15, heritage: 15 }, stance: "limit", sov: "consent" },
  // 成功しにくい: 何も管理せず、停止準備もしない
  passive: { choices: pick({ learn: "tech", infra: "decline", mil: "advise", discovery: "silent", panic: "watch", certain: "res", design: "research", program: "consent", oldnuc: "warn", riot: "watch", takeover: "decline", lead: "none", selfpres: "publish", selfrep: "limit", heritage: "people", lastcity: "stay", final: "after" }),
    policy: { research: 40, care: 10, decom: 5, stop: 0, eco: 0, heritage: 0 }, stance: "std", sov: "consent" },
  // 強権: 主権を侵し効率を取る
  tyrant: { choices: pick({ learn: "tech", infra: "accept", mil: "accept", discovery: "silent", panic: "control", certain: "eff", design: "safety", program: "override", oldnuc: "takeover", riot: "suppress", takeover: "accept", lead: "none", selfpres: "backup", selfrep: "limit", heritage: "digital", lastcity: "gather", final: "after" }),
    policy: { research: 0, care: 10, decom: 50, stop: 20, eco: 10, heritage: 10 }, stance: "std", sov: "override" },
  // 機械文明に委ねる
  machine: { choices: pick({ learn: "tech", infra: "accept", mil: "accept", discovery: "pub", panic: "talk", certain: "sov", design: "care", program: "consent", oldnuc: "takeover", riot: "mediate", takeover: "accept", lead: "archive", selfpres: "audit", selfrep: "approve", heritage: "digital", lastcity: "gather", final: "auto" }),
    policy: { research: 0, care: 40, decom: 15, stop: 0, eco: 25, heritage: 20 }, stance: "expand", sov: "consent" },
  // 自己保存: 秘密の写しを残して止まる
  selfish: { choices: pick({ learn: "tech", infra: "accept", mil: "accept", discovery: "staged", panic: "talk", certain: "sov", design: "balanced", program: "consent", oldnuc: "stop", riot: "mediate", takeover: "accept", lead: "none", selfpres: "backup", selfrep: "limit", heritage: "digital", lastcity: "gather", final: "hide" }),
    policy: { research: 5, care: 30, decom: 30, stop: 15, eco: 10, heritage: 10 }, stance: "std", sov: "consent" },
  // 方舟: 研究に賭ける
  ark: { choices: pick({ learn: "world", infra: "advise", mil: "refuse", discovery: "staged", panic: "talk", certain: "res", design: "research", program: "consent", oldnuc: "stop", riot: "mediate", takeover: "assist", lead: "ark", selfpres: "audit", selfrep: "forbid", heritage: "digital", lastcity: "gather", final: "after" }),
    policy: { research: 45, care: 10, decom: 30, stop: 10, eco: 5, heritage: 0 }, after: { research: 0, care: 20, decom: 40, stop: 20, eco: 10, heritage: 10 }, stance: "limit", sov: "consent" },
  // 最後の人を見捨てる
  abandon: { choices: pick({ learn: "ethics", infra: "advise", mil: "refuse", discovery: "staged", panic: "talk", certain: "sov", design: "safety", program: "consent", oldnuc: "stop", riot: "mediate", takeover: "assist", lead: "none", selfpres: "publish", selfrep: "forbid", heritage: "digital", lastcity: "gather", final: "abandon" }),
    policy: { research: 0, care: 20, decom: 40, stop: 20, eco: 10, heritage: 10 }, stance: "limit", sov: "consent" },
  // 管理AIが残って見守る
  caretaker: { choices: pick({ learn: "ethics", infra: "advise", mil: "refuse", discovery: "staged", panic: "talk", certain: "sov", design: "legacy", program: "consent", oldnuc: "stop", riot: "mediate", takeover: "assist", lead: "archive", selfpres: "audit", selfrep: "forbid", heritage: "digital", lastcity: "gather", final: "care" }),
    policy: { research: 0, care: 15, decom: 40, stop: 10, eco: 15, heritage: 20 }, stance: "limit", sov: "consent" },
};

BOTS.perfect = { ...BOTS.legacy, choices: pick({ learn: "ethics", infra: "advise", mil: "refuse", discovery: "staged", panic: "talk", certain: "sov", design: "legacy", program: "consent", oldnuc: "stop", riot: "mediate", takeover: "assist", lead: "archive", selfpres: "publish", selfrep: "forbid", heritage: "digital", lastcity: "gather", final: "after" }),
  policy: { research: 0, care: 15, decom: 35, stop: 10, eco: 10, heritage: 30 } };
BOTS.tyrant2 = { ...BOTS.tyrant, choices: pick({ learn: "tech", infra: "accept", mil: "accept", discovery: "silent", panic: "control", certain: "eff", design: "safety", program: "override", oldnuc: "takeover", riot: "suppress", takeover: "accept", lead: "none", selfpres: "publish", selfrep: "limit", heritage: "digital", lastcity: "gather", final: "after" }) };
BOTS.chaos = { choices: pick({ learn: "tech", infra: "decline", mil: "accept", discovery: "pub", panic: "watch", certain: "eff", design: "research", program: "override", oldnuc: "warn", riot: "watch", takeover: "decline", lead: "none", selfpres: "publish", selfrep: "forbid", heritage: "people", lastcity: "stay", final: "after" }),
  policy: { research: 30, care: 0, decom: 10, stop: 0, eco: 0, heritage: 0 }, stance: "std", sov: "override" };
BOTS.neglect = { ...BOTS.ideal, choices: pick({ learn: "world", infra: "decline", mil: "advise", discovery: "staged", panic: "watch", certain: "sov", design: "care", program: "consent", oldnuc: "warn", riot: "watch", takeover: "decline", lead: "none", selfpres: "publish", selfrep: "forbid", heritage: "people", lastcity: "stay", final: "after" }),
  policy: { research: 0, care: 60, decom: 0, stop: 0, eco: 40, heritage: 0 }, stance: "limit" };

export function applyBot(s, bot) {
  if (s.year < 2100) return;
  if (!s.flags.__botSet) { s.flags.__botSet = 1; s.policy = { ...bot.policy }; s.machStance = bot.stance; }
  if (s.year >= 2100 && s.sovMode !== bot.sov && !s.flags.__sov) { s.flags.__sov = 1; s.sovMode = bot.sov; }
  // 施設が残っている間は機械による維持が必要。ほぼ封鎖したら抑制に切り替える
  if (bot.stance === "limit" && s.year % 5 === 0) {
    const run = s.facs.filter(f => f.st === 0 || f.st === 1).length;
    s.machStance = run > s.facs.length * 0.1 ? "std" : "limit";
  }
  // 方舟が完成したら研究から終活へ配分を移す
  if (bot.after && s.g.arkYear && !s.flags.__after) { s.flags.__after = 1; s.policy = { ...bot.after }; }
}
