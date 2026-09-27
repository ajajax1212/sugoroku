import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import { type Action, reducer, stepDeadline } from '../src/engine/game';
import { viewOf } from '../src/engine/view';
import { EV, MAX_PLAYERS, MIN_PLAYERS, clampCourse } from '../src/net/events';
import { type Room, addPlayer, clearTimer, createRoom, dropSeat, effectiveHostId, getRoom, reattach, sweepIdleRooms } from './rooms';

const dir = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// ページは1枚だけ。/room/<code> も同じアプリを返し、クライアントが URL から部屋コードを読む。
// 部屋の URL がそのまま招待状になる
const clientDir = path.join(dir, '..', 'dist');
const indexHtml = path.join(clientDir, 'index.html');
app.get(['/', '/room/:code'], (_req, res) => {
  if (!existsSync(indexHtml)) return res.status(503).type('text/plain').send('クライアントがまだビルドされていません');
  res.sendFile(indexHtml);
});
app.use(express.static(clientDir));

type Ack = (res: { ok: boolean; error?: string; [k: string]: unknown }) => void;

/** 名前は10文字まで（盤面のコマや一覧で折り返さない長さ）。空白だけの名前は通さない */
const cleanName = (name: unknown): string => (typeof name === 'string' ? name.trim().slice(0, 10) : '');

/**
 * 全員に同じ状態を送る（このゲームに隠す情報は無い。view.ts 参照）。
 * serverNow を添えるのは、締切やコマの移動がサーバーの時刻で届くから。
 * クライアントはこれとの差で自分の時計のずれを補正して、残り時間とアニメーションを描く
 */
function broadcast(room: Room): void {
  const now = Date.now();
  const payload = {
    lobby: {
      code: room.code,
      hostId: effectiveHostId(room),
      courseLength: room.courseLength,
      players: room.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected })),
      started: room.game !== null,
    },
    game: room.game ? viewOf(room.game) : null,
    serverNow: now,
  };
  io.to(room.code).emit(EV.state, payload);
  schedule(room);
}

/**
 * 時計はサーバーが持つ。コマの移動・お知らせ・選択の締切を、クライアントのタイマーに任せると
 * そのブラウザが閉じられた瞬間に進行が止まる。旧版はまさにこれ（ポップアップが時間で消えると止まる）だった
 */
function schedule(room: Room): void {
  const game = room.game;
  const deadline = game ? stepDeadline(game) : null;
  if (!game || deadline === null) return clearTimer(room);
  // 同じ step にもう張ってあれば張り直さない（誰かが繋ぎ直すたびに締切が延びないように）。
  // CONNECTION で締切が縮んだときは seq が進むので張り直される
  if (room.timerSeq === game.seq) return;
  clearTimer(room);
  room.timerSeq = game.seq;
  room.timer = setTimeout(
    () => {
      room.timer = null;
      room.timerSeq = null;
      if (!room.game) return;
      dispatch(room, { type: 'TIMEOUT', now: Date.now() });
      broadcast(room);
    },
    Math.max(0, deadline - Date.now()),
  );
}

function dispatch(room: Room, action: Action): void {
  if (!room.game) return;
  room.game = reducer(room.game, action, Math.random);
}

function requireHost(room: Room, socket: Socket, ack?: Ack): boolean {
  if (socket.data.playerId !== effectiveHostId(room)) {
    ack?.({ ok: false, error: 'ホストのみ操作できます' });
    return false;
  }
  return true;
}

/** 部屋を引いて、この接続がどの席かを確かめるところまでは全ハンドラで同じ */
function withRoom(socket: Socket, code: unknown, ack: Ack | undefined, fn: (room: Room, playerId: string) => void): void {
  const room = getRoom(code);
  if (!room) return ack?.({ ok: false, error: 'この部屋は見つかりませんでした' });
  const playerId = socket.data.playerId as string | undefined;
  // クライアントが名乗る ID は信用しない。接続に紐づけた席だけを使う
  if (!playerId || !room.players.some((p) => p.id === playerId)) return ack?.({ ok: false, error: '参加していません' });
  fn(room, playerId);
}

