import { useEffect, useRef, useState } from 'react';
import { DICE_MS } from '../engine/game';
import type { GameView } from '../engine/view';
import type { Room } from '../net/useRoom';
import { Die } from './Dice';
import { playerColor } from './theme';

/**
 * 進行パネル。いま何を待っているか（サイコロ・お知らせ・選択）を1か所で見せる。
 * 盤面の上に重ねると盤面が隠れて「どこに止まったか」が見えなくなるので、横に置いている
 */
export function Stage({ game, me, room, now }: { game: GameView; me: string | null; room: Room; now: number }) {
  const step = game.step;
  const turn = game.players[game.turn]!;
  const mine = turn.id === me;
  const color = playerColor(turn.color);
  const [busy, setBusy] = useState(false);

  // 直前の出目は、移動が終わってからもサイコロに残しておく（次の人が振るまで）
  const lastDice = useRef<number | null>(null);
  if (step.k === 'move') lastDice.current = step.dice;
  const turnKey = `${game.turn}:${game.round}`;
  const prevTurn = useRef(turnKey);
  if (prevTurn.current !== turnKey) {
    prevTurn.current = turnKey;
    if (step.k === 'roll') lastDice.current = null;
  }

  // 自分の手番はキーボードでも進められる（Space / Enter）
  useEffect(() => {
    if (!mine) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (step.k === 'roll') {
        e.preventDefault();
        void room.roll();
      } else if (step.k === 'notice') {
        e.preventDefault();
        void room.skipNotice();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mine, step.k, room]);

  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    await fn();
    setBusy(false);
  };

  const secondsLeft = (deadline: number) => Math.max(0, Math.ceil((deadline - now) / 1000));

  return (
    <section className="stage" style={{ '--pc': color } as React.CSSProperties}>
      <header className="stage-head">
        <span className="stage-dot">{[...turn.name][0]}</span>
        <div>
          <div className="stage-who">{mine ? 'あなたの番！' : `${turn.name}の番`}</div>
          <div className="stage-sub">{game.round + 1}周目</div>
        </div>
      </header>

      {step.k === 'roll' && (
        <div className="stage-body stage-roll">
          <Die value={lastDice.current} />
          {mine ? (
            <>
              <button type="button" className="btn btn-roll" disabled={busy} onClick={() => act(room.roll)}>
                サイコロを振る
              </button>
              <p className="hint">Space でも振れます{secondsLeft(step.deadline) <= 15 && `・あと${secondsLeft(step.deadline)}秒で自動で振ります`}</p>
            </>
          ) : (
            <p className="waiting">
              {turn.connected ? `${turn.name}がサイコロを振るのを待っています` : `${turn.name}は不在です。代わりに振ります…`}
              {turn.connected && secondsLeft(step.deadline) <= 15 && <span className="muted">（あと{secondsLeft(step.deadline)}秒で自動）</span>}
            </p>
          )}
        </div>
      )}

      {step.k === 'move' && (
        <div className="stage-body stage-roll">
          <Die value={step.dice} rolling={now < step.startedAt + DICE_MS} now={now} />
          <p className="move-text">{now < step.startedAt + DICE_MS ? 'コロコロ…' : `${step.dice}！ ${step.to - step.from}マス進む`}</p>
        </div>
      )}

      {step.k === 'notice' && (
        <div
          className={`notice notice-${step.notice.tone}${mine ? ' notice-clickable' : ''}`}
          key={game.seq}
          onClick={mine ? () => void room.skipNotice() : undefined}
          role={mine ? 'button' : undefined}
        >
          <h3 className="notice-title">{step.notice.title}</h3>
          {step.notice.dice && (
            <div className="notice-dice">
              {step.notice.dice.map((d, i) => (
                <Die key={i} value={d} size="sm" />
              ))}
            </div>
          )}
          {step.notice.lines.map((l, i) => (
            <p key={i} className="notice-line">
              {l}
            </p>
          ))}
          <Countdown endsAt={step.endsAt} now={now} seq={game.seq} />
          <p className="notice-foot">{mine ? 'クリックか Enter で次へ' : '自動で進みます'}</p>
        </div>
      )}

      {step.k === 'choice' && game.choiceView && (
        <div className="choice" key={game.seq}>
          <h3 className="choice-title">{game.choiceView.title}</h3>
          {game.choiceView.body.map((l, i) => (
            <p key={i} className="choice-body">
              {l}
            </p>
          ))}
          <div className={`choice-options${game.choiceView.options.length > 5 ? ' choice-options-dense' : ''}`}>
            {game.choiceView.options.map((o) => (
              <button
                type="button"
                key={o.id}
                className={`opt opt-${o.tone ?? 'primary'}`}
                disabled={!mine || busy || o.disabled}
                onClick={() => act(() => room.choose(o.id))}
              >
                <span className="opt-label">{o.label}</span>
                {o.sub && <span className="opt-sub">{o.sub}</span>}
              </button>
            ))}
          </div>
          <p className="choice-foot">
            {mine ? `あと${secondsLeft(step.deadline)}秒で自動で決まります` : `${turn.name}が選んでいます…（あと${secondsLeft(step.deadline)}秒）`}
          </p>
        </div>
      )}
    </section>
  );
}

/** 残り時間の帯。お知らせが「いつ消えるか」を見せる。旧版は予告なしに消えていた */
function Countdown({ endsAt, now, seq }: { endsAt: number; now: number; seq: number }) {
  // 表示を始めた時刻を覚えておき、そこからの割合で縮める（締切だけでは全体の長さが分からない）
  const started = useRef<{ seq: number; at: number }>({ seq, at: now });
  if (started.current.seq !== seq) started.current = { seq, at: now };
  const total = Math.max(1, endsAt - started.current.at);
  const left = Math.max(0, Math.min(1, (endsAt - now) / total));
  return (
    <div className="countdown" aria-hidden>
      <span style={{ transform: `scaleX(${left})` }} />
    </div>
  );
}
