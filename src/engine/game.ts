/**
 * ゲームの進行。React も Socket.IO も知らない純粋な層で、サーバーだけが動かす。
 *
 * 旧版は「ポップアップを閉じたら呼ぶ関数」を持ち回して進めていたので、ポップアップが時間で消えると
 * 関数が呼ばれずに止まっていた。ここでは「いま何を待っているか」を step というデータで持ち、
 * 締切（endsAt / deadline）はサーバーの時計が TIMEOUT を送って進める。関数を状態に入れないので、
 * 状態はそのまま通信に載せられる。
 *
 * 乱数は引数で受け取る。テストでは固定の乱数列を渡して結果を決め打ちできるようにするため。
 * 現在時刻（now）も同じ理由で外から渡す。
 */
import {
  BOARDS,
  type BoardKey,
  CELL_INFO,
  type CellType,
  GOAL_RANK_BONUSES,
  HIGH_SCHOOL_MAX_TURNS,
  INITIAL_MONEY,
  INITIAL_STATS,
  ITEMS,
  ITEM_IDS,
  type ItemId,
  JOBS,
  type JobId,
  MAIN_BOARD_WEIGHTS,
  MAX_STAT,
  MIN_STAT,
  SKILLS,
  SKILL_CATEGORY_LABEL,
  SKILL_IDS,
  STATUS_GOOD_SCHOOL_BONUS,
  STATUS_MESSAGES,
  STAT_KEYS,
  STAT_LABEL,
  STAT_TO_CATEGORY,
  type SkillCategory,
  type SkillId,
  type StatKey,
  type Stats,
} from './data';

export type Rng = () => number;

// ---------------------------------------------------------------- 時間
/** サイコロが転がって見える時間 */
export const DICE_MS = 900;
/** コマが1マス進む時間 */
export const STEP_MS = 220;
/** 選択肢を待つ時間。過ぎたら無難な方を選んだことにする（誰かが席を外しても止まらないように） */
export const CHOICE_MS = 30_000;
/** サイコロを振るのを待つ時間。過ぎたら代わりに振る */
export const ROLL_MS = 40_000;
/** 手番の人の接続が切れているときは、この時間で代わりに進める */
export const AWAY_MS = 3_000;

/** お知らせを出しておく時間。文の長さで決める（読み終わる前に消えないように） */
export function noticeMs(n: Notice): number {
  const chars = n.title.length + n.lines.reduce((a, l) => a + l.length, 0);
  return Math.min(8_000, Math.max(3_500, 2_000 + chars * 45));
}

// ---------------------------------------------------------------- 型
export type Cell = { type: CellType; amount?: number };

export type Possession = { itemId: ItemId; price: number; assetValue: number };

export type Player = {
  id: string;
  name: string;
  /** 色の番号（0〜7）。入った順 */
  color: number;
  connected: boolean;
  money: number;
  stats: Stats;
  job: JobId;
  salary: number;
  family: number;
  skills: SkillId[];
  possessions: Possession[];
  board: BoardKey;
  position: number;
  isGoal: boolean;
  turnsOnBoard: number;
  /** 分岐ルートから戻る位置 */
  branchReturn: number | null;
  /** 休みの残り回数。1なら手番が1回飛ぶ */
  missTurns: number;
  /** 恋愛の親密度。null は相手がいない */
  affection: number | null;
  /** 最終ゴールの順位（1始まり）。未ゴールは null */
  rank: number | null;
};

export type Tone = 'info' | 'good' | 'bad' | 'event';
export type LogEntry = { id: number; text: string; tone: Tone; playerId: string | null };

/** お知らせのあとに何をするか。関数ではなくデータで持つ */
export type Then =
  | { k: 'endTurn' }
  | { k: 'nextPlayer' }
  | { k: 'goal'; event: GoalEvent }
  | { k: 'choice'; choice: Choice };

export type GoalEvent = 'graduateHighSchool' | 'graduateSchool' | 'finishBranchRoute' | 'reachGoal';

export type Notice = {
  title: string;
  lines: string[];
  tone: Tone;
  /** 出目を見せたいとき（入試・宝くじ） */
  dice?: number[];
  then: Then;
};

export type Choice =
  | { k: 'hsGraduation' }
  | { k: 'exam'; required: number; hakushiki: boolean }
  | { k: 'job'; first: boolean; reconsider: boolean; jobs: JobId[]; tip: boolean }
  | { k: 'shopping'; items: ItemId[] }
  | { k: 'lottery' }
  | { k: 'skillSchool'; categories: SkillCategory[] }
  | { k: 'trial' }
  | { k: 'business' }
  | { k: 'abroad' }
  | { k: 'illness'; cost: number; missTurns: number; physicalDown: number }
  | { k: 'branch'; stat: StatKey };

export type Step =
  | { k: 'roll'; deadline: number }
  | { k: 'move'; dice: number; board: BoardKey; from: number; to: number; startedAt: number; endsAt: number }
  | { k: 'notice'; notice: Notice; endsAt: number }
  | { k: 'choice'; choice: Choice; deadline: number }
  | { k: 'finished' };

export type ScoreLine = { playerId: string; money: number; assets: number; skills: number; total: number; place: number };

export type GameState = {
  players: Player[];
  /** 手番の人の添字 */
  turn: number;
  /** 何周目か。お金のイベントの額がこれで膨らむ（旧版の turnCount） */
  round: number;
  courseLength: number;
  boards: Record<BoardKey, Cell[]>;
  step: Step;
  /** step が変わるたびに増える。画面が「同じお知らせか、新しいお知らせか」を見分けるのに使う */
  seq: number;
  log: LogEntry[];
  logSeq: number;
  goalOrder: string[];
  results: ScoreLine[] | null;
};

export type Action =
  | { type: 'START'; players: { id: string; name: string; connected: boolean }[]; courseLength: number; now: number }
  | { type: 'ROLL'; playerId: string; now: number }
  | { type: 'CHOOSE'; playerId: string; optionId: string; now: number }
  | { type: 'SKIP_NOTICE'; playerId: string; now: number }
  | { type: 'TIMEOUT'; now: number }
  | { type: 'CONNECTION'; playerId: string; connected: boolean; now: number };

// ---------------------------------------------------------------- 小道具
const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
const int = (rng: Rng, n: number): number => Math.floor(rng() * n);
const yen = (n: number): string => `${n.toLocaleString('ja-JP')}円`;
const has = (p: Player, s: SkillId): boolean => p.skills.includes(s);
const clampStat = (n: number): number => Math.max(MIN_STAT, Math.min(MAX_STAT, n));

export const current = (s: GameState): Player => s.players[s.turn]!;

function log(s: GameState, text: string, tone: Tone = 'info', playerId: string | null = null): void {
  s.logSeq += 1;
  s.log.push({ id: s.logSeq, text, tone, playerId });
  // 画面に出すのは直近だけ。溜めると通信が毎回太る
  if (s.log.length > 60) s.log.splice(0, s.log.length - 60);
}

function setStep(s: GameState, step: Step): void {
  s.step = step;
  s.seq += 1;
}

function notice(s: GameState, now: number, n: Notice): void {
  setStep(s, { k: 'notice', notice: n, endsAt: now + noticeMs(n) });
}

