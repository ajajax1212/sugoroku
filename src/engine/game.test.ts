import { describe, expect, it } from 'vitest';
import { type Action, type Choice, type GameState, type Rng, AWAY_MS, REVEAL_MS, RIVAL_BASE, choiceOptions, current, reducer, stepDeadline } from './game';

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
        } else if (s.step.k === 'notice') action = { type: 'SKIP_NOTICE', playerId: me, now: s.step.revealAt ?? 0 };
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

describe('2026-09 に足したルール', () => {
  /** 決まった値を返し続ける乱数。サイコロの目を決め打ちするのに使う（0 → 1の目、0.99 → 6の目） */
  const fixed = (v: number): Rng => () => v;
  /** 手番の人（p0）に選択を出した状態を作る */
  function withChoice(choice: Choice, patch: (s: GameState) => void = () => {}): GameState {
    const s = start(3, seeded(1));
    patch(s);
    s.step = { k: 'choice', choice, deadline: 1_000_000 };
    return s;
  }
  const total = (s: GameState) => s.players.reduce((a, p) => a + p.money, 0);

  it('賭けの結果は伏せている間は飛ばせず、開いたあとは飛ばせる', () => {
    const s = reducer(withChoice({ k: 'exam', required: 4, hakushiki: false, retry: false }), { type: 'CHOOSE', playerId: 'p0', optionId: 'roll', now: 0 }, fixed(0.99));
    expect(s.step.k).toBe('notice');
    if (s.step.k !== 'notice') return;
    expect(s.step.revealAt).toBe(REVEAL_MS);
    expect(reducer(s, { type: 'SKIP_NOTICE', playerId: 'p0', now: REVEAL_MS - 1 }, fixed(0))).toBe(s);
    expect(reducer(s, { type: 'SKIP_NOTICE', playerId: 'p0', now: REVEAL_MS }, fixed(0))).not.toBe(s);
  });

  it('大学に落ちたら、専門学校・浪人・フリーターから選べる。浪人は1回まで', () => {
    let s = reducer(withChoice({ k: 'exam', required: 6, hakushiki: false, retry: false }), { type: 'CHOOSE', playerId: 'p0', optionId: 'roll', now: 0 }, fixed(0));
    s = reducer(s, { type: 'TIMEOUT', now: stepDeadline(s)! }, fixed(0));
    expect(s.step.k === 'choice' && s.step.choice.k).toBe('examFailed');
    if (s.step.k !== 'choice') return;
    expect(choiceOptions(s, s.step.choice).map((o) => o.id)).toEqual(['professional', 'ronin', 'freeter']);

    s = reducer(s, { type: 'CHOOSE', playerId: 'p0', optionId: 'ronin', now: 0 }, fixed(0));
    expect(s.players[0]!.missTurns).toBe(1);
    expect(s.step.k === 'choice' && s.step.choice.k === 'exam' && s.step.choice.retry).toBe(true);

    s = reducer(s, { type: 'CHOOSE', playerId: 'p0', optionId: 'roll', now: 0 }, fixed(0));
    s = reducer(s, { type: 'TIMEOUT', now: stepDeadline(s)! }, fixed(0));
    if (s.step.k !== 'choice') throw new Error('選び直しが出ていない');
    expect(choiceOptions(s, s.step.choice).map((o) => o.id)).toEqual(['professional', 'freeter']);
  });

  it('時間切れで落ちたときは、旧版と同じくフリーターになる', () => {
    const s = withChoice({ k: 'examFailed', canRetry: true });
    const next = reducer(s, { type: 'TIMEOUT', now: 1_000_000 }, fixed(0));
    expect(next.players[0]!.job).toBe('FREETER');
    expect(next.players[0]!.board).toBe('MAIN');
  });

  it('超BADは自分より所持金の多い人にだけ押し付けられ、被害はその人に行く', () => {
    const s = withChoice({ k: 'superBad', targets: ['p1'] }, (x) => {
      x.players[0]!.money = 100;
      x.players[1]!.money = 10_000_000;
    });
    expect(choiceOptions(s, s.step.k === 'choice' ? s.step.choice : ({} as Choice)).map((o) => o.id)).toEqual(['p1', 'self']);
    // fixed(0) で「投資詐欺（所持金の2割を失う）」が出る
    const next = reducer(s, { type: 'CHOOSE', playerId: 'p0', optionId: 'p1', now: 0 }, fixed(0));
    expect(next.players[0]!.money).toBe(100);
    expect(next.players[1]!.money).toBe(8_000_000);
    // 選択肢に無い人（p2）は選べない
    expect(reducer(s, { type: 'CHOOSE', playerId: 'p0', optionId: 'p2', now: 0 }, fixed(0))).toBe(s);
  });

  it('勝負は出目の大きい方が賭け金を奪い、お金の合計は変わらない', () => {
    const s = withChoice({ k: 'rival', targets: ['p1', 'p2'], stake: RIVAL_BASE });
    // 自分 6・相手 6 → 引き分け
    const draw = reducer(s, { type: 'CHOOSE', playerId: 'p0', optionId: 'p1', now: 0 }, fixed(0.99));
    expect(draw.players[0]!.money).toBe(s.players[0]!.money);
    // 自分 1・相手 6
    let n = 0;
    const lose = reducer(s, { type: 'CHOOSE', playerId: 'p0', optionId: 'p1', now: 0 }, () => (n++ === 0 ? 0 : 0.99));
    expect(lose.players[0]!.money).toBe(s.players[0]!.money - RIVAL_BASE);
    expect(lose.players[1]!.money).toBe(s.players[1]!.money + RIVAL_BASE);
    expect(total(lose)).toBe(total(s));
  });

  it('休みの手番には、社会人なら給料1回分の生活費がかかる', () => {
    const rng = seeded(5);
    const s = start(2, rng);
    Object.assign(s.players[1]!, { board: 'MAIN', salary: 250_000, missTurns: 1 });
    s.step = { k: 'notice', notice: { title: '', lines: [], tone: 'info', then: { k: 'nextPlayer' } }, endsAt: 0 };
    const next = reducer(s, { type: 'TIMEOUT', now: 0 }, rng);
    expect(next.players[1]!.money).toBe(s.players[1]!.money - 250_000);
    expect(current(next).id).toBe('p0');
  });

  it('転職マスでは今の仕事を選び直せない（選ぶと昇給が消えていた）', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = seeded(seed);
      let s = start(3, rng, 50);
      let guard = 0;
      while (s.step.k !== 'finished' && guard++ < 20_000) {
        if (s.step.k === 'choice' && s.step.choice.k === 'job' && !s.step.choice.first && current(s).job !== 'NONE') {
          const ids = choiceOptions(s, s.step.choice).map((o) => o.id);
          expect(ids).not.toContain(current(s).job);
          expect(ids).toContain('keep');
          return;
        }
        s = reducer(s, { type: 'TIMEOUT', now: stepDeadline(s)! }, rng);
      }
    }
    throw new Error('転職マスに一度も止まらなかった');
  });
});
