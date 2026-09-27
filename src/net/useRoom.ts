import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { GameView } from '../engine/view';
import { EV } from './events';

export type Lobby = {
  code: string;
  hostId: string | null;
  courseLength: number;
  players: { id: string; name: string; connected: boolean }[];
  started: boolean;
};

export type ServerState = { lobby: Lobby; game: GameView | null; serverNow: number };

type Ack = { ok: boolean; error?: string; [k: string]: unknown };

/** URL の /room/<code> が招待状そのもの */
export function codeFromUrl(): string | null {
  const m = location.pathname.match(/^\/room\/([^/]+)/);
  return m ? decodeURIComponent(m[1]!).toUpperCase() : null;
}

/**
 * localStorage ではなく sessionStorage に合鍵を置く。
 * localStorage は同じブラウザの全タブで共有されるので、2つ目のタブが1つ目の席を乗っ取ってしまう
 */
const seatKey = (code: string) => `sugoroku:${code}`;
const saveSeat = (code: string, token: string) => sessionStorage.setItem(seatKey(code), token);
const loadSeat = (code: string) => sessionStorage.getItem(seatKey(code));
/** 名前は次に部屋を作るときの初期値にするだけなので、タブをまたいで覚えてよい */
export const NAME_KEY = 'sugoroku:name';

export function useRoom() {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<ServerState | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  /** サーバーの時計 − 自分の時計。締切やコマの移動はサーバーの時刻で届くので、これで補正する */
  const offsetRef = useRef(0);
  const codeRef = useRef<string | null>(null);

  /**
   * ack が返らないとき（サーバーが落ちている・再接続中・イベント名の取り違え）でも
   * ボタンが押しっぱなしに見えないよう、必ず時間で打ち切って失敗として返す
   */
  const emit = useCallback((event: string, payload: unknown, timeoutMs = 6000): Promise<Ack> => {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket) return resolve({ ok: false, error: '接続していません' });
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve({ ok: false, error: 'サーバーから応答がありません。再読み込みしてください。' });
      }, timeoutMs);
      socket.emit(event, payload, (res: Ack) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(res ?? { ok: false, error: '応答がありません' });
      });
    });
  }, []);

  const enter = useCallback((res: Ack) => {
    const c = res['code'] as string;
    codeRef.current = c;
    setCode(c);
    setMe(res['playerId'] as string);
    // 席に戻るための合鍵。ID ではなくこれを保存する
    saveSeat(c, res['token'] as string);
    history.replaceState(null, '', `/room/${c}`);
  }, []);

  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      // 通信が一瞬切れて繋ぎ直すと、サーバー側では別の接続として扱われて状態が届かなくなる。
      // 席を持っているなら黙って座り直す（ページを開いた直後の1回目は App が rejoin を呼ぶ）
      const c = codeRef.current;
      const token = c ? loadSeat(c) : null;
      if (c && token) {
        socket.emit(EV.rejoin, { code: c, token }, (res: Ack) => {
          if (res?.ok) return;
          sessionStorage.removeItem(seatKey(c));
          codeRef.current = null;
          setState(null);
          setMe(null);
          setCode(null);
          setError('部屋から外れました。もう一度入ってください');
        });
      }
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on(EV.state, (s: ServerState) => {
      offsetRef.current = s.serverNow - Date.now();
      setState(s);
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const create = useCallback(
    async (name: string) => {
      setError(null);
      const res = await emit(EV.create, { name });
      if (!res.ok) return setError(res.error ?? '作成できませんでした');
      enter(res);
    },
    [emit, enter],
  );

  const join = useCallback(
    async (joinCode: string, name: string) => {
      setError(null);
      const res = await emit(EV.join, { code: joinCode, name });
      if (!res.ok) return setError(res.error ?? '参加できませんでした');
      enter(res);
    },
    [emit, enter],
  );

  /** リロードで戻ってきたときに元の席へ繋ぎ直す。席が無ければ false */
  const rejoin = useCallback(
    async (roomCode: string) => {
      const token = loadSeat(roomCode);
      if (!token) return false;
      const res = await emit(EV.rejoin, { code: roomCode, token });
      if (!res.ok) {
        sessionStorage.removeItem(seatKey(roomCode));
        return false;
      }
      enter(res);
      return true;
    },
    [emit, enter],
  );

  const run = useCallback(
    async (event: string, payload: object, fallback: string) => {
      const res = await emit(event, { code, ...payload });
      if (!res.ok) setError(res.error ?? fallback);
      return res.ok;
    },
    [emit, code],
  );

  const configure = useCallback((courseLength: number) => run(EV.configure, { courseLength }, '設定を変更できませんでした'), [run]);
  const start = useCallback(() => run(EV.start, {}, '開始できませんでした'), [run]);
  const toLobby = useCallback(() => run(EV.toLobby, {}, '戻れませんでした'), [run]);
  const roll = useCallback(() => run(EV.roll, {}, '振れませんでした'), [run]);
  const choose = useCallback((optionId: string) => run(EV.choose, { optionId }, '選べませんでした'), [run]);
  const skipNotice = useCallback(() => run(EV.skipNotice, {}, ''), [run]);

  /** 自分から抜ける。席の合鍵も捨てて、入口からやり直す */
  const leave = useCallback(async () => {
    await emit(EV.leave, { code });
    if (code) sessionStorage.removeItem(seatKey(code));
    location.href = '/';
  }, [emit, code]);

  /** いまのサーバー時刻。残り時間とコマの移動はこれを基準に描く */
  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { state, me, code, error, connected, create, join, rejoin, configure, start, toLobby, roll, choose, skipNotice, leave, serverNow, setError };
}

export type Room = ReturnType<typeof useRoom>;