function waitFor(s: GameState, now: number, base: number): number {
  return now + (current(s).connected ? base : AWAY_MS);
}

function openChoice(s: GameState, now: number, choice: Choice): void {
  setStep(s, { k: 'choice', choice, deadline: waitFor(s, now, CHOICE_MS) });
}

// ---------------------------------------------------------------- ボード
function generateBoard(key: BoardKey, length: number, rng: Rng): Cell[] {
  const goal: Cell = { type: key === 'MAIN' ? 'GOAL' : key === 'BRANCH_ROUTE' ? 'BRANCH_GOAL' : 'SCHOOL_GOAL' };
  const middle: Cell[] = [];
  const n = length - 2;
  if (key === 'HIGH_SCHOOL') {
    for (let i = 0; i < n; i++) middle.push({ type: rng() < 0.7 ? 'STATUS_GOOD' : 'STATUS_BAD' });
    // 高校超BADマスはちょうど1つ
    if (n > 0) middle[int(rng, n)] = { type: 'SUPER_BAD_HS' };
  } else if (key === 'PROFESSIONAL_SCHOOL' || key === 'UNIVERSITY') {
    for (let i = 0; i < n; i++) {
      const r = rng();
      middle.push({ type: r < 0.6 ? 'STATUS_GOOD' : r < 0.8 ? 'MONEY_SCHOOL' : 'STATUS_BAD' });
    }
  } else if (key === 'BRANCH_ROUTE') {
    for (let i = 0; i < n; i++) {
      const r = rng();
      if (r < 0.5) middle.push({ type: 'STATUS_GOOD' });
      else if (r < 0.8) middle.push({ type: 'MONEY_SCHOOL', amount: (int(rng, 5) + 1) * 10_000 });
      else middle.push({ type: 'STATUS_BAD' });
    }
  } else {
    // メインボード：出現率の比で枚数を割り振り、端数はランダムに埋めてから混ぜる（旧版と同じ手順）
    const entries = Object.entries(MAIN_BOARD_WEIGHTS) as [CellType, number][];
    const total = entries.reduce((a, [, w]) => a + w, 0);
    for (const [type, w] of entries) {
      const count = Math.floor(n * (w / total));
      for (let i = 0; i < count && middle.length < n; i++) middle.push({ type });
    }
    while (middle.length < n) middle.push({ type: pick(rng, entries)[0] });
    for (let i = middle.length - 1; i > 0; i--) {
      const j = int(rng, i + 1);
      [middle[i], middle[j]] = [middle[j]!, middle[i]!];
    }
  }
  return [{ type: 'START' }, ...middle, goal];
}

// ---------------------------------------------------------------- 開始
export function startGame(action: Extract<Action, { type: 'START' }>, rng: Rng): GameState {
  const boards = {} as Record<BoardKey, Cell[]>;
  for (const key of Object.keys(BOARDS) as BoardKey[]) {
    boards[key] = generateBoard(key, key === 'MAIN' ? action.courseLength : BOARDS[key].length, rng);
  }
  const s: GameState = {
    players: action.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      color: i % 8,
      connected: p.connected,
      money: INITIAL_MONEY,
      stats: { ...INITIAL_STATS },
      job: 'NONE',
      salary: 0,
      family: 0,
      skills: [],
      possessions: [],
      board: 'HIGH_SCHOOL',
      position: 0,
      isGoal: false,
      turnsOnBoard: 0,
      branchReturn: null,
      missTurns: 0,
      affection: null,
      rank: null,
    })),
    turn: 0,
    round: 0,
    courseLength: action.courseLength,
    boards,
    step: { k: 'roll', deadline: 0 },
    seq: 0,
    log: [],
    logSeq: 0,
    goalOrder: [],
    results: null,
  };
  log(s, 'ゲーム開始！ みんな高校1年生からスタート。', 'event');
  setStep(s, { k: 'roll', deadline: waitFor(s, action.now, ROLL_MS) });
  return s;
}

// ---------------------------------------------------------------- 進行
export function reducer(prev: GameState, action: Action, rng: Rng): GameState {
  if (action.type === 'START') return startGame(action, rng);
  // 状態は丸ごと複製してから書き換える。呼ぶ側が前の状態を持っていても壊れないように
  const s = structuredClone(prev);
  const now = action.now;

  switch (action.type) {
    case 'CONNECTION': {
      const p = s.players.find((x) => x.id === action.playerId);
      if (!p) return prev;
      p.connected = action.connected;
      // 手番の人が落ちたら、待ち時間を短くして代わりに進める。戻ってきても縮めた締切は戻さない
      if (!action.connected && current(s).id === p.id && (s.step.k === 'roll' || s.step.k === 'choice')) {
        s.step.deadline = Math.min(s.step.deadline, now + AWAY_MS);
        s.seq += 1;
      }
      return s;
    }

    case 'ROLL': {
      if (s.step.k !== 'roll' || current(s).id !== action.playerId) return prev;
      roll(s, now, rng);
      return s;
    }

    case 'CHOOSE': {
      if (s.step.k !== 'choice' || current(s).id !== action.playerId) return prev;
      const opt = choiceOptions(s, s.step.choice).find((o) => o.id === action.optionId);
      if (!opt || opt.disabled) return prev;
      resolveChoice(s, s.step.choice, opt.id, now, rng);
      return s;
    }

    case 'SKIP_NOTICE': {
      // お知らせを早送りできるのは手番の人だけ。他の人が読んでいる途中で消されないように
      if (s.step.k !== 'notice' || current(s).id !== action.playerId) return prev;
      runThen(s, s.step.notice.then, now, rng);
      return s;
    }

    case 'TIMEOUT': {
      const step = s.step;
      if (step.k === 'roll') {
        if (now < step.deadline) return prev;
        log(s, `${current(s).name}の代わりにサイコロを振った。`, 'info', current(s).id);
        roll(s, now, rng);
      } else if (step.k === 'move') {
        if (now < step.endsAt) return prev;
        resolveCell(s, now, rng);
      } else if (step.k === 'notice') {
        if (now < step.endsAt) return prev;
        runThen(s, step.notice.then, now, rng);
      } else if (step.k === 'choice') {
        if (now < step.deadline) return prev;
        const optId = defaultOption(s, step.choice);
        log(s, `${current(s).name}の時間切れ。「${choiceOptions(s, step.choice).find((o) => o.id === optId)?.label ?? optId}」を選んだことにした。`, 'info', current(s).id);
        resolveChoice(s, step.choice, optId, now, rng);
      } else {
        return prev;
      }
      return s;
    }
  }
}

/** いまの step の締切。サーバーはこの時刻にタイマーを張って TIMEOUT を送る */
export function stepDeadline(s: GameState): number | null {
  const st = s.step;
  if (st.k === 'roll' || st.k === 'choice') return st.deadline;
  if (st.k === 'move' || st.k === 'notice') return st.endsAt;
  return null;
}

function roll(s: GameState, now: number, rng: Rng): void {
  const p = current(s);
  const dice = int(rng, 6) + 1;
  const board = s.boards[p.board];
  const from = p.position;
  // ゴールを越える目はゴールで止まる（旧版と同じ）
  const to = Math.min(board.length - 1, from + dice);
  p.position = to;
  log(s, `${p.name}はサイコロで${dice}を出し、${to + 1}マス目へ。`, 'info', p.id);
  setStep(s, { k: 'move', dice, board: p.board, from, to, startedAt: now, endsAt: now + DICE_MS + (to - from) * STEP_MS });
}

