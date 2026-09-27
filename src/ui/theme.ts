/**
 * 画面の都合だけで決めている見た目の対応表。ルールには影響しない。
 */
import type { CellType } from '../engine/data';

/** プレイヤーの色。入った順に割り当てる。隣同士で見分けやすい順に並べてある */
export const PLAYER_COLORS = ['#e2553f', '#2f6fd6', '#2f9e6a', '#e8a21a', '#8a4fd6', '#e05a9c', '#159a9a', '#7a5534'];
export const playerColor = (i: number): string => PLAYER_COLORS[i % PLAYER_COLORS.length]!;

/**
 * マスの系統。色はこの系統ごとに CSS 変数（--tile-<family>）で決める。
 * マスの種類ごとに色を変えると 27 色になって、盤面を見ても「良いマスか悪いマスか」が分からない
 */
export type TileFamily = 'start' | 'goal' | 'up' | 'down' | 'gain' | 'cost' | 'chance' | 'love' | 'danger' | 'plain';

export const TILE: Record<CellType, { family: TileFamily; short: string }> = {
  START: { family: 'start', short: 'スタート' },
  GOAL: { family: 'goal', short: 'ゴール' },
  SCHOOL_GOAL: { family: 'goal', short: '卒業' },
  BRANCH_GOAL: { family: 'goal', short: 'クリア' },
  MONEY_GOOD_ADULT: { family: 'gain', short: '臨時収入' },
  MONEY_BAD_ADULT: { family: 'cost', short: '出費' },
  MONEY_SCHOOL: { family: 'cost', short: '学費' },
  STATUS_GOOD: { family: 'up', short: 'アップ' },
  STATUS_BAD: { family: 'down', short: 'ダウン' },
  SUPER_BAD_HS: { family: 'danger', short: '超BAD' },
  SUPER_BAD_ADULT: { family: 'danger', short: '超BAD' },
  JOB_SELECT: { family: 'chance', short: '就職' },
  LOVE_EVENT: { family: 'love', short: '恋愛' },
  BRANCH_POINT: { family: 'chance', short: '分岐' },
  NORMAL: { family: 'plain', short: '' },
  SKILL_EVENT_SPECIFIC: { family: 'up', short: 'スキル' },
  MIXED_STAT_EVENT: { family: 'plain', short: '運命' },
  FORCED_JOB_CHANGE: { family: 'danger', short: '強制転職' },
  JOB_SPECIFIC_EVENT: { family: 'gain', short: '仕事' },
  SHOPPING_EVENT: { family: 'chance', short: '買い物' },
  LOTTERY_EVENT: { family: 'chance', short: '宝くじ' },
  SKILL_SCHOOL_EVENT: { family: 'chance', short: '資格' },
  TRIAL_EVENT: { family: 'chance', short: '試練' },
  START_BUSINESS_EVENT: { family: 'chance', short: '起業' },
  MOVE_ABROAD_EVENT: { family: 'chance', short: '海外' },
  ILLNESS_EVENT: { family: 'danger', short: '病気' },
  INHERITANCE_EVENT: { family: 'gain', short: '遺産' },
};

/** 凡例に出す系統と説明 */
export const LEGEND: { family: TileFamily; label: string }[] = [
  { family: 'up', label: '能力アップ' },
  { family: 'down', label: '能力ダウン' },
  { family: 'gain', label: 'お金が増えるかも' },
  { family: 'cost', label: '出費' },
  { family: 'chance', label: '選べるチャンス' },
  { family: 'love', label: '恋愛' },
  { family: 'danger', label: '要注意' },
];
