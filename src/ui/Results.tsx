import { JOBS, SKILLS } from '../engine/data';
import type { GameView } from '../engine/view';
import type { Lobby, Room } from '../net/useRoom';
import { man } from './format';
import { playerColor } from './theme';

const MEDAL = ['🥇', '🥈', '🥉'];

/**
 * 結果。ランキングはこのゲームの中だけで、サーバーには残さない（本人の希望）。
 * 点数の内訳（所持金＋持ち物の価値＋スキルの価値）を並べて、なぜその順位かが分かるようにする
 */
export function Results({ room, game, lobby, me }: { room: Room; game: GameView; lobby: Lobby; me: string }) {
  const results = game.results ?? [];
  const isHost = lobby.hostId === me;
  const winner = game.players.find((p) => p.id === results[0]?.playerId);

  return (
    <div className="results">
      <div className="results-hero">
        <p className="eyebrow">ゲーム終了</p>
        <h1>
          {winner ? (
            <>
              <span style={{ color: playerColor(winner.color) }}>{winner.name}</span>の人生が
              <br />
              いちばんリッチでした！
            </>
          ) : (
            '結果'
          )}
        </h1>
      </div>

      <ol className="ranking">
        {results.map((r) => {
          const p = game.players.find((x) => x.id === r.playerId)!;
          const plus = p.skills.filter((s) => SKILLS[s].type === 'positive').length;
          const minus = p.skills.length - plus;
          return (
            <li key={r.playerId} className={`rank rank-${r.place}`} style={{ '--pc': playerColor(p.color) } as React.CSSProperties}>
              <div className="rank-place">{MEDAL[r.place - 1] ?? `${r.place}位`}</div>
              <div className="rank-who">
                <span className="rank-name">
                  {p.name}
                  {p.id === me && <span className="tag tag-me">あなた</span>}
                </span>
                <span className="muted">
                  {JOBS[p.job].name}
                  {p.family > 0 && `・家族${p.family}人`}
                  {p.rank && `・${p.rank}着でゴール`}
                </span>
              </div>
              <div className="rank-total num">{man(r.total)}</div>
              <div className="rank-breakdown">
                <span>
                  所持金 <b className="num">{man(r.money)}</b>
                </span>
                <span>
                  持ち物 <b className="num">{man(r.assets)}</b>
                  {p.possessions.length > 0 && <small>（{p.possessions.length}点）</small>}
                </span>
                <span>
                  スキル <b className="num">{man(r.skills)}</b>
                  {p.skills.length > 0 && (
                    <small>
                      （＋{plus}
                      {minus > 0 && `／−${minus}`}）
                    </small>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="results-actions">
        {isHost ? (
          <button type="button" className="btn btn-primary btn-lg" onClick={() => void room.toLobby()}>
            もう一度あそぶ
          </button>
        ) : (
          <p className="waiting center">ホストが次のゲームを用意するのを待っています…</p>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void room.leave()}>
          部屋を出る
        </button>
      </div>
    </div>
  );
}