function runThen(s: GameState, then: Then, now: number, rng: Rng): void {
  if (then.k === 'endTurn') endTurn(s, now, rng);
  else if (then.k === 'nextPlayer') nextPlayer(s, now);
  else if (then.k === 'goal') goalEvent(s, then.event, now, rng);
  else openChoice(s, now, then.choice);
}

// ---------------------------------------------------------------- マスのイベント
function statusMessages(board: BoardKey) {
  return board === 'BRANCH_ROUTE' ? STATUS_MESSAGES.MAIN : STATUS_MESSAGES[board];
}

function tryGainSkill(p: Player, type: 'positive' | 'negative', rng: Rng, category: SkillCategory | null = null): string | null {
  const pool = SKILL_IDS.filter((id) => SKILLS[id].type === type && !has(p, id) && (category ? SKILLS[id].category === category : true));
  if (pool.length === 0) return null;
  const id = pick(rng, pool);
  p.skills.push(id);
  return `${type === 'positive' ? 'プラス' : 'マイナス'}スキル「${SKILLS[id].name}」を獲得！`;
}

function dynamicMoney(s: GameState, p: Player, type: 'good' | 'bad'): number {
  const turnFactor = Math.floor(s.round / 10);
  const good = type === 'good';
  const base = good ? 100_000 + turnFactor * 20_000 : 50_000 + turnFactor * 10_000;
  const progress = Math.floor(p.position / 10);
  return Math.floor(
    base + progress * (good ? 20_000 + turnFactor * 5_000 : 10_000 + turnFactor * 2_500) + p.stats.luck * (good ? 1_000 + turnFactor * 200 : 500 + turnFactor * 100),
  );
}

function resolveCell(s: GameState, now: number, rng: Rng): void {
  const p = current(s);
  const cell = s.boards[p.board][p.position]!;
  const info = CELL_INFO[cell.type];
  const title = `${info.icon} ${info.name}`;
  const say = (lines: string[], tone: Tone = 'event', then: Then = { k: 'endTurn' }) => {
    log(s, `${p.name}：${lines.join(' ')}`, tone, p.id);
    notice(s, now, { title, lines, tone, then });
  };

  switch (cell.type) {
    case 'START':
      return say(['スタートマス。新たな人生の始まり！'], 'info');

    case 'NORMAL': {
      if (has(p, 'HOKO_ONCHI') && rng() < 0.05) {
        p.position = Math.max(0, p.position - 1);
        return say(['道に迷って1マス戻ってしまった…（方向音痴）'], 'bad');
      }
      if (has(p, 'KIKAI_ONCHI') && rng() < 0.05) {
        const cost = 5_000 * (1 + Math.floor(s.round / 20));
        p.money -= cost;
        return say([`機械音痴が発動！ 修理費${yen(cost)}の出費！`], 'bad');
      }
      if (has(p, 'UKKARI_HACHIBEI') && rng() < 0.05) {
        const lost = Math.floor(rng() * 5_000 + 1_000) * (1 + Math.floor(s.round / 20));
        p.money -= lost;
        return say([`うっかり八兵衛が発動！ ${yen(lost)}失くしてしまった…`], 'bad');
      }
      return say(['特に何も起こらなかった。'], 'info');
    }

    case 'GOAL':
    case 'SCHOOL_GOAL':
    case 'BRANCH_GOAL': {
      p.isGoal = true;
      const event: GoalEvent =
        cell.type === 'GOAL' ? 'reachGoal' : cell.type === 'BRANCH_GOAL' ? 'finishBranchRoute' : p.board === 'HIGH_SCHOOL' ? 'graduateHighSchool' : 'graduateSchool';
      return say([`${BOARDS[p.board].name}のゴールに到達！`], 'good', { k: 'goal', event });
    }

    case 'MONEY_GOOD_ADULT': {
      let amount = dynamicMoney(s, p, 'good');
      const notes: string[] = [];
      if (has(p, 'GOUN')) (amount = Math.round(amount * 1.2)), notes.push('豪運！');
      if (has(p, 'SHISAN_UNYO')) (amount = Math.round(amount * 1.1)), notes.push('資産運用知識！');
      p.money += amount;
      return say([`${yen(amount)}の臨時収入！`, ...notes], 'good');
    }

    case 'MONEY_BAD_ADULT': {
      let amount = dynamicMoney(s, p, 'bad');
      const notes: string[] = [];
      if (has(p, 'ROHIKA')) (amount = Math.round(amount * 1.2)), notes.push('浪費家…');
      if (has(p, 'KENYAKUKA')) (amount = Math.round(amount * 0.8)), notes.push('倹約家！');
      p.money -= amount;
      return say([`${yen(amount)}の出費…`, ...notes], 'bad');
    }

    case 'MONEY_SCHOOL': {
      const amount = cell.amount ?? 50_000;
      p.money -= amount;
      return say([`学費・教材費として${yen(amount)}支払い。`], 'bad');
    }

    case 'STATUS_GOOD':
    case 'STATUS_BAD': {
      const good = cell.type === 'STATUS_GOOD';
      const stat = pick(rng, STAT_KEYS);
      let change = int(rng, 10) + 1;
      const msg = pick(rng, statusMessages(p.board)[good ? 'good' : 'bad'][stat]);
      if (good && (p.board === 'HIGH_SCHOOL' || p.board === 'PROFESSIONAL_SCHOOL' || p.board === 'UNIVERSITY')) change += STATUS_GOOD_SCHOOL_BONUS;
      const old = p.stats[stat];
      p.stats[stat] = clampStat(old + (good ? change : -change));
      return say([msg, `${STAT_LABEL[stat]} ${old} → ${p.stats[stat]}`], good ? 'good' : 'bad');
    }

    case 'SUPER_BAD_HS':
      return say(superBadHighSchool(p, rng), 'bad');

    case 'SUPER_BAD_ADULT':
      return say(superBadAdult(p, rng), 'bad');

    case 'JOB_SELECT':
      return openChoice(s, now, jobChoice(p, false, false, rng));

    case 'LOVE_EVENT':
      return say(...loveEvent(p, rng));

    case 'BRANCH_POINT': {
      const ok = STAT_KEYS.filter((k) => p.stats[k] >= 80);
      if (ok.length === 0) return say(['分岐点だが、今の実力では特別な道は開けなかった。'], 'info');
      return openChoice(s, now, { k: 'branch', stat: pick(rng, ok) });
    }

    case 'SKILL_EVENT_SPECIFIC': {
      const stat = pick(rng, STAT_KEYS);
      const up = int(rng, 5) + 3;
      const old = p.stats[stat];
      p.stats[stat] = clampStat(old + up);
      const gained = tryGainSkill(p, 'positive', rng, STAT_TO_CATEGORY[stat]);
      return say([`${STAT_LABEL[stat]} ${old} → ${p.stats[stat]}`, gained ?? 'しかし、新しいスキルは得られなかった。'], 'good');
    }

    case 'MIXED_STAT_EVENT': {
      const lines: string[] = [];
      let money = 0;
      while (money === 0) money = (int(rng, 11) - 5) * 20_000 * (1 + Math.floor(s.round / 10));
      p.money += money;
      lines.push(`お金が${yen(Math.abs(money))}${money > 0 ? '増えた' : '減った'}。`);
      let change = 0;
      while (change === 0) change = int(rng, 9) - 4;
      const stat = pick(rng, STAT_KEYS);
      const old = p.stats[stat];
      p.stats[stat] = clampStat(old + change);
      lines.push(`${STAT_LABEL[stat]} ${old} → ${p.stats[stat]}`);
      if (rng() < 0.05) {
        if (rng() < 0.5 && p.family > 0) (p.family -= 1), lines.push('家族が1人減った…');
        else if (p.family < 5) (p.family += 1), lines.push('家族が1人増えた！');
      }
      return say(lines, money > 0 ? 'good' : 'bad');
    }

    case 'FORCED_JOB_CHANGE': {
      const pool = (Object.keys(JOBS) as JobId[]).filter((id) => id !== 'NONE' && id !== p.job);
      const oldName = JOBS[p.job].name;
      const next = pick(rng, pool);
      p.job = next;
      p.salary = JOBS[next].salary;
      return say([`なんと、${oldName}から強制的に「${JOBS[next].name}」に転職させられた！`], 'event');
    }

    case 'JOB_SPECIFIC_EVENT': {
      if (p.job === 'NONE') return say(['特に何も起こらなかった。'], 'info');
      const success = rng() < 0.6;
      const change = Math.floor((int(rng, 5) + 1) * 100_000 * (success ? 1 : -0.5) * (1 + Math.floor(s.round / 15)));
      p.money += change;
      return say(
        [`${JOBS[p.job].name}の仕事で${success ? '大きな成果を上げた！' : 'ちょっとしたミス…'}`, `お金が${yen(Math.abs(change))}${change >= 0 ? '増えた' : '減った'}。`],
        success ? 'good' : 'bad',
      );
    }

    case 'SHOPPING_EVENT': {
      const items = shoppingItems(s, p, rng);
      if (items.length === 0) return say(['今回は特に欲しいものが見つからなかった…'], 'info');
      return openChoice(s, now, { k: 'shopping', items });
    }

    case 'LOTTERY_EVENT':
      if (p.money < LOTTERY_COST) return say(['宝くじを買うお金がない！'], 'info');
      return openChoice(s, now, { k: 'lottery' });

    case 'SKILL_SCHOOL_EVENT': {
      const categories = (Object.keys(SKILL_CATEGORY_LABEL) as SkillCategory[]).filter((c) => learnable(p, c).length > 0);
      if (categories.length === 0) return say(['学べるスキルがもうないようだ…'], 'info');
      return openChoice(s, now, { k: 'skillSchool', categories });
    }

    case 'TRIAL_EVENT':
      return openChoice(s, now, { k: 'trial' });

    case 'START_BUSINESS_EVENT':
      if (p.job === 'ENTREPRENEUR') return say(['既に起業家。更なる事業拡大を目指そう！'], 'info');
      return openChoice(s, now, { k: 'business' });

    case 'MOVE_ABROAD_EVENT':
      return openChoice(s, now, { k: 'abroad' });

    case 'ILLNESS_EVENT': {
      let cost = ILLNESS_COST;
      let missTurns = int(rng, 3) + 1;
      let physicalDown = int(rng, 15) + 10;
      if (has(p, 'KENKO_TAI')) {
        cost = Math.round(ILLNESS_COST * 0.7);
        missTurns = Math.max(0, missTurns - 1);
        physicalDown = Math.round(physicalDown * 0.7);
      }
      if (has(p, 'KYOJAKU_TAISHITSU')) {
        cost = Math.round(ILLNESS_COST * 1.3);
        missTurns += 1;
        physicalDown = Math.round(physicalDown * 1.3);
      }
      return openChoice(s, now, { k: 'illness', cost, missTurns, physicalDown: Math.max(5, physicalDown) });
    }

    case 'INHERITANCE_EVENT':
      return say(...inheritance(p, rng));
  }
}

