import { useEffect, useRef, useState } from 'react';
import { BOARDS, BOARD_KEYS, type BoardKey } from '../engine/data';
import type { GameView } from '../engine/view';
import { type Lobby, REACTION_MS, type Room } from '../net/useRoom';
import { Board } from './Board';
import { man } from './format';
import { Roster, moneyRanks } from './Roster';
import { Stage } from './Stage';
import { LEGEND, playerColor } from './theme';

/**
 * 時計。コマが動いている間だけ毎フレーム描き直し、それ以外は 0.25 秒おき（残り秒数の表示に足りる）。
 * 常に毎フレーム回すと、盤面の SVG をずっと描き直すことになって重い
 */
function useNow(room: Room, fast: boolean): number {
  const [now, setNow] = useState(room.serverNow);
  useEffect(() => {
    let id = 0;
    if (fast) {
      const loop = () => {
        setNow(room.serverNow());
        id = requestAnimationFrame(loop);
      };
      id = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(id);
    }
    const t = setInterval(() => setNow(room.serverNow()), 250);
    setNow(room.serverNow());
    return () => clearInterval(t);
  }, [room, fast]);
  return now;
}

/** 画面幅の条件。CSS だけでは SVG の列数を変えられないので、JS でも見る */
function useMedia(query: string): boolean {
  const [hit, setHit] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setHit(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return hit;
}

/** 1回でこれ以上お金が動いたら、全員の画面に大きく出す */
const SWING_YEN = 3_000_000;
/** 大きく出しておく時間 */
const SWING_MS = 2_800;

type Swing = { key: string; playerId: string; delta: number; from: number; to: number; showAt: number };

/**
 * 大きなお金の動きを拾う。状態が届くたびに前の所持金と比べる。
 * エンジンに「いくら動いたか」を持たせずに画面で差を取るのは、ルールの層に演出の都合を入れないため。
 * 賭けの結果は revealAt まで伏せているので、そこまで出さない（先に出すと結果がばれる）
 */
function useSwings(game: GameView, now: number): Swing[] {
  const prev = useRef<{ seq: number; money: Map<string, number>; ranks: Map<string, number> } | null>(null);
  const [swings, setSwings] = useState<Swing[]>([]);
  useEffect(() => {
    const money = new Map(game.players.map((p) => [p.id, p.money]));
    const ranks = moneyRanks(game.players);
    const before = prev.current;
    prev.current = { seq: game.seq, money, ranks };
    // 最初の1回（途中から繋いだ・ゲームがやり直された）は比べる相手が無い
    if (!before || game.seq < before.seq) return;
    const showAt = game.step.k === 'notice' && game.step.revealAt !== undefined ? game.step.revealAt : now;
    const found = game.players
      .map((p) => ({ p, delta: p.money - (before.money.get(p.id) ?? p.money) }))
      .filter(({ delta }) => Math.abs(delta) >= SWING_YEN)
      .map(({ p, delta }) => ({ key: `${game.seq}:${p.id}`, playerId: p.id, delta, from: before.ranks.get(p.id)!, to: ranks.get(p.id)!, showAt }));
    if (found.length > 0) setSwings((xs) => [...xs.filter((x) => x.showAt + SWING_MS > now), ...found]);
    // now は「届いた瞬間の時刻」として読むだけ。now が進むたびに比べ直すと、同じ動きを何度も拾う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.seq]);
  return swings.filter((x) => now >= x.showAt && now < x.showAt + SWING_MS);
}

export function Game({ room, game, lobby, me }: { room: Room; game: GameView; lobby: Lobby; me: string }) {
  const step = game.step;
  const turn = game.players[game.turn]!;
  const narrow = useMedia('(max-width: 760px)');
  const now = useNow(room, step.k === 'move' || step.k === 'notice');

  // 見ているボード。手番の人のいるボードに自動で付いていく。
  // 他のボードのタブを押したら、次に誰かが動き出すまではそこに留まる
  const follow: BoardKey = step.k === 'move' ? step.board : turn.board;
  const [pinned, setPinned] = useState<BoardKey | null>(null);
  useEffect(() => setPinned(null), [game.turn, step.k === 'move' ? game.seq : -1]);
  const view = pinned ?? follow;

  const swings = useSwings(game, now);
  const ranks = moneyRanks(game.players);
  const byRank = [...game.players].sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)!);

  const tabs = BOARD_KEYS.filter((k) => k === view || k === follow || game.players.some((p) => p.board === k));

  return (
    <div className="game">
      <header className="topbar">
        <div className="brand brand-sm">
          じんせい<span>すごろく</span>
        </div>
        <div className="topbar-mid">
          部屋 <b className="num">{lobby.code}</b>
          <span className="topbar-course">・社会人コース {game.courseLength}マス</span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => confirm('部屋を抜けますか？ あなたのコマは自動で進みます。') && void room.leave()}>
          抜ける
        </button>
      </header>

      {/* 狭い画面ではプレイヤー札が盤面の下に回るので、順位と所持金だけはここで常に見せる */}
      <ol className="rankstrip" aria-label="順位">
        {byRank.map((p) => (
          <li key={p.id} className={p.id === turn.id ? 'rankstrip-turn' : ''} style={{ '--pc': playerColor(p.color) } as React.CSSProperties}>
            <b>{ranks.get(p.id)}位</b>
            <i />
            <span className="rankstrip-name">{p.name}</span>
            <span className="num">{man(p.money)}</span>
          </li>
        ))}
      </ol>

      {swings.length > 0 && (
        <div className="cutins" aria-live="polite">
          {swings.map((w) => {
            const p = game.players.find((x) => x.id === w.playerId)!;
            return (
              <div key={w.key} className={`cutin ${w.delta > 0 ? 'cutin-up' : 'cutin-down'}`} style={{ '--pc': playerColor(p.color) } as React.CSSProperties}>
                <span className="cutin-name">{p.name}</span>
                <strong className="cutin-amount num">
                  {w.delta > 0 ? '＋' : ''}
                  {man(w.delta)}！
                </strong>
                {w.from !== w.to && (
                  <span className="cutin-rank">
                    {w.from}位 → {w.to}位{w.to < w.from ? ' ↑' : ' ↓'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="rx-layer" aria-hidden>
        {room.reactions.map((r) => {
          const p = game.players.find((x) => x.id === r.playerId);
          if (!p) return null;
          // 横の位置は通し番号から決める。乱数にすると描き直すたびに跳ねる
          const left = 8 + ((r.key * 37) % 84);
          return (
            <span key={r.key} className="rx" style={{ left: `${left}%`, '--pc': playerColor(p.color), animationDuration: `${REACTION_MS}ms` } as React.CSSProperties}>
              {r.emoji}
              <small>{p.name}</small>
            </span>
          );
        })}
      </div>

      <main className="table">
        <aside className="col-roster">
          <Roster players={game.players} turnId={turn.id} me={me} />
        </aside>

        <section className="col-board">
          <nav className="tabs" aria-label="ボード">
            {tabs.map((k) => {
              const here = game.players.filter((p) => p.board === k);
              return (
                <button type="button" key={k} className={`tab${k === view ? ' tab-on' : ''}`} onClick={() => setPinned(k === follow ? null : k)}>
                  {BOARDS[k].name}
                  <span className="tab-dots">
                    {here.map((p) => (
                      <i key={p.id} style={{ background: playerColor(p.color) }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="board-wrap">
            <Board boardKey={view} cells={game.boards[view]} players={game.players} step={step} turnId={turn.id} me={me} now={now} narrow={narrow} />
          </div>
          <ul className="legend">
            {LEGEND.map((l) => (
              <li key={l.family}>
                <i className={`sw sw-${l.family}`} />
                {l.label}
              </li>
            ))}
          </ul>
        </section>

        <aside className="col-stage">
          <Stage game={game} me={me} room={room} now={now} />
          <section className="log">
            <h4>できごと</h4>
            <ol>
              {[...game.log].reverse().map((l) => {
                const p = game.players.find((x) => x.id === l.playerId);
                return (
                  <li key={l.id} className={`log-${l.tone}`}>
                    {p && <i style={{ background: playerColor(p.color) }} />}
                    {l.text}
                  </li>
                );
              })}
            </ol>
          </section>
        </aside>
      </main>
    </div>
  );
}
