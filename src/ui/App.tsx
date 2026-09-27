import { useEffect, useState } from 'react';
import { codeFromUrl, useRoom } from '../net/useRoom';
import { Game } from './Game';
import { Lobby } from './Lobby';
import { Results } from './Results';
import { Top } from './Top';

export function App() {
  const room = useRoom();
  const [urlCode] = useState(codeFromUrl);
  // /room/<code> で開かれたら、まず元の席に戻れるか試す。戻れなければ名前を聞く
  const [checking, setChecking] = useState(urlCode !== null);

  useEffect(() => {
    if (!room.connected || !urlCode || room.me) return;
    void room.rejoin(urlCode).finally(() => setChecking(false));
    // 接続が立った最初の一度だけ試せばよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.connected]);

  // エラー表示は数秒で消す。押して消すこともできる
  useEffect(() => {
    if (!room.error) return;
    const t = setTimeout(() => room.setError(null), 5000);
    return () => clearTimeout(t);
  }, [room.error, room]);

  let screen;
  if (!room.connected && !room.state) screen = <p className="splash">サーバーに接続しています…<small>（しばらく使われていないと、起きるまで30秒ほどかかります）</small></p>;
  // 席は見つかったが最初の状態がまだ届いていない間も待つ。ここで入口を出すと、戻れたのに一瞬だけ参加画面がちらつく
  else if (checking || (room.me && !room.state)) screen = <p className="splash">席を探しています…</p>;
  else if (!room.me || !room.state) screen = <Top room={room} urlCode={urlCode} />;
  else if (!room.state.game) screen = <Lobby room={room} lobby={room.state.lobby} me={room.me} />;
  else if (room.state.game.step.k === 'finished') screen = <Results room={room} game={room.state.game} lobby={room.state.lobby} me={room.me} />;
  else screen = <Game room={room} game={room.state.game} lobby={room.state.lobby} me={room.me} />;

  return (
    <>
      {room.state && !room.connected && <div className="banner">接続が切れました。繋ぎ直しています…</div>}
      {room.error && (
        <button type="button" className="toast" onClick={() => room.setError(null)}>
          {room.error}
        </button>
      )}
      {screen}
    </>
  );
}