/**
 * 高校超BADマス。旧版は処理の関数が消えていて、踏むとゲームが止まっていた。
 * 中身は本人も覚えていなかったので「ランダムで悪いことが起こる」とだけ決めてもらい、
 * 旧版の超BADマス（大人）と同じ4択の形で、高校生らしい額と幅に抑えて作った。
 */
function superBadHighSchool(p: Player, rng: Rng): string[] {
  const outcomes: (() => string[])[] = [
    () => {
      const loss = (int(rng, 6) + 3) * 10_000;
      p.money -= loss;
      return ['窓ガラスを割ってしまい、弁償することに…', `${yen(loss)}の出費。`];
    },
    () => {
      const stat = pick(rng, STAT_KEYS);
      const down = int(rng, 8) + 8;
      const old = p.stats[stat];
      p.stats[stat] = clampStat(old - down);
      return ['大スランプに陥った…', `${STAT_LABEL[stat]} ${old} → ${p.stats[stat]}`];
    },
    () => {
      p.missTurns += 1;
      return ['校則違反で停学処分…', '1回休み。'];
    },
    () => {
      const gained = tryGainSkill(p, 'negative', rng);
      return ['悪い噂が広まってしまった…', gained ?? '幸い、大きな影響はなかった。'];
    },
  ];
  return pick(rng, outcomes)();
}

function superBadAdult(p: Player, rng: Rng): string[] {
  const outcomes: (() => string[])[] = [
    () => {
      const loss = Math.floor(p.money * (rng() * 0.3 + 0.2));
      p.money -= loss;
      return ['投資詐欺にあった！', `${yen(loss)}を失った！`];
    },
    () => {
      const stat = pick(rng, STAT_KEYS);
      const down = int(rng, 15) + 10;
      const old = p.stats[stat];
      p.stats[stat] = clampStat(old - down);
      return ['大スランプ！', `${STAT_LABEL[stat]} ${old} → ${p.stats[stat]}`];
    },
    () => {
      const t = int(rng, 2) + 1;
      p.missTurns = t;
      return ['不運な出来事に見舞われた…', `${t}回休み。`];
    },
    () => {
      if (p.skills.length === 0) return ['不幸中の幸いか、大きな被害はなかった。'];
      const [lost] = p.skills.splice(int(rng, p.skills.length), 1);
      return [`大切なスキル「${SKILLS[lost!].name}」を失った！`];
    },
  ];
  return pick(rng, outcomes)();
}

function loveEvent(p: Player, rng: Rng): [string[], Tone] {
  if (p.job === 'NONE' || p.job === 'FREETER') return [['今は恋愛どころではないようだ…'], 'info'];
  if (p.affection === null) p.affection = 0;
  let chance = 0.5 + p.stats.charm / 200;
  if (has(p, 'JIISHIKI_KAJO')) chance *= 0.8;
  if (has(p, 'SUKEBE')) chance *= 0.5;
  if (has(p, 'COMMURYOKU_OBAKE')) chance = Math.min(1, chance * 1.5);
  if (has(p, 'KIKIJOUZU')) chance = Math.min(1, chance * 1.2);
  if (rng() < chance) {
    const gain = Math.floor(rng() * 10 + 5 + p.stats.charm / 10);
    p.affection += gain;
    const lines = ['素敵な人との出会いがあった。', `親密度 +${gain}（${p.affection}）`];
    if (p.affection >= 100 && p.family === 0) {
      p.family += 1;
      p.money += 100_000;
      p.affection = null;
      lines.push('そして結婚！ 家族が1人増え、ご祝儀10万円！');
    }
    return [lines, 'good'];
  }
  const lines = ['今回はあまりうまくいかなかった…'];
  if (has(p, 'SUKEBE') && rng() < 0.3) {
    p.stats.charm = clampStat(p.stats.charm - 10);
    lines.push('相手に引かれてしまった…（魅力 -10）');
  }
  return [lines, 'bad'];
}

