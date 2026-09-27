import { useEffect, useState } from 'react';
import { BOARDS, BOARD_KEYS, type BoardKey } from '../engine/data';
import type { GameView } from '../engine/view';
import type { Lobby, Room } from '../net/useRoom';
import { Board } from './Board';
import { Roster } from './Roster';
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

  const tabs = BOARD_KEYS.filter((k) => k === view || k === follow || game.players.some((p) => p.board === k));

  return (
    <div className="game">
      <header className="topbar">
        <div className="brand brand-sm">
          じんせい<span>すごろく</span>
        </div>
        <div className="topbar-mid">
          部屋 <b className="num">{lobby.code}</b>・社会人コース {game.courseLength}マス
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => confirm('部屋を抜けますか？ あなたのコマは自動で進みます。') && void room.leave()}>
          抜ける
        </button>
      </header>

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
