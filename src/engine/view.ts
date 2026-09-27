/**
 * 画面に配る形。
 *
 * このゲームは手札や山札のような「他人に見せてはいけない情報」を持たない（全員の所持金も盤面も公開）。
 * 乱数もサーバーの Math.random で、種を状態に入れていないので、覗かれて先読みされることもない。
 * なので senryu-game の viewFor のような1人分の絞り込みは要らず、全員に同じものを配る。
 *
 * ここでやるのは、選択肢の中身（押せるか・値段）をサーバー側で確定させて添えることだけ。
 * 画面が自分で計算し直すと、サーバーの判定とずれたときに「押せるのに弾かれる」ボタンができる。
 */
import { type ChoiceOption, type GameState, choiceOptions, choiceTitle } from './game';

export type ChoiceView = { title: string; body: string[]; options: ChoiceOption[] };
export type GameView = GameState & { choiceView: ChoiceView | null };

export function viewOf(s: GameState): GameView {
  const step = s.step;
  const choiceView = step.k === 'choice' ? { ...choiceTitle(step.choice), options: choiceOptions(s, step.choice) } : null;
  return { ...s, choiceView };
}