function inheritance(p: Player, rng: Rng): [string[], Tone] {
  const luck = (p.stats.luck - 50) / 50;
  const r = rng() + luck * 0.2;
  if (r > 0.65) {
    const amount = Math.floor((rng() * 10 + 5) * 1_000_000 * (1 + Math.max(0, luck * 0.5)));
    p.money += amount;
    const lines = [`遠い親戚から莫大な遺産！ ${yen(amount)}を相続した！`];
    if (has(p, 'GOUN')) {
      const bonus = Math.floor(amount * 0.1);
      p.money += bonus;
      lines.push(`豪運の力でさらに${yen(bonus)}！`);
    }
    return [lines, 'good'];
  }
  if (r > 0.25) {
    const amount = Math.floor((rng() * 50 + 10) * 10_000 * (1 + Math.max(0, luck * 0.3)));
    const cost = Math.floor(rng() * 200_000);
    p.money += amount - cost;
    return amount > cost
      ? [[`親戚の遺品整理を手伝い、謝礼として${yen(amount - cost)}もらった。`], 'good']
      : [[`親戚の遺品整理で、逆に${yen(cost - amount)}の持ち出しに…`], 'bad'];
  }
  let debt = Math.floor((rng() * 5 + 2) * 100_000 * (1 + Math.abs(Math.min(0, luck * 0.5))));
  if (has(p, 'KENYAKUKA')) debt = Math.round(debt * 0.8);
  p.money -= debt;
  const lines = [`なんと親戚の借金を肩代わりすることに… ${yen(debt)}の支払い。`];
  if (!has(p, 'SHAKKIN_TAISHITSU')) {
    const gained = tryGainSkill(p, 'negative', rng, 'life');
    if (gained) lines.push(gained);
  }
  return [lines, 'bad'];
}

function shoppingItems(s: GameState, p: Player, rng: Rng): ItemId[] {
  const owned = new Set(p.possessions.map((x) => x.itemId));
  const available = ITEM_IDS.filter((id) => !owned.has(id));
  if (available.length === 0) return [];
  const progress = p.board === 'MAIN' ? p.position / s.courseLength : 0;
  const t =
    progress <= 0.33
      ? { lowMin: 50_000, lowMax: 150_000, midMin: 150_001, midMax: 300_000, highMin: 300_001, highMax: 500_000 }
      : progress <= 0.66
        ? { lowMin: 100_000, lowMax: 400_000, midMin: 400_001, midMax: 800_000, highMin: 800_001, highMax: 5_000_000 }
        : { lowMin: 200_000, lowMax: 1_000_000, midMin: 1_000_001, midMax: 10_000_000, highMin: 10_000_001, highMax: 1_000_000_000 };
  const shown: ItemId[] = [];
  const fromTier = (min: number, max: number) => {
    const tier = available.filter((id) => ITEMS[id].price >= min && ITEMS[id].price <= max && !shown.includes(id));
    return tier.length > 0 ? pick(rng, tier) : null;
  };
  const low = fromTier(t.lowMin, t.lowMax);
  if (low) shown.push(low);
  else {
    const cheapest = available.filter((id) => ITEMS[id].price <= t.lowMax).sort((a, b) => ITEMS[a].price - ITEMS[b].price)[0];
    if (cheapest) shown.push(cheapest);
  }
  const mid = fromTier(t.midMin, t.midMax);
  if (mid) shown.push(mid);
  const high = fromTier(t.highMin, t.highMax);
  if (high) shown.push(high);
  const rest = available.filter((id) => !shown.includes(id) && ITEMS[id].price <= t.highMax);
  while (shown.length < 5 && rest.length > 0) shown.push(rest.splice(int(rng, rest.length), 1)[0]!);
  return shown.sort((a, b) => ITEMS[a].price - ITEMS[b].price);
}

function learnable(p: Player, c: SkillCategory): SkillId[] {
  return SKILL_IDS.filter((id) => SKILLS[id].category === c && SKILLS[id].type === 'positive' && !has(p, id));
}

function jobChoice(p: Player, first: boolean, fromHighSchool: boolean, rng: Rng): Choice {
  const ids = (Object.keys(JOBS) as JobId[]).filter(
    (id) => id !== 'NONE' && (Object.entries(JOBS[id].conditions) as [StatKey, number][]).every(([k, v]) => p.stats[k] >= v),
  );
  let tip = false;
  // 情報通：条件を満たしていない高給の求人が2割で1つ紛れ込む
  if (has(p, 'JOHOTSU')) {
    const good = (Object.keys(JOBS) as JobId[]).filter((id) => JOBS[id].salary > 400_000 && !ids.includes(id));
    if (good.length > 0 && rng() < 0.2) {
      ids.push(pick(rng, good));
      tip = true;
    }
  }
  ids.sort((a, b) => JOBS[b].salary - JOBS[a].salary);
  // 「やっぱり進学を考え直す」は高校卒業で就職を選んだ直後だけ。
  // 旧版は大学・専門を卒業したあとにも出て、選ぶと高校卒業からやり直して学費を二重に払っていた
  const reconsider = first && fromHighSchool && ids.length <= 1;
  return { k: 'job', first, reconsider, jobs: ids, tip };
}

// ---------------------------------------------------------------- 選択肢
export const LOTTERY_COST = 100_000;
export const SKILL_SCHOOL_COST = 500_000;
export const TRIAL_REWARD = 2_000_000;
export const BUSINESS_COST = 2_000_000;
export const ABROAD_COST = 1_500_000;
export const ILLNESS_COST = 800_000;

export type ChoiceOption = { id: string; label: string; sub?: string; disabled?: boolean; tone?: 'primary' | 'danger' | 'plain' };

