// 進行の流れ(観察フェーズ)。DOM非依存で、シミュレーション(engine.js)の計算には手を加えない。
// 重要イベントの判断が確定するたびに「観察フェーズ」を挟み、世界地図と砂時計を見る時間をつくる。
//  - 停止: 観察中はゲーム時間を止める(直前の変化を砂時計の動きで振り返る)
//  - 低速: 観察中はゲーム時間をゆっくり進める。進んだ分だけ状態が更新される
//  - 観察中に起きたイベントは engine の S.pending に保留し(holdAuto)、観察の終了後に1件ずつ順番に処理する
//  - ユーザーの速度設定は変えない。観察の終了後はその速度に戻る。手動の一時停止は常に優先する
export const OBSERVE_SECS = [3, 5, 10];
export const STYLE_NAMES = { stop: "ゲーム時間停止", slow: "低速進行" };
export const SLOW_YPS = 0.5; // 低速観察: 2秒でゲーム内1年

export class FlowController {
  constructor(prefs) { this.prefs = prefs; this.active = false; this.remain = 0; this.total = 0; }
  start() { this.active = true; this.total = this.remain = OBSERVE_SECS.includes(this.prefs.sec) ? this.prefs.sec : 5; } // 二重に呼ばれても、タイマーは1本(残りを戻すだけ)
  advance(dt) { if (this.active) this.remain = Math.max(0, this.remain - dt); }
  done() { return this.active && this.remain <= 0; }
  end() { this.active = false; this.remain = 0; }
  cancel() { this.end(); }
  // 観察中のゲーム時間の進み(年/秒)。手動の一時停止中は0
  rate(paused) { if (!this.active || paused) return 0; return this.prefs.style === "slow" ? SLOW_YPS : 0; }
}

export class Session {
  constructor(E, prefs) { this.E = E; this.prefs = prefs; this.flow = new FlowController(prefs); this.acc = 0; this.S = null; this.lastAuto = null; this.afterTick = null; }
  bind(S) { this.S = S; if (S) S.holdAuto = false; this.flow.cancel(); this.acc = 0; this.lastAuto = null; } // 新規・ロード時は観察を破棄(保留中のイベントはSに残る)
  get observing() { return this.flow.active; }
  startObserve() { if (!this.prefs.sec) return; this.flow.start(); this.S.holdAuto = true; this.acc = 0; } // sec=0 は観察なし(テストの基準用。画面からは選べない)
  // dt: 実時間の経過(秒)。paused: 手動の一時停止。speed: ユーザー設定の速度(年/秒)。blocked: 他の画面で止めている
  frame(dt, { paused, speed, blocked, budgetMs }) {
    const S = this.S, out = { ticks: 0, autoDecisions: 0, started: false, ended: false };
    if (!S) return out;
    if (S.ended) { if (this.flow.active) { this.flow.cancel(); S.holdAuto = false; } return out; }
    if (blocked) return out;
    if (this.flow.active) {
      if (!paused) this.flow.advance(dt);                         // 一時停止中は観察のタイマーも止まる(再開で続き)
      const rate = this.flow.rate(paused);
      if (rate > 0 && !S.pending) { this.acc += rate * dt; this.stepTicks(out); }
      if (this.flow.done()) this.endObserve(paused, out);
      return out;
    }
    if (paused || S.pending) return out;                           // 手動イベントの表示は UI が行う
    this.acc += speed * dt; this.stepTicks(out, budgetMs);
    if (out.autoDecisions > 0 && !paused && !S.ended) { this.startObserve(); out.started = this.flow.active; }
    return out;
  }
  // budgetMs: 1フレームに使う計算時間の上限。高速進行で描画が止まらないよう、時間で区切って次のフレームへ回す(超過分の待ちは捨てる)
  stepTicks(out, budgetMs) {
    const S = this.S; let n = 0; const t0 = budgetMs ? performance.now() : 0;
    while (this.acc >= 1 && !S.pending && !S.ended && n++ < 200) {
      this.acc--; const a0 = S.autoLog.length; this.E.tick(S); out.ticks++; if (this.afterTick) this.afterTick(S);
      if (S.autoLog.length > a0) { out.autoDecisions++; if (!this.flow.active) { this.acc = 0; break; } } // 自動判断のあとは観察へ(続きを一気に進めない)
      if (budgetMs && performance.now() - t0 > budgetMs) break;
    }
    if (this.acc > 5) this.acc = budgetMs ? Math.min(this.acc, 3) : 0; // 処理が追いつかない分は持ち越さない(時間が遅れて見えるだけで、順序は変わらない)
  }
  // 観察の終了: 保留していたイベントを処理する。自動で処理できるものは自動で、手動のものは UI がモーダルで尋ねる
  endObserve(paused, out) {
    const S = this.S; this.flow.end(); S.holdAuto = false; this.acc = 0; out.ended = true;
    if (S.pending && this.E.autoHandles(S, S.pending.id)) {
      this.E.resolveAutoNow(S); out.autoDecisions++;
      if (!paused && !S.ended) { this.startObserve(); out.started = this.flow.active; }
    }
    return out;
  }
  skip(paused) { const out = { ticks: 0, autoDecisions: 0, started: false, ended: false }; if (this.flow.active) this.endObserve(paused, out); return out; }
  // 手動の判断が確定した直後。手動で一時停止中なら、その意図を優先して観察は始めない
  decided(paused) { const S = this.S; if (!S || S.ended || paused) return false; this.startObserve(); return this.flow.active; }
}
