/**
 * 立ち上げたサーバーに実際に接続して、複数人で1ゲーム通す。
 *
 * エンジンの単体テストでは確かめられない「サーバーの時計で進む」「合鍵なしでは席に戻れない」
 * 「手番の人が落ちても止まらない」を、本物の Socket.IO で確かめる。
 *
 * 使い方: サーバーを立てた状態で npm run smoke -- [http://localhost:3800]
 */
import { io, type Socket } from 'socket.io-client';
import type { GameView } from '../src/engine/view';
import { EV } from '../src/net/events';

const URL = process.argv[2] ?? 'http://localhost:3800';

type State = { lobby: { code: string; hostId: string; players: { id: string; connected: boolean }[] }; game: GameView | null; serverNow: number };
type Ack = { ok: boolean; error?: string; [k: string]: unknown };

let failures = 0;
const check = (label: string, cond: boolean, detail?: unknown) => {
  console.log(`${cond ? '  OK' : '  NG'}  ${label}${!cond && detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
  if (!cond) failures++;
};

class Client {
  socket: Socket;
  last: State | null = null;
  playerId = '';
  token = '';
  constructor(public name: string) {
    this.socket = io(URL, { transports: ['websocket'], forceNew: true });
    this.socket.on(EV.state, (s: State) => (this.last = s));
  }
  emit(ev: string, payload: object): Promise<Ack> {
    return new Promise((resolve) => this.socket.emit(ev, payload, resolve));
  }
  waitFor(pred: (s: State) => boolean, ms = 15_000): Promise<State> {
    return new Promise((resolve, reject) => {
      if (this.last && pred(this.last)) return resolve(this.last);
      const t = setTimeout(() => {
        this.socket.off(EV.state, on);
        reject(new Error(`${this.name}: 待っていた状態が ${ms}ms 来なかった`));
      }, ms);
      const on = (s: State) => {
        if (!pred(s)) return;
        clearTimeout(t);
        this.socket.off(EV.state, on);
        resolve(s);
      };
      this.socket.on(EV.state, on);
    });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`接続先 ${URL}`);
  const A = new Client('あ');
  const B = new Client('い');
  const C = new Client('う');

  console.log('\n[ロビー]');
  const created = await A.emit(EV.create, { name: 'あ' });
  check('部屋を作れる', created.ok, created);
  const code = created['code'] as string;
  A.playerId = created['playerId'] as string;
  A.token = created['token'] as string;

  const empty = await B.emit(EV.join, { code, name: '   ' });
  check('空白だけの名前は弾く', !empty.ok);
  const soloStart = await A.emit(EV.start, { code });
  check('1人では始められない', !soloStart.ok);

  for (const [c, name] of [
    [B, 'い'],
    [C, 'う'],
  ] as const) {
    const r = await c.emit(EV.join, { code, name });
    check(`${name} が入れる`, r.ok, r);
    c.playerId = r['playerId'] as string;
    c.token = r['token'] as string;
  }

  const badCourse = await A.emit(EV.configure, { code, courseLength: 999 });
  check('ありえないコース長は弾く', !badCourse.ok);
  const notHost = await B.emit(EV.configure, { code, courseLength: 30 });
  check('ホスト以外は設定を変えられない', !notHost.ok);
  const conf = await A.emit(EV.configure, { code, courseLength: 30 });
  check('ホストはコース長を変えられる', conf.ok);

  const bStart = await B.emit(EV.start, { code });
  check('ホスト以外は始められない', !bStart.ok);
  const start = await A.emit(EV.start, { code });
  check('ホストが始められる', start.ok, start);
  await A.waitFor((s) => s.game !== null);

  const late = new Client('え');
  const lateJoin = await late.emit(EV.join, { code, name: 'え' });
  check('始まったあとは入れない', !lateJoin.ok);
  late.socket.disconnect();

  console.log('\n[手番]');
  const g0 = A.last!.game!;
  check('最初の手番は1人目', g0.players[g0.turn]!.id === A.playerId);
  const wrongRoll = await B.emit(EV.roll, { code });
  check('手番でない人は振れない', !wrongRoll.ok);

  console.log('\n[再接続]');
  const thief = new Client('盗');
  const steal = await thief.emit(EV.rejoin, { code, token: 'でたらめ' });
  check('合鍵が違えば席に戻れない', !steal.ok);
  const stealById = await thief.emit(EV.rejoin, { code, token: B.playerId });
  check('ID を合鍵の代わりにしても戻れない', !stealById.ok);
  thief.socket.disconnect();

  B.socket.disconnect();
  await A.waitFor((s) => s.lobby.players.find((p) => p.id === B.playerId)?.connected === false);
  check('切れた人は不在として見える', true);
  const B2 = new Client('い2');
  const back = await B2.emit(EV.rejoin, { code, token: B.token });
  check('合鍵で元の席に戻れる', back.ok && back['playerId'] === B.playerId, back);
  B2.playerId = B.playerId;
  B2.token = B.token;

  console.log('\n[1ゲーム通す]（手番の人がすぐ振り、すぐ選び、お知らせは飛ばす。う は途中で落ちたまま）');
  const clients = [A, B2, C];
  let cDropped = false;
  const t0 = Date.now();
  let actions = 0;
  let sawAutoRoll = false;
  for (;;) {
    const s = await A.waitFor(() => true);
    const g = s.game!;
    if (g.step.k === 'finished') break;
    if (Date.now() - t0 > 12 * 60_000) throw new Error('12分たっても終わらない');
    const turnId = g.players[g.turn]!.id;
    // 途中で「う」を落とす。手番が来たら AWAY_MS で代わりに進むはず
    if (!cDropped && g.round >= 3) {
      C.socket.disconnect();
      cDropped = true;
    }
    if (g.log.some((l) => l.text.includes('の代わりにサイコロを振った'))) sawAutoRoll = true;
    const actor = clients.find((c) => c.playerId === turnId && c.socket.connected);
    const seq = g.seq;
    if (actor) {
      if (g.step.k === 'roll') await actor.emit(EV.roll, { code });
      else if (g.step.k === 'choice') {
        const opts = g.choiceView!.options.filter((o) => !o.disabled);
        await actor.emit(EV.choose, { code, optionId: opts[Math.floor(Math.random() * opts.length)]!.id });
      } else if (g.step.k === 'notice') await actor.emit(EV.skipNotice, { code });
      actions++;
    }
    // 次の状態を待つ（移動中や不在の人の番はサーバーの時計で進む）
    await A.waitFor((x) => x.game !== null && x.game.seq !== seq, 20_000);
  }
  const fin = A.last!.game!;
  check('最後まで終わる', fin.step.k === 'finished');
  check('全員に順位が付く', fin.results?.length === 3, fin.results);
  check('落ちた人の番も自動で進んだ', sawAutoRoll);
  console.log(`     （${Math.round((Date.now() - t0) / 1000)}秒・操作${actions}回・${fin.round + 1}周）`);

  console.log('\n[ロビーへ戻る]');
  const bLobby = await B2.emit(EV.toLobby, { code });
  check('ホスト以外は戻せない', !bLobby.ok);
  const lobby = await A.emit(EV.toLobby, { code });
  check('ホストはロビーへ戻せる', lobby.ok, lobby);
  const ls = await A.waitFor((s) => s.game === null);
  check('切れたままの人はロビーから外れる', ls.lobby.players.length === 2, ls.lobby.players);

  for (const c of [A, B2, C]) c.socket.disconnect();
  await sleep(100);
  console.log(failures === 0 ? '\nすべて OK' : `\nNG が ${failures} 件`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