export function choiceTitle(c: Choice): { title: string; body: string[] } {
  switch (c.k) {
    case 'hsGraduation':
      return { title: '🎓 高校卒業！ 進路は？', body: ['この先の人生を選ぼう。'] };
    case 'exam':
      return {
        title: '📝 大学入学試験',
        body: [`サイコロで ${c.required} 以上を出せば合格！`, ...(c.hakushiki ? ['スキル「博識」で合格ラインが1つ下がった。'] : [])],
      };
    case 'job':
      return {
        title: c.first ? '💼 最初の仕事を選ぶ' : '💼 就職・転職のチャンス',
        body: ['いまのステータスで就ける仕事が並んでいる。', ...(c.tip ? ['「情報通」のおかげで特別な求人が見つかった！'] : [])],
      };
    case 'shopping':
      return { title: '🛒 お買い物チャンス', body: ['買ったものは最後に資産として数える。'] };
    case 'lottery':
      return { title: '🎰 宝くじチャンス', body: [`1枚${yen(LOTTERY_COST)}。サイコロ3つで役が出れば賞金！`, 'ゾロ目 1000万円／連番 50万円／ワンペア 10万円'] };
    case 'skillSchool':
      return { title: '📚 資格の学校', body: [`受講料${yen(SKILL_SCHOOL_COST)}。学力が高いほど習得しやすい。`] };
    case 'trial':
      return { title: '🔥 人生の試練', body: [`成功すれば${yen(TRIAL_REWARD)}とプラススキル。失敗するとマイナススキルを負うかも。`] };
    case 'business':
      return { title: '🚀 起業のチャンス', body: [`${yen(BUSINESS_COST)}を投資して起業する？`, '学力と運が高いほど成功しやすい。'] };
    case 'abroad':
      return { title: '✈️ 海外移住のチャンス', body: [`${yen(ABROAD_COST)}で海外に挑戦する？`, '語学堪能・運・魅力が高いほど成功しやすい。'] };
    case 'illness':
      return {
        title: '🏥 病気になってしまった…',
        body: [`治療しないと ${c.missTurns + 1}回休み・体力 -${c.physicalDown}。`, `治療すると ${Math.max(0, c.missTurns - 1)}回休み・体力 -${Math.max(1, Math.round(c.physicalDown * 0.5))}。`],
      };
    case 'branch':
      return { title: '🔀 分岐点', body: [`${STAT_LABEL[c.stat]}の高さが認められた！ 特別な分岐ルートに挑戦する？`] };
  }
}

export function choiceOptions(s: GameState, c: Choice): ChoiceOption[] {
  const p = current(s);
  switch (c.k) {
    case 'hsGraduation':
      return [
        { id: 'university', label: '大学に進学', sub: `学費${yen(BOARDS.UNIVERSITY.tuition!)}・入試あり`, tone: 'primary' },
        { id: 'professional', label: '専門学校に進学', sub: `学費${yen(BOARDS.PROFESSIONAL_SCHOOL.tuition!)}`, tone: 'primary' },
        { id: 'work', label: '就職する', sub: 'すぐ社会へ', tone: 'primary' },
      ];
    case 'exam':
      return [{ id: 'roll', label: '運命のサイコロを振る', tone: 'primary' }];
    case 'job': {
      const opts: ChoiceOption[] = c.jobs.map((id) => {
        const j = JOBS[id];
        const cond = (Object.entries(j.conditions) as [StatKey, number][]).map(([k, v]) => `${STAT_LABEL[k]}${v}`).join('・') || '条件なし';
        return { id, label: j.name, sub: `月給${yen(j.salary)}${j.oneTimeBonus ? `・就職祝い${yen(j.oneTimeBonus)}` : ''}（${cond}）`, tone: 'primary' };
      });
      if (c.reconsider) opts.push({ id: 'reconsider', label: 'やっぱり進学を考え直す', tone: 'plain' });
      if (!c.first) opts.push({ id: 'keep', label: p.job === 'NONE' ? '今回は見送る' : `${JOBS[p.job].name}を続ける`, tone: 'plain' });
      return opts;
    }
    case 'shopping':
      return [
        ...c.items.map((id) => ({
          id,
          label: `${ITEMS[id].icon} ${ITEMS[id].name}`,
          sub: `${yen(ITEMS[id].price)}${p.money < ITEMS[id].price ? '（お金が足りない）' : ''}`,
          disabled: p.money < ITEMS[id].price,
          tone: 'primary' as const,
        })),
        { id: 'none', label: '何も買わない', tone: 'plain' },
      ];
    case 'lottery':
      return [
        { id: 'buy', label: '買う！', sub: yen(LOTTERY_COST), tone: 'primary' },
        { id: 'skip', label: 'やめておく', tone: 'plain' },
      ];
    case 'skillSchool':
      return [
        ...c.categories.map((cat) => ({
          id: cat,
          label: `${SKILL_CATEGORY_LABEL[cat]}系スキルを学ぶ`,
          sub: yen(SKILL_SCHOOL_COST),
          disabled: p.money < SKILL_SCHOOL_COST,
          tone: 'primary' as const,
        })),
        { id: 'none', label: '何も学ばない', tone: 'plain' },
      ];
    case 'trial':
      return [
        { id: 'go', label: '挑戦する！', sub: '成功率60%', tone: 'danger' },
        { id: 'skip', label: 'やめておく', tone: 'plain' },
      ];
    case 'business':
      return [
        { id: 'go', label: '起業する', sub: yen(BUSINESS_COST), disabled: p.money < BUSINESS_COST, tone: 'danger' },
        { id: 'skip', label: 'やめておく', tone: 'plain' },
      ];
    case 'abroad':
      return [
        { id: 'go', label: '移住する', sub: yen(ABROAD_COST), disabled: p.money < ABROAD_COST, tone: 'danger' },
        { id: 'skip', label: '日本に残る', tone: 'plain' },
      ];
    case 'illness':
      return [
        { id: 'treat', label: '治療する', sub: yen(c.cost), disabled: p.money < c.cost, tone: 'primary' },
        { id: 'natural', label: '自然治癒にかける', tone: 'danger' },
      ];
    case 'branch':
      return [
        { id: 'go', label: '挑戦する', tone: 'primary' },
        { id: 'skip', label: 'やめておく', tone: 'plain' },
      ];
  }
}

/**
 * 時間切れ・不在のときに選んだことにする選択肢。お金を使わない、賭けない方に倒す。
 * 放っておいた人が得をしないように、最初の仕事だけは「条件なしで就けるフリーター」にする
 */
export function defaultOption(s: GameState, c: Choice): string {
  const p = current(s);
  switch (c.k) {
    case 'hsGraduation':
      return 'work';
    case 'exam':
      return 'roll';
    case 'job':
      return c.first ? (c.jobs.includes('FREETER') ? 'FREETER' : c.jobs[c.jobs.length - 1]!) : 'keep';
    case 'shopping':
    case 'skillSchool':
      return 'none';
    case 'lottery':
    case 'trial':
    case 'business':
    case 'abroad':
    case 'branch':
      return 'skip';
    case 'illness':
      return p.money >= c.cost ? 'treat' : 'natural';
  }
}

