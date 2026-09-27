/**
 * Socket.IO のイベント名。サーバーとクライアントの両方がここから読む。
 *
 * 文字列を両側にべた書きすると、片方だけ書き換えたときに型エラーにもテスト失敗にもならず、
 * ボタンが黙って効かなくなる（senryu-game で一度それで通信が全滅した）。
 */
export const EV = {
  /** 部屋を作る → { ok, code, playerId, token } */
  create: 'room:create',
  /** 部屋に入る。ロビーの間だけ → { ok, code, playerId, token } */
  join: 'room:join',
  /** リロード後に元の席へ戻る（合鍵で本人確認）→ { ok, code, playerId, token } */
  rejoin: 'room:rejoin',
  /** 自分から部屋を抜ける */
  leave: 'room:leave',
  /** ホストがコースの長さを変える */
  configure: 'host:configure',
  /** ホストが開始する */
  start: 'host:start',
  /** ホストが結果画面からロビーへ戻す */
  toLobby: 'host:toLobby',
  /** 手番の人がサイコロを振る */
  roll: 'game:roll',
  /** 手番の人が選択肢を選ぶ */
  choose: 'game:choose',
  /** 手番の人がお知らせを早送りする */
  skipNotice: 'game:skipNotice',
  /** サーバー → クライアント。部屋とゲームの状態 */
  state: 'state',
} as const;

export type EventName = (typeof EV)[keyof typeof EV];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const DEFAULT_COURSE = 50;

/**
 * コースの長さを検証する。画面の選択肢を絞っても、通信を直接叩かれると素通りするので
 * サーバーは必ずこれを通す
 */
export function clampCourse(n: unknown): number | null {
  return n === 30 || n === 50 || n === 80 ? n : null;
}
