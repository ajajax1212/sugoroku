import { memo } from 'react';
import { type BoardKey, CELL_INFO } from '../engine/data';
import { type Cell, DICE_MS, type Player, STEP_MS, type Step } from '../engine/game';
import { TILE, playerColor } from './theme';

const TILE_SIZE = 84;
const GAP = 22;
const PITCH = TILE_SIZE + GAP;
const PAD = 18;

/** 盤面の列数。短い学校ボードは列を減らして、横に間延びしないようにする */
function colsFor(len: number): number {
  if (len <= 20) return 5;
  if (len <= 30) return 6;
  if (len <= 45) return 9;
  return 10;
}

/** i 番目のマスの中心。行ごとに向きを変える（蛇行）ので、道が途切れずにつながる */
function center(i: number, cols: number): { x: number; y: number } {
  const row = Math.floor(i / cols);
  const k = i % cols;
  const col = row % 2 === 0 ? k : cols - 1 - k;
  return { x: PAD + col * PITCH + TILE_SIZE / 2, y: PAD + row * PITCH + TILE_SIZE / 2 };
}

/** 同じマスに複数のコマが乗ったときのずらし方 */
const STACK = [
  [0, 0],
  [-17, -15],
  [17, -15],
  [-17, 17],
  [17, 17],
  [0, -26],
  [-26, 2],
  [26, 2],
] as const;

type Props = {
  boardKey: BoardKey;
  cells: Cell[];
  players: Player[];
  step: Step;
  turnId: string;
  me: string | null;
  now: number;
  /** 狭い画面。列を減らして縦に伸ばす（10列のままだとスマホでマスが指先より小さくなる） */
  narrow?: boolean;
};

/** マスの層は動かないので、コマが動くたびに描き直さないよう分けておく */
const Tiles = memo(function Tiles({ cells, cols }: { cells: Cell[]; cols: number }) {
  const pts = cells.map((_, i) => center(i, cols));
  const road = pts.map((p) => `${p.x},${p.y}`).join(' ');
  return (
    <g>
      <polyline className="road" points={road} />
      <polyline className="road-line" points={road} />
      {cells.map((cell, i) => {
        const { x, y } = pts[i]!;
        const tile = TILE[cell.type];
        const info = CELL_INFO[cell.type];
        return (
          <g key={i} className={`tile tile-${tile.family}`} transform={`translate(${x - TILE_SIZE / 2} ${y - TILE_SIZE / 2})`}>
            <title>{`${i + 1}. ${info.name}`}</title>
            <rect className="tile-shadow" x={0} y={4} width={TILE_SIZE} height={TILE_SIZE} rx={16} />
            <rect className="tile-face" width={TILE_SIZE} height={TILE_SIZE} rx={16} />
            <text className="tile-no" x={9} y={17}>
              {i + 1}
            </text>
            <text className="tile-icon" x={TILE_SIZE / 2} y={46} textAnchor="middle">
              {info.icon}
            </text>
            <text className="tile-label" x={TILE_SIZE / 2} y={71} textAnchor="middle">
              {tile.short}
            </text>
          </g>
        );
      })}
    </g>
  );
});

export function Board({ boardKey, cells, players, step, turnId, me, now, narrow = false }: Props) {
  const cols = narrow ? Math.min(6, colsFor(cells.length)) : colsFor(cells.length);
  const rows = Math.ceil(cells.length / cols);
  const width = PAD * 2 + cols * PITCH - GAP;
  const height = PAD * 2 + rows * PITCH - GAP + 6;

  const here = players.filter((p) => p.board === boardKey);
  // 同じマスにいる人を数えて、重ならないようにずらす
  const slot = new Map<string, number>();
  const count = new Map<number, number>();
  for (const p of here) {
    const pos = movingPos(p, step, boardKey, now, turnId)?.at ?? p.position;
    const k = Math.round(pos);
    const n = count.get(k) ?? 0;
    slot.set(p.id, n);
    count.set(k, n + 1);
  }

  // 止まったマスを光らせる。お知らせや選択肢が出ている間に「どこに止まったか」を盤面でも追えるように
  const turnPlayer = players.find((p) => p.id === turnId);
  const landed = (step.k === 'notice' || step.k === 'choice') && turnPlayer?.board === boardKey ? center(turnPlayer.position, cols) : null;

  // 手番の人を最後に描いて、いちばん手前に出す
  const order = [...here].sort((a, b) => Number(a.id === turnId) - Number(b.id === turnId));

  return (
    <svg className="board" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="すごろくの盤面">
      <Tiles cells={cells} cols={cols} />
      {landed && <rect className="landed" x={landed.x - TILE_SIZE / 2 - 6} y={landed.y - TILE_SIZE / 2 - 6} width={TILE_SIZE + 12} height={TILE_SIZE + 12} rx={20} />}
      {order.map((p) => {
        const moving = movingPos(p, step, boardKey, now, turnId);
        let x: number;
        let y: number;
        if (moving) {
          const a = center(Math.floor(moving.at), cols);
          const b = center(Math.min(cells.length - 1, Math.floor(moving.at) + 1), cols);
          const f = moving.at - Math.floor(moving.at);
          x = a.x + (b.x - a.x) * f;
          // 1マスごとに小さく跳ねる
          y = a.y + (b.y - a.y) * f - Math.sin(Math.PI * f) * 22;
        } else {
          ({ x, y } = center(p.position, cols));
        }
        const [dx, dy] = moving ? [0, 0] : STACK[(slot.get(p.id) ?? 0) % STACK.length]!;
        const active = p.id === turnId;
        return (
          <g key={p.id} className={`piece${active ? ' piece-active' : ''}${p.connected ? '' : ' piece-away'}`} transform={`translate(${x + dx} ${y + dy})`}>
            {active && <circle className="piece-ring" r={24} style={{ stroke: playerColor(p.color) }} />}
            <circle className="piece-shadow" cy={4} r={16} />
            <circle className="piece-body" r={16} style={{ fill: playerColor(p.color) }} />
            <text className="piece-initial" y={6} textAnchor="middle">
              {[...p.name][0]}
            </text>
            {p.id === me && (
              <path className="piece-me" d="M -7 -30 L 7 -30 L 0 -22 Z" style={{ fill: playerColor(p.color) }} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 移動中のコマの位置（マス番号、小数で途中）。サーバーは移動先を先に確定させているので、
 * 画面は move の開始時刻からの経過で from → to を補間して見せる。移動中でなければ null
 */
function movingPos(p: Player, step: Step, boardKey: BoardKey, now: number, turnId: string): { at: number } | null {
  if (step.k !== 'move' || p.id !== turnId || step.board !== boardKey || p.board !== boardKey) return null;
  const t = (now - step.startedAt - DICE_MS) / STEP_MS;
  if (t >= step.to - step.from) return null;
  return { at: step.from + Math.max(0, t) };
}