function resolveChoice(s: GameState, c: Choice, opt: string, now: number, rng: Rng): void {
  const p = current(s);
  const done = (title: string, lines: string[], tone: Tone, extra: Partial<Notice> = {}) => {
    log(s, `${p.name}：${lines.join(' ')}`, tone, p.id);
    notice(s, now, { title, lines, tone, then: { k: 'endTurn' }, ...extra });
  };

  switch (c.k) {
    case 'hsGraduation': {
      p.isGoal = false;
      p.position = 0;
      p.turnsOnBoard = 0;
      if (opt === 'professional') {
        const t = BOARDS.PROFESSIONAL_SCHOOL.tuition!;
        p.board = 'PROFESSIONAL_SCHOOL';
        p.money -= t;
        return done('🎓 専門学校に進学！', [`学費${yen(t)}を支払った。`], 'event');
      }
      if (opt === 'university') {
        const t = BOARDS.UNIVERSITY.tuition!;
        p.money -= t;
        log(s, `${p.name}は大学進学を目指す。学費${yen(t)}を支払った。`, 'event', p.id);
        let required = 4;
        if (p.stats.academic >= 80) required = 2;
        else if (p.stats.academic >= 60) required = 3;
        const hakushiki = has(p, 'HAKUSHIKI');
        if (hakushiki) required = Math.max(1, required - 1);
        return openChoice(s, now, { k: 'exam', required, hakushiki });
      }
      p.board = 'MAIN';
      log(s, `${p.name}は就職の道を選んだ。いざ社会へ！`, 'event', p.id);
      return openChoice(s, now, jobChoice(p, true, true, rng));
    }

    case 'exam': {
      const d = int(rng, 6) + 1;
      if (d >= c.required) {
        p.board = 'UNIVERSITY';
        return done('📝 合格！', [`出目は ${d}！ おめでとう、夢の大学生活が始まる！`], 'good', { dice: [d] });
      }
      p.board = 'MAIN';
      p.job = 'FREETER';
      p.salary = JOBS.FREETER.salary;
      return done('📝 不合格…', [`出目は ${d}…（必要: ${c.required}以上）`, 'フリーターとして社会に出る。'], 'bad', { dice: [d] });
    }

    case 'job': {
      if (opt === 'reconsider') {
        log(s, `${p.name}は進学を考え直すことにした。`, 'event', p.id);
        return openChoice(s, now, { k: 'hsGraduation' });
      }
      if (opt === 'keep') return done('💼 転職見送り', [`${p.job === 'NONE' ? '今回は見送った' : `${JOBS[p.job].name}を続ける`}。`], 'info');
      const id = opt as JobId;
      const j = JOBS[id];
      p.job = id;
      p.salary = j.salary;
      const lines = [`「${j.name}」になった！ 月給${yen(j.salary)}`];
      if (j.oneTimeBonus) {
        p.money += j.oneTimeBonus;
        lines.push(`就職祝い${yen(j.oneTimeBonus)}！`);
      }
      return done('💼 就職決定！', lines, 'good');
    }

    case 'shopping': {
      if (opt === 'none') return done('🛒 見送り', ['今回は何も買わなかった。'], 'info');
      const id = opt as ItemId;
      const item = ITEMS[id];
      p.money -= item.price;
      const value = item.assetValue === 'random' ? Math.floor(rng() * (500_000 - 500 + 1)) + 500 : item.assetValue;
      p.possessions.push({ itemId: id, price: item.price, assetValue: value });
      return done('🛒 お買い上げ！', [`${item.icon} ${item.name}を${yen(item.price)}で購入した。`], 'event');
    }

    case 'lottery': {
      if (opt === 'skip') return done('🎰 見送り', ['今回は宝くじを見送った。'], 'info');
      p.money -= LOTTERY_COST;
      const dice = [int(rng, 6) + 1, int(rng, 6) + 1, int(rng, 6) + 1];
      const unique = new Set(dice).size;
      const sorted = [...dice].sort((a, b) => a - b);
      let prize = 0;
      let label = 'ハズレ…';
      if (unique === 1) (prize = 10_000_000), (label = 'ゾロ目！ ジャックポット！');
      else if (sorted[0]! + 1 === sorted[1] && sorted[1]! + 1 === sorted[2]) (prize = 500_000), (label = '連番！');
      else if (unique === 2) (prize = 100_000), (label = 'ワンペア！');
      p.money += prize;
      return done('🎰 宝くじの結果', [label, prize > 0 ? `${yen(prize)}獲得！` : '賞金なし。'], prize > 0 ? 'good' : 'bad', { dice });
    }

    case 'skillSchool': {
      if (opt === 'none') return done('📚 見送り', ['今回は何も学ばなかった。'], 'info');
      p.money -= SKILL_SCHOOL_COST;
      const rate = Math.max(0.1, Math.min(1, p.stats.academic / 100 + 0.2));
      const pool = learnable(p, opt as SkillCategory);
      if (pool.length > 0 && rng() < rate) {
        const id = pick(rng, pool);
        p.skills.push(id);
        return done('📚 資格取得！', [`受講料${yen(SKILL_SCHOOL_COST)}を支払い、スキル「${SKILLS[id].name}」を習得した！`], 'good');
      }
      return done('📚 残念…', [`受講料${yen(SKILL_SCHOOL_COST)}を支払ったが、何も習得できなかった…`], 'bad');
    }

    case 'trial': {
      if (opt === 'skip') return done('🔥 見送り', ['今回は試練を見送った。'], 'info');
      if (rng() < 0.6) {
        p.money += TRIAL_REWARD;
        const stat = pick(rng, STAT_KEYS);
        p.stats[stat] = clampStat(p.stats[stat] + 10);
        const gained = tryGainSkill(p, 'positive', rng);
        return done('🔥 試練を乗り越えた！', [`報酬${yen(TRIAL_REWARD)}と${STAT_LABEL[stat]} +10！`, ...(gained ? [gained] : [])], 'good');
      }
      const gained = tryGainSkill(p, 'negative', rng);
      return done('🔥 試練に失敗…', [gained ?? 'しかし、特に悪いことは起こらなかった。'], 'bad');
    }

    case 'business': {
      if (opt === 'skip') return done('🚀 見送り', ['今回は堅実にいくことにした。'], 'info');
      p.money -= BUSINESS_COST;
      let rate = 0.3 + p.stats.academic / 200 + p.stats.luck / 200;
      if (has(p, 'JINMYAKU_HOFU')) rate += 0.1;
      if (has(p, 'SHISAN_UNYO')) rate += 0.1;
      rate = Math.max(0.05, Math.min(0.95, rate));
      if (rng() < rate) {
        const profit = Math.floor(rng() * 5 + 5) * 1_000_000;
        p.money += profit;
        p.job = 'ENTREPRENEUR';
        p.salary = JOBS.ENTREPRENEUR.salary;
        return done('🚀 起業大成功！', [`事業が軌道に乗り、${yen(profit)}の利益！`, '職業が「起業家」になった。'], 'good');
      }
      return done('🚀 起業失敗…', [`投資した${yen(BUSINESS_COST)}は水の泡に…`], 'bad');
    }

    case 'abroad': {
      if (opt === 'skip') return done('✈️ 見送り', ['やはり故郷が一番だ。'], 'info');
      p.money -= ABROAD_COST;
      let rate = 0.4;
      if (has(p, 'GOGAKU_TANNO')) rate += 0.3;
      if (p.stats.luck > 70) rate += 0.15;
      if (p.stats.charm > 70) rate += 0.1;
      rate = Math.max(0.05, Math.min(0.95, rate));
      if (rng() < rate) {
        const oc = p.stats.charm;
        const ol = p.stats.luck;
        p.stats.charm = clampStat(oc + int(rng, 10) + 5);
        p.stats.luck = clampStat(ol + int(rng, 10) + 5);
        const gained = has(p, 'GOGAKU_TANNO') ? null : tryGainSkill(p, 'positive', rng, 'knowledge');
        return done('✈️ 移住成功！', ['新たな環境で刺激的な日々が始まった！', `魅力 ${oc} → ${p.stats.charm}・運 ${ol} → ${p.stats.luck}`, ...(gained ? [gained] : [])], 'good');
      }
      const extra = Math.floor(ABROAD_COST * (rng() * 0.3 + 0.1));
      p.money -= extra;
      const gained = tryGainSkill(p, 'negative', rng, 'social');
      return done('✈️ 移住失敗…', [`移住先でトラブル発生… 余計な出費${yen(extra)}。`, ...(gained ? [gained] : [])], 'bad');
    }

    case 'illness': {
      const old = p.stats.physical;
      if (opt === 'treat') {
        p.money -= c.cost;
        p.stats.physical = clampStat(old - Math.max(1, Math.round(c.physicalDown * 0.5)));
        p.missTurns = Math.max(0, c.missTurns - 1);
        return done('🏥 治療した', [`治療費${yen(c.cost)}を支払った。`, `体力 ${old} → ${p.stats.physical}`, p.missTurns > 0 ? `${p.missTurns}回休み。` : 'すぐに回復できた！'], 'event');
      }
      p.stats.physical = clampStat(old - c.physicalDown);
      p.missTurns = c.missTurns + 1;
      const lines = ['治療を諦めた…', `体力 ${old} → ${p.stats.physical}`, `${p.missTurns}回休み。`];
      if (p.stats.physical <= MIN_STAT && !has(p, 'KYOJAKU_TAISHITSU')) {
        const gained = tryGainSkill(p, 'negative', rng, 'physical');
        if (gained) lines.push(gained);
      }
      return done('🏥 病状悪化…', lines, 'bad');
    }

    case 'branch': {
      if (opt === 'skip') return done('🔀 見送り', ['いまの道を進む。'], 'info');
      p.branchReturn = p.position;
      p.board = 'BRANCH_ROUTE';
      p.position = 0;
      p.isGoal = false;
      p.turnsOnBoard = 0;
      return done('🔀 分岐ルートへ！', [`${p.name}は新たな道へ進んだ！`], 'event');
    }
  }
}

