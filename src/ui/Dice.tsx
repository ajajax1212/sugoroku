/** 3×3 のマス目のどこに目を打つか（左上=0 … 右下=8） */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/**
 * サイコロ1個。rolling の間は目を毎フレーム変えて転がして見せる。
 * 転がっている間の目は見た目だけで、本当の出目はサーバーが決めて届いている
 */
export function Die({ value, rolling = false, size = 'lg', now = 0 }: { value: number | null; rolling?: boolean; size?: 'lg' | 'sm'; now?: number }) {
  const shown = rolling ? (Math.floor(now / 70) % 6) + 1 : value;
  return (
    <div className={`die die-${size}${rolling ? ' die-rolling' : ''}${shown === null ? ' die-blank' : ''}`} aria-label={shown ? `出目 ${shown}` : 'サイコロ'}>
      {shown === null ? (
        <span className="die-q">?</span>
      ) : (
        Array.from({ length: 9 }, (_, i) => <span key={i} className={PIPS[shown]!.includes(i) ? `pip${shown === 1 ? ' pip-one' : ''}` : 'pip-empty'} />)
      )}
    </div>
  );
}
