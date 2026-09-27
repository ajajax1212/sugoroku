/**
 * 金額は「万円」で見せる。人生ゲームの額は数十万〜数億まで開くので、
 * 1,234,567円 のように桁を全部並べると、一覧で大小がひと目で分からない
 */
export function man(n: number): string {
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (a < 10_000) return `${sign}${a.toLocaleString('ja-JP')}円`;
  if (a >= 100_000_000) {
    const oku = Math.floor(a / 100_000_000);
    const rest = Math.round((a % 100_000_000) / 10_000);
    return `${sign}${oku}億${rest > 0 ? `${rest.toLocaleString('ja-JP')}万` : ''}円`;
  }
  const v = a / 10_000;
  return `${sign}${v >= 100 ? Math.round(v).toLocaleString('ja-JP') : v.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万円`;
}