// ---------------------------------------------------------------- ゴール・手番
function goalEvent(s: GameState, event: GoalEvent, now: number, rng: Rng): void {
  const p = current(s);
  switch (event) {
    case 'graduateHighSchool':
      return openChoice(s, now, { k: 'hsGraduation' });
    case 'graduateSchool':
      log(s, `${p.name}は${BOARDS[p.board].name}を卒業し、社会人への一歩を踏み出す！`, 'event', p.id);
      p.board = 'MAIN';
      p.position = 0;
      p.isGoal = false;
      p.turnsOnBoard = 0;
      return openChoice(s, now, jobChoice(p, true, false, rng));
    case 'finishBranchRoute':
      log(s, `${p.name}は分岐ルートをクリアし、社会人ボードに戻った。`, 'event', p.id);
      p.board = 'MAIN';
      p.position = p.branchReturn ?? 0;
      p.isGoal = false;
      p.turnsOnBoard = 0;
      p.branchReturn = null;
      return endTurn(s, now, rng);
    case 'reachGoal': {
      if (p.rank !== null) return endTurn(s, now, rng);
      s.goalOrder.push(p.id);
      p.rank = s.goalOrder.length;
      const bonus = GOAL_RANK_BONUSES[Math.min(p.rank, GOAL_RANK_BONUSES.length) - 1]!;
      p.money += bonus;
      log(s, `${p.name}が${p.rank}着で人生のゴール！ ボーナス${yen(bonus)}！`, 'good', p.id);
      return notice(s, now, { title: `🏁 ${p.rank}着でゴール！`, lines: [`ゴールボーナス${yen(bonus)}！`], tone: 'good', then: { k: 'endTurn' } });
    }
  }
}

const allGoaled = (s: GameState): boolean => s.players.every((p) => p.isGoal && p.board === 'MAIN');

function endTurn(s: GameState, now: number, rng: Rng): void {
  const p = current(s);
  if (p.board === 'MAIN' && p.salary > 0) {
    p.money += p.salary;
    log(s, `${p.name}は給料${yen(p.salary)}を受け取った。`, 'good', p.id);
  }
  let raise: string | null = null;
  if (p.board === 'MAIN' && JOBS[p.job].salaryUp > 0 && rng() < 0.05) {
    p.salary += JOBS[p.job].salaryUp;
    raise = `${JOBS[p.job].name}の月給が${yen(JOBS[p.job].salaryUp)}上がって${yen(p.salary)}に！`;
    log(s, `${p.name}：昇給！ ${raise}`, 'good', p.id);
  }

  if (allGoaled(s)) return finish(s);

  if (p.board === 'HIGH_SCHOOL') {
    p.turnsOnBoard += 1;
    if (p.turnsOnBoard >= HIGH_SCHOOL_MAX_TURNS && !p.isGoal) {
      p.position = s.boards.HIGH_SCHOOL.length - 1;
      p.isGoal = true;
      log(s, `${p.name}は高校で${HIGH_SCHOOL_MAX_TURNS}ターンを過ごし、卒業の時を迎えた。`, 'event', p.id);
      return notice(s, now, { title: '🎓 卒業の時', lines: [`高校生活も${HIGH_SCHOOL_MAX_TURNS}ターン目。卒業の時が来た！`], tone: 'event', then: { k: 'goal', event: 'graduateHighSchool' } });
    }
  }

  if (raise) return notice(s, now, { title: '📈 昇給！', lines: [raise], tone: 'good', then: { k: 'nextPlayer' } });
  nextPlayer(s, now);
}

function nextPlayer(s: GameState, now: number): void {
  const n = s.players.length;
  // ゴール済み（社会人ボード）の人は飛ばす。休みの人は1回減らして飛ばす。
  // 旧版は「減らしてから0なら今回動ける」だったので、1回休みが実際には休みにならなかった
  for (let guard = 0; guard < n * 20; guard++) {
    const prevTurn = s.turn;
    s.turn = (s.turn + 1) % n;
    if (s.turn <= prevTurn) s.round += 1;
    const p = current(s);
    if (p.isGoal && p.board === 'MAIN') continue;
    if (p.missTurns > 0) {
      p.missTurns -= 1;
      log(s, `${p.name}はお休み。${p.missTurns > 0 ? `（あと${p.missTurns}回）` : '次から動ける。'}`, 'info', p.id);
      continue;
    }
    setStep(s, { k: 'roll', deadline: waitFor(s, now, ROLL_MS) });
    return;
  }
  // ここに来るのは全員ゴールしたときだけ（endTurn で先に拾っているはず）
  finish(s);
}

export function scoreOf(p: Player): Omit<ScoreLine, 'place'> {
  const assets = p.possessions.reduce((a, x) => a + x.assetValue, 0);
  const skills = p.skills.reduce((a, id) => a + SKILLS[id].value, 0);
  return { playerId: p.id, money: p.money, assets, skills, total: p.money + assets + skills };
}

function finish(s: GameState): void {
  const lines = s.players.map(scoreOf).sort((a, b) => b.total - a.total);
  // 同点は同じ順位（1位, 1位, 3位 …）
  s.results = lines.map((l) => ({ ...l, place: lines.findIndex((x) => x.total === l.total) + 1 }));
  log(s, '全員が人生のゴールにたどり着いた！', 'event');
  setStep(s, { k: 'finished' });
}
