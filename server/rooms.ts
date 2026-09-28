/**
 * 部屋・席・合鍵・時計の管理。ゲームのルールは持たない（ルールは src/engine/game.ts だけ）。
 * anagram-game の rooms.ts と同じ考え方。
 */
import { randomBytes } from 'node:crypto';
import type { GameState } from '../src/engine/game';
import { DEFAULT_COURSE } from '../src/net/events';

export type RoomPlayer = {
  id: string;
  /**
   * 席の合鍵。再接続はこれで本人確認する。
   * ID は全員の画面に配っているので、ID だけで席を渡すと他人の席を乗っ取れる
   */
  token: string;
  name: string;
  socketId: string | null;
  connected: boolean;
  /** 最後にリアクションを送った時刻（連打よけ） */
  lastReactAt: number;
};

export type Room = {
  code: string;
  hostId: string | null;
  players: RoomPlayer[];
  courseLength: number;
  game: GameState | null;
  /** いまの step の締切に張るタイマー。1部屋に1本 */
  timer: ReturnType<typeof setTimeout> | null;
  /** timer がどの step（seq）に対して張られているか。同じ step で張り直して締切が延びないように */
  timerSeq: number | null;
  lastTouched: number;
};

const rooms = new Map<string, Room>();

/** 読み間違えやすい 0/O・1/I/L は外してある */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function makeCode(): string {
  for (;;) {
    const code = [...randomBytes(5)].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
    if (!rooms.has(code)) return code;
  }
}

/** 合鍵は推測されてはいけないので Math.random ではなく暗号用の乱数で作る */
const makeToken = (): string => randomBytes(18).toString('base64url');
const makeId = (): string => randomBytes(6).toString('hex');

export function normalizeCode(code: unknown): string {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

export function createRoom(): Room {
  const room: Room = {
    code: makeCode(),
    hostId: null,
    players: [],
    courseLength: DEFAULT_COURSE,
    game: null,
    timer: null,
    timerSeq: null,
    lastTouched: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

export function getRoom(code: unknown): Room | undefined {
  const room = rooms.get(normalizeCode(code));
  if (room) room.lastTouched = Date.now();
  return room;
}

export function addPlayer(room: Room, name: string, socketId: string): RoomPlayer {
  const player: RoomPlayer = { id: makeId(), token: makeToken(), name, socketId, connected: true, lastReactAt: 0 };
  room.players.push(player);
  if (!room.hostId) room.hostId = player.id;
  return player;
}

/** リロードして戻ってきたタブを、新しい席を作らずに元の席へ繋ぎ直す */
export function reattach(room: Room, token: unknown, socketId: string): RoomPlayer | null {
  if (typeof token !== 'string' || !token) return null;
  const player = room.players.find((p) => p.token === token);
  if (!player) return null;
  player.socketId = socketId;
  player.connected = true;
  return player;
}

/**
 * いまホストとして振る舞える人。落ちている間だけ、繋がっている人のうち一番先に入った人が代わる。
 * 落ちた瞬間に hostId を書き換えると、ホストがリロードしただけで二度と戻れなくなる
 * （旧接続の切断が新接続の復帰より先に届くため。anagram-game で一度そうなった）
 */
export function effectiveHostId(room: Room): string | null {
  const host = room.players.find((p) => p.id === room.hostId);
  if (host?.connected) return host.id;
  return room.players.find((p) => p.connected)?.id ?? room.hostId;
}

/** 席ごと外す。ホストが抜けたら繋がっている人へ司会を渡す（渡さないと開始を押せる人が居なくなる） */
export function dropSeat(room: Room, playerId: string): void {
  room.players = room.players.filter((p) => p.id !== playerId);
  if (room.hostId === playerId) {
    room.hostId = room.players.find((p) => p.connected)?.id ?? room.players[0]?.id ?? null;
  }
}

export function clearTimer(room: Room): void {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  room.timerSeq = null;
}

/** 誰も繋いでいない部屋を掃除する。部屋はメモリにしかないので、放っておくと溜まり続ける */
export function sweepIdleRooms(maxAgeMs = 6 * 60 * 60 * 1000): void {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.players.some((p) => p.connected) && now - room.lastTouched > maxAgeMs) {
      clearTimer(room);
      rooms.delete(code);
    }
  }
}
