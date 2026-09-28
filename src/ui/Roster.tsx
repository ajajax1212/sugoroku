import { BOARDS, ITEMS, JOBS, SKILLS, STAT_KEYS, STAT_LABEL } from '../engine/data';
import type { Player } from '../engine/game';
import { man } from './format';
import { playerColor } from './theme';

/** 所持金の順位。カードの並びは入った順のまま（手番の順と揃える）で、順位は札で見せる */
export function moneyRanks(players: Player[]): Map<string, number> {
  const sorted = [...players].sort((a, b) => b.money - a.money);
  return new Map(players.map((p) => [p.id, sorted.findIndex((x) => x.money === p.money) + 1]));
}

export function Roster({ players, turnId, me }: { players: Player[]; turnId: string; me: string | null }) {
  const ranks = moneyRanks(players);
  return (
    <ol className="roster">
      {players.map((p) => {
        const color = playerColor(p.color);
        const active = p.id === turnId;
        const positive = p.skills.filter((s) => SKILLS[s].type === 'positive');
        const negative = p.skills.filter((s) => SKILLS[s].type === 'negative');
        return (
          <li key={p.id} className={`pcard${active ? ' pcard-active' : ''}${p.connected ? '' : ' pcard-away'}`} style={{ '--pc': color } as React.CSSProperties}>
            <div className="pcard-head">
              <span className="pcard-dot">{[...p.name][0]}</span>
              <span className="seat-who">
                <span className="pcard-name">{p.name}</span>
                {(p.id === me || active || !p.connected) && (
                  <span className="seat-tags">
                    {p.id === me && <span className="tag tag-me">あなた</span>}
                    {active && <span className="tag tag-turn">手番</span>}
                    {!p.connected && <span className="tag tag-away">不在</span>}
                  </span>
                )}
              </span>
            </div>
            <div className="pcard-money">
              <span className="pcard-rank">{ranks.get(p.id)}位</span>
              <strong className="num">{man(p.money)}</strong>
            </div>
            <div className="pcard-meta">
              <span>💼 {p.job === 'NONE' ? '学生' : JOBS[p.job].name}</span>
              {p.salary > 0 && <span className="muted">給料{man(p.salary)}</span>}
            </div>
            <div className="pcard-meta">
              <span className="chip">{p.rank ? `🏁 ${p.rank}着` : `📍 ${BOARDS[p.board].short} ${p.position + 1}マス`}</span>
              {p.family > 0 && <span className="chip">👪 {p.family}</span>}
              {p.missTurns > 0 && <span className="chip chip-warn">💤 {p.missTurns}回休み</span>}
            </div>
            <div className="stats">
              {STAT_KEYS.map((k) => (
                <div key={k} className="stat" title={`${STAT_LABEL[k]} ${p.stats[k]}`}>
                  <span className="stat-label">{STAT_LABEL[k][0]}</span>
                  <span className="stat-bar">
                    <span className={`stat-fill stat-${k}`} style={{ width: `${p.stats[k]}%` }} />
                  </span>
                  <span className="stat-num num">{p.stats[k]}</span>
                </div>
              ))}
            </div>
            {(p.skills.length > 0 || p.possessions.length > 0) && (
              <details className="pcard-more">
                <summary>
                  スキル {positive.length}
                  {negative.length > 0 && <span className="neg">／−{negative.length}</span>}・持ち物 {p.possessions.length}
                </summary>
                <ul>
                  {p.skills.map((s) => (
                    <li key={s} className={SKILLS[s].type === 'negative' ? 'neg' : ''} title={SKILLS[s].effect}>
                      {SKILLS[s].type === 'positive' ? '＋' : '−'} {SKILLS[s].name}
                    </li>
                  ))}
                  {p.possessions.map((x) => (
                    <li key={x.itemId}>
                      {ITEMS[x.itemId].icon} {ITEMS[x.itemId].name} <span className="muted">（{man(x.assetValue)}）</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