io.on('connection', (socket) => {
  const seat = (room: Room, playerId: string) => {
    socket.join(room.code);
    socket.data.code = room.code;
    socket.data.playerId = playerId;
  };

  socket.on(EV.create, ({ name }: { name?: unknown } = {}, ack?: Ack) => {
    const trimmed = cleanName(name);
    if (!trimmed) return ack?.({ ok: false, error: '名前を入力してください' });
    const room = createRoom();
    const player = addPlayer(room, trimmed, socket.id);
    seat(room, player.id);
    ack?.({ ok: true, code: room.code, playerId: player.id, token: player.token });
    broadcast(room);
  });

  socket.on(EV.join, ({ code, name }: { code?: unknown; name?: unknown } = {}, ack?: Ack) => {
    const room = getRoom(code);
    if (!room) return ack?.({ ok: false, error: 'この部屋は見つかりませんでした' });
    // すごろくは全員が高校1年から同時に始めるので、途中からは入れない
    if (room.game) return ack?.({ ok: false, error: 'このゲームはもう始まっています' });
    if (room.players.length >= MAX_PLAYERS) return ack?.({ ok: false, error: `満員です（${MAX_PLAYERS}人まで）` });
    const trimmed = cleanName(name);
    if (!trimmed) return ack?.({ ok: false, error: '名前を入力してください' });
    const player = addPlayer(room, trimmed, socket.id);
    seat(room, player.id);
    ack?.({ ok: true, code: room.code, playerId: player.id, token: player.token });
    broadcast(room);
  });

  socket.on(EV.rejoin, ({ code, token }: { code?: unknown; token?: unknown } = {}, ack?: Ack) => {
    const room = getRoom(code);
    if (!room) return ack?.({ ok: false, error: 'この部屋は見つかりませんでした' });
    const player = reattach(room, token, socket.id);
    if (!player) return ack?.({ ok: false, error: 'プレイヤー情報が見つかりませんでした' });
    seat(room, player.id);
    dispatch(room, { type: 'CONNECTION', playerId: player.id, connected: true, now: Date.now() });
    ack?.({ ok: true, code: room.code, playerId: player.id, token: player.token });
    broadcast(room);
  });

  socket.on(EV.configure, ({ code, courseLength }: { code?: unknown; courseLength?: unknown } = {}, ack?: Ack) => {
    withRoom(socket, code, ack, (room) => {
      if (!requireHost(room, socket, ack)) return;
      if (room.game) return ack?.({ ok: false, error: 'もう始まっています' });
      const valid = clampCourse(courseLength);
      if (valid === null) return ack?.({ ok: false, error: 'コースの長さは 30・50・80 のどれかです' });
      room.courseLength = valid;
      ack?.({ ok: true });
      broadcast(room);
    });
  });

  socket.on(EV.start, ({ code }: { code?: unknown } = {}, ack?: Ack) => {
    withRoom(socket, code, ack, (room) => {
      if (!requireHost(room, socket, ack)) return;
      if (room.game) return ack?.({ ok: false, error: 'もう始まっています' });
      if (room.players.length < MIN_PLAYERS) return ack?.({ ok: false, error: `${MIN_PLAYERS}人から遊べます` });
      room.game = reducer(
        {} as never,
        {
          type: 'START',
          players: room.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected })),
          courseLength: room.courseLength,
          now: Date.now(),
        },
        Math.random,
      );
      ack?.({ ok: true });
      broadcast(room);
    });
  });

  socket.on(EV.roll, ({ code }: { code?: unknown } = {}, ack?: Ack) => {
    withRoom(socket, code, ack, (room, playerId) => {
      if (!room.game) return ack?.({ ok: false, error: 'まだ始まっていません' });
      const before = room.game;
      dispatch(room, { type: 'ROLL', playerId, now: Date.now() });
      // エンジンは手番でない人の操作を黙って捨てる（状態が同じまま返る）。それを失敗として返す
      if (room.game === before) return ack?.({ ok: false, error: 'いまは振れません' });
      ack?.({ ok: true });
      broadcast(room);
    });
  });

  socket.on(EV.choose, ({ code, optionId }: { code?: unknown; optionId?: unknown } = {}, ack?: Ack) => {
    withRoom(socket, code, ack, (room, playerId) => {
      if (!room.game) return ack?.({ ok: false, error: 'まだ始まっていません' });
      if (typeof optionId !== 'string' || optionId.length > 40) return ack?.({ ok: false, error: '選択が不正です' });
      const before = room.game;
      dispatch(room, { type: 'CHOOSE', playerId, optionId, now: Date.now() });
      if (room.game === before) return ack?.({ ok: false, error: 'その選択はできません' });
      ack?.({ ok: true });
      broadcast(room);
    });
  });

  socket.on(EV.skipNotice, ({ code }: { code?: unknown } = {}, ack?: Ack) => {
    withRoom(socket, code, ack, (room, playerId) => {
      if (!room.game) return ack?.({ ok: false, error: 'まだ始まっていません' });
      const before = room.game;
      dispatch(room, { type: 'SKIP_NOTICE', playerId, now: Date.now() });
      // 二度押しや、ちょうど時間切れで進んだ直後は何もしない。失敗表示は出さなくてよい
      if (room.game !== before) broadcast(room);
      ack?.({ ok: true });
    });
  });

  socket.on(EV.toLobby, ({ code }: { code?: unknown } = {}, ack?: Ack) => {
    withRoom(socket, code, ack, (room) => {
      if (!requireHost(room, socket, ack)) return;
      if (room.game?.step.k !== 'finished') return ack?.({ ok: false, error: 'まだ終わっていません' });
      clearTimer(room);
      room.game = null;
      // ゲーム中に切れたままの人はロビーには連れて行かない。戻ってきたら入り直してもらう
      room.players = room.players.filter((p) => p.connected);
      if (!room.players.some((p) => p.id === room.hostId)) room.hostId = room.players[0]?.id ?? null;
      ack?.({ ok: true });
      broadcast(room);
    });
  });

  socket.on(EV.leave, ({ code }: { code?: unknown } = {}, ack?: Ack) => {
    withRoom(socket, code, ack, (room, playerId) => {
      // ゲーム中に抜けた人のコマは盤面に残し、以後は不在として自動で進める（抜けた人の分だけ消すと順位が崩れる）
      if (room.game) dispatch(room, { type: 'CONNECTION', playerId, connected: false, now: Date.now() });
      dropSeat(room, playerId);
      socket.leave(room.code);
      socket.data.code = undefined;
      socket.data.playerId = undefined;
      ack?.({ ok: true });
      broadcast(room);
    });
  });

  socket.on('disconnect', () => {
    const room = getRoom(socket.data.code);
    const playerId = socket.data.playerId as string | undefined;
    if (!room || !playerId) return;
    const player = room.players.find((p) => p.id === playerId);
    // リロードで新しい接続が先に席を取り直していたら、古い接続の切断で席を落とさない
    if (!player || player.socketId !== socket.id) return;
    if (room.game) {
      player.connected = false;
      player.socketId = null;
      // 手番の人なら待ち時間を縮めて代わりに進める
      dispatch(room, { type: 'CONNECTION', playerId, connected: false, now: Date.now() });
    } else {
      dropSeat(room, playerId);
    }
    broadcast(room);
  });
});

setInterval(() => sweepIdleRooms(), 30 * 60 * 1000);

// 3800 はポート台帳でこのプロジェクトに割り当てたもの。本番は Render が PORT を渡す
const PORT = Number(process.env['PORT']) || 3800;
httpServer.listen(PORT, () => {
  console.log(`sugoroku server listening on http://localhost:${PORT}`);
});
