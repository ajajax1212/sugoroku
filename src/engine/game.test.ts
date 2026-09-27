import { describe, expect, it } from 'vitest';
import { type Action, type GameState, type Rng, AWAY_MS, choiceOptions, current, reducer, stepDeadline } from './game';

/** 種から決まる乱数（mulberry32）。同じ種なら同じゲームになる */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, connected: true }));

function start(n: number, rng: Rng, courseLength = 30): GameState {
  return reducer({} as GameState, { type: 'START', players: players(n), courseLength, now: 0 }, rng);
}

/** 誰も何も押さず、締切だけで進めたときに最後まで行くか。旧版はここで止まっていた */
function runByTimeouts(s: GameState, rng: Rng, maxSteps = 20_000): { s: GameState; steps: number } {
  let steps = 0;
  while (s.step.k !== 'finished' && steps < maxSteps) {
    const d = stepDeadline(s)!;
    const next = reducer(s, { type: 'TIMEOUT', now: d }, rng);
    expect(next).not.toBe(s);
    s = next;
    steps++;
  }
  return { s, steps };
}

describe('進行が止まらない', () => {
  it('どの人数・コース・乱数でも、時間切れだけで最後まで終わる', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const rng = seeded(seed);
      const n = 2 + (seed % 7);
      const course = [30, 50, 80][seed % 3]!;
      const { s } = runByTimeouts(start(n, rng, course), rng);
      expect(s.step.k, `seed ${seed}`).toBe('finished');
      expect(s.results).toHaveLength(n);
      expect(s.players.every((p) => p.board === 'MAIN' && p.isGoal)).toBe(true);
    }
  });

  it('手番の人がランダムに選んでも最後まで終わる（選択肢はすべて有効な形で出ている）', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = seeded(seed * 7919);
      let s = start(4, rng, 50);
      let guard = 0;
      while (s.step.k !== 'finished' && guard++ < 20_000) {
        const me = current(s).id;
        let action: Action;
        if (s.step.k === 'roll') action = { type: 'ROLL', playerId: me, now: 0 };
        else if (s.step.k === 'choice') {
          const opts = choiceOptions(s, s.step.choice).filter((o) => !o.disabled);
          expect(opts.length).toBeGreaterThan(0);
          action = { type: 'CHOOSE', playerId: me, optionId: opts[Math.floor(rng() * opts.length)]!.id, now: 0 };
        } else if (s.step.k === 'notice') action = { type: 'SKIP_NOTICE', playerId: me, now: 0 };
        else action = { type: 'TIMEOUT', now: stepDeadline(s)! };
        const next = reducer(s, action, rng);
        expect(next, `seed ${seed} step ${s.step.k}`).not.toBe(s);
        s = next;
      }
      expect(s.step.k).toBe('finished');
    }
  });
});

describe('手番', () => {
  it('手番でない人はサイコロを振れない', () => {
    const rng = seeded(1);
    const s = start(3, rng);
    expect(reducer(s, { type: 'ROLL', playerId: 'p1', now: 0 }, rng)).toBe(s);
    expect(reducer(s, { type: 'ROLL', playerId: 'p0', now: 0 }, rng)).not.toBe(s);
  });

  it('締切前の TIMEOUT では進まない', () => {
    const rng = seeded(1);
    const s = start(2, rng);
    expect(reducer(s, { type: 'TIMEOUT', now: 1 }, rng)).toBe(s);
  });

  it('1回休みは、ちょうど1回だけ手番が飛ぶ（旧版は1回休みが休みにならなかった）', () => {
    const rng = seeded(3);
    let s = start(3, rng);
    s = { ...s, players: s.players.map((p) => (p.id === 'p1' ? { ...p, missTurns: 1 } : p)) };
    // p0 の手番を終わらせる
    const turnsOf: string[] = [];
    let guard = 0;
    while (turnsOf.length < 5 && guard++ < 500) {
      if (s.step.k === 'roll') turnsOf.push(current(s).id);
      // 休みが増えるマスを踏むと数えられないので、高校の最初の数手だけ見る（高校ボードで休みが増えるのは超BADの1マスだけ）
      s = reducer(s, { type: 'TIMEOUT', now: stepDeadline(s)! }, rng);
    }
    const p1Missed = s.players.find((p) => p.id === 'p1')!.missTurns;
    expect(p1Missed).toBe(0);
    // p0, (p1 休み), p2, p0, p1, …
    expect(turnsOf.slice(0, 4)).toEqual(['p0', 'p2', 'p0', 'p1']);
  });

  it('手番の人の接続が切れたら、待ち時間が縮む', () => {
    const rng = seeded(1);
    const s = start(2, rng);
    const next = reducer(s, { type: 'CONNECTION', playerId: 'p0', connected: false, now: 100 }, rng);
    expect(stepDeadline(next)).toBe(100 + AWAY_MS);
  });
});

describe('選択肢', () => {
  /** 目的の step が来るまで時間切れで進める */
  function until(s: GameState, rng: Rng, pred: (s: GameState) => boolean): GameState {
    let guard = 0;
    while (!pred(s) && s.step.k !== 'finished' && guard++ < 20_000) s = reducer(s, { type: 'TIMEOUT', now: stepDeadline(s)! }, rng);
    return s;
  }

  it('押せない選択肢（お金が足りない）は弾く', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = seeded(seed);
      let s = until(start(2, rng, 80), rng, (x) => x.step.k === 'choice' && x.step.choice.k === 'shopping');
      if (s.step.k !== 'choice') continue;
      s = { ...s, players: s.players.map((p, i) => (i === s.turn ? { ...p, money: 0 } : p)) };
      if (s.step.k !== 'choice') continue;
      const disabled = choiceOptions(s, s.step.choice).find((o) => o.disabled);
      expect(disabled).toBeDefined();
      expect(reducer(s, { type: 'CHOOSE', playerId: current(s).id, optionId: disabled!.id, now: 0 }, rng)).toBe(s);
      return;
    }
    throw new Error('買い物マスに一度も止まらなかった');
  });

  it('「進学を考え直す」は大学・専門を卒業したあとの就職では出ない', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rng = seeded(seed);
      let s = start(3, rng, 30);
      let guard = 0;
      while (s.step.k !== 'finished' && guard++ < 20_000) {
        if (s.step.k === 'choice' && s.step.choice.k === 'job' && s.step.choice.first) {
          // 学校を出た直後なら出てはいけない
          const fromSchool = s.log.slice(-3).some((l) => l.text.includes('を卒業し'));
          if (fromSchool) expect(s.step.choice.reconsider).toBe(false);
        }
        s = reducer(s, { type: 'TIMEOUT', now: stepDeadline(s)! }, rng);
      }
    }
  });
});
