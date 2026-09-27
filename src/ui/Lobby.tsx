import { useState } from 'react';
import { COURSE_LENGTHS } from '../engine/data';
import { MAX_PLAYERS, MIN_PLAYERS } from '../net/events';
import type { Lobby as LobbyState, Room } from '../net/useRoom';
import { playerColor } from './theme';

const COURSE_NOTE: Record<number, string> = { 30: 'さくっと', 50: 'ふつう', 80: 'じっくり' };

export function Lobby({ room, lobby, me }: { room: Room; lobby: LobbyState; me: string }) {
  const isHost = lobby.hostId === me;
  const url = `${location.origin}/room/${lobby.code}`;
  const [copied, setCopied] = useState(false);
  const enough = lobby.players.length >= MIN_PLAYERS;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      room.setError('コピーできませんでした。URLを手で選んでコピーしてください');
    }
  };

  return (
    <div className="lobby">
      <h1 className="brand brand-md">
        じんせい<span>すごろく</span>
      </h1>
      <div className="card lobby-card">
        <section className="invite">
          <div className="invite-code">
            <span>招待コード</span>
            <b className="num">{lobby.code}</b>
          </div>
          <div className="invite-url">
            <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="招待URL" />
            <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
              {copied ? 'コピーした！' : 'URLをコピー'}
            </button>
          </div>
        </section>

        <section>
          <h2 className="section-title">
            参加者 <span className="muted">{lobby.players.length}/{MAX_PLAYERS}</span>
          </h2>
          <ul className="seats">
            {lobby.players.map((p, i) => (
              <li key={p.id} className="seat" style={{ '--pc': playerColor(i) } as React.CSSProperties}>
                <span className="seat-dot">{[...p.name][0]}</span>
                <span className="seat-who">
                  <span className="seat-name">{p.name}</span>
                  {(p.id === lobby.hostId || p.id === me) && (
                    <span className="seat-tags">
                      {p.id === lobby.hostId && <span className="tag">ホスト</span>}
                      {p.id === me && <span className="tag tag-me">あなた</span>}
                    </span>
                  )}
                </span>
              </li>
            ))}
            {Array.from({ length: Math.max(0, MIN_PLAYERS - lobby.players.length) }, (_, i) => (
              <li key={`empty${i}`} className="seat seat-empty">
                招待を待っています…
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="section-title">社会人コースの長さ</h2>
          <div className="segmented">
            {COURSE_LENGTHS.map((n) => (
              <button type="button" key={n} className={lobby.courseLength === n ? 'on' : ''} disabled={!isHost} onClick={() => void room.configure(n)}>
                <b className="num">{n}</b>マス<small>{COURSE_NOTE[n]}</small>
              </button>
            ))}
          </div>
        </section>

        {isHost ? (
          <button type="button" className="btn btn-primary btn-lg" disabled={!enough} onClick={() => void room.start()}>
            {enough ? 'ゲームを始める' : `あと${MIN_PLAYERS - lobby.players.length}人で始められます`}
          </button>
        ) : (
          <p className="waiting center">ホストが始めるのを待っています…</p>
        )}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void room.leave()}>
        部屋を出る
      </button>
    </div>
  );
}
