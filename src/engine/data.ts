/**
 * ルールの数値。旧版（public/constants.js）から値を変えずに移植したもの。
 * バランスに関わるので、ここの数字を変えるときは必ず本人に確認する。
 *
 * 旧版にあった Tailwind のクラス名（色）は画面の都合なので ui/ 側へ移した。
 * スキルの dynamicEffect は旧版で一度も呼ばれていなかったので持ってこない（効果は game.ts に直書きの分だけ）。
 */

export const INITIAL_MONEY = 200_000;
export const STAT_KEYS = ['academic', 'physical', 'charm', 'luck'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;
export const INITIAL_STATS: Stats = { academic: 50, physical: 50, charm: 50, luck: 50 };
export const MAX_STAT = 100;
export const MIN_STAT = 0;

export const STATUS_GOOD_SCHOOL_BONUS = 5;
export const GOAL_RANK_BONUSES = [500_000, 300_000, 100_000, 50_000];

export const STAT_LABEL: Record<StatKey, string> = { academic: '学力', physical: '体力', charm: '魅力', luck: '運' };

export type CellType =
  | 'START'
  | 'GOAL'
  | 'SCHOOL_GOAL'
  | 'BRANCH_GOAL'
  | 'MONEY_GOOD_ADULT'
  | 'MONEY_BAD_ADULT'
  | 'MONEY_SCHOOL'
  | 'STATUS_GOOD'
  | 'STATUS_BAD'
  | 'SUPER_BAD_HS'
  | 'SUPER_BAD_ADULT'
  | 'JOB_SELECT'
  | 'LOVE_EVENT'
  | 'BRANCH_POINT'
  | 'NORMAL'
  | 'SKILL_EVENT_SPECIFIC'
  | 'MIXED_STAT_EVENT'
  | 'FORCED_JOB_CHANGE'
  | 'JOB_SPECIFIC_EVENT'
  | 'SHOPPING_EVENT'
  | 'LOTTERY_EVENT'
  | 'SKILL_SCHOOL_EVENT'
  | 'TRIAL_EVENT'
  | 'START_BUSINESS_EVENT'
  | 'MOVE_ABROAD_EVENT'
  | 'ILLNESS_EVENT'
  | 'INHERITANCE_EVENT';

export const CELL_INFO: Record<CellType, { icon: string; name: string }> = {
  START: { icon: '🏠', name: 'スタート' },
  GOAL: { icon: '🏁', name: 'ゴール' },
  SCHOOL_GOAL: { icon: '🎓', name: '卒業' },
  BRANCH_GOAL: { icon: '✨', name: '分岐クリア' },
  MONEY_GOOD_ADULT: { icon: '💰', name: '臨時収入' },
  MONEY_BAD_ADULT: { icon: '💸', name: '出費' },
  MONEY_SCHOOL: { icon: '🏫', name: '学校関連費' },
  STATUS_GOOD: { icon: '👍', name: 'ステータスアップ' },
  STATUS_BAD: { icon: '👎', name: 'ステータスダウン' },
  SUPER_BAD_HS: { icon: '💀', name: '高校超BAD' },
  SUPER_BAD_ADULT: { icon: '⚡', name: '超BAD' },
  JOB_SELECT: { icon: '💼', name: '就職・転職' },
  LOVE_EVENT: { icon: '❤️', name: '恋愛' },
  BRANCH_POINT: { icon: '🔀', name: '分岐点' },
  NORMAL: { icon: '⚪', name: '通常' },
  SKILL_EVENT_SPECIFIC: { icon: '💡', name: 'スキル獲得' },
  MIXED_STAT_EVENT: { icon: '🔄', name: '複合イベント' },
  FORCED_JOB_CHANGE: { icon: '💥', name: '強制転職' },
  JOB_SPECIFIC_EVENT: { icon: '🏢', name: '職業イベント' },
  SHOPPING_EVENT: { icon: '🛒', name: '買い物' },
  LOTTERY_EVENT: { icon: '🎰', name: '宝くじ' },
  SKILL_SCHOOL_EVENT: { icon: '📚', name: '資格の学校' },
  TRIAL_EVENT: { icon: '🔥', name: '人生の試練' },
  START_BUSINESS_EVENT: { icon: '🚀', name: '起業' },
  MOVE_ABROAD_EVENT: { icon: '✈️', name: '海外移住' },
  ILLNESS_EVENT: { icon: '🏥', name: '病気' },
  INHERITANCE_EVENT: { icon: '📜', name: '遺産相続' },
};

export type JobId =
  | 'NONE'
  | 'FREETER'
  | 'SALARYMAN'
  | 'DOCTOR'
  | 'LAWYER'
  | 'TEACHER'
  | 'ATHLETE'
  | 'CELEBRITY'
  | 'YOUTUBER'
  | 'WEB_DESIGNER'
  | 'ILLUSTRATOR'
  | 'BEAUTICIAN'
  | 'RESTAURANT_OWNER'
  | 'RESEARCHER'
  | 'PROGRAMMER'
  | 'TREASURE_HUNTER'
  | 'GAMBLER'
  | 'ARTIST'
  | 'MODEL'
  | 'VOICE_ACTOR'
  | 'INFLUENCER'
  | 'ENTREPRENEUR';

export type Job = {
  name: string;
  conditions: Partial<Stats>;
  salary: number;
  salaryUp: number;
  oneTimeBonus?: number;
  description?: string;
  special?: boolean;
};

export const JOBS: Record<JobId, Job> = {
  NONE: { name: 'なし', conditions: {}, salary: 0, salaryUp: 0 },
  FREETER: { name: 'フリーター', conditions: {}, salary: 100_000, salaryUp: 5_000, description: '自由な働き方だが収入は不安定。' },
  SALARYMAN: { name: 'サラリーマン', conditions: { academic: 55, charm: 50 }, salary: 250_000, salaryUp: 20_000, description: '安定した収入と社会的信用。' },
  DOCTOR: { name: '医者', conditions: { academic: 90, physical: 70 }, salary: 700_000, salaryUp: 50_000, description: '人々の命を救う高給取りだが、責任も重い。' },
  LAWYER: { name: '弁護士', conditions: { academic: 90 }, salary: 650_000, salaryUp: 45_000, description: '法の下の正義を実現する。高い学識が求められる。' },
  TEACHER: { name: '教師', conditions: { academic: 65, charm: 60 }, salary: 300_000, salaryUp: 25_000, description: '未来を担う若者を育てる、やりがいのある仕事。' },
  ATHLETE: { name: 'スポーツ選手', conditions: { physical: 85 }, salary: 650_000, salaryUp: 60_000, oneTimeBonus: 10_000_000, description: '努力と才能で頂点を目指す。体力と運が重要。' },
  CELEBRITY: { name: '芸能人', conditions: { charm: 85 }, salary: 600_000, salaryUp: 70_000, oneTimeBonus: 5_000_000, description: '人気と才能で輝くスター。魅力が成功の鍵。' },
  YOUTUBER: { name: 'Youtuber', conditions: { charm: 70, academic: 50 }, salary: 400_000, salaryUp: 100_000, description: '動画配信で一攫千金も夢じゃない！？企画力と魅力が問われる。' },
  WEB_DESIGNER: { name: 'Webデザイナー', conditions: { academic: 60, charm: 50 }, salary: 350_000, salaryUp: 30_000, description: 'ウェブサイトをデザインするクリエイティブな仕事。' },
  ILLUSTRATOR: { name: 'イラストレーター/漫画家', conditions: { academic: 50, charm: 65 }, salary: 300_000, salaryUp: 35_000, description: '絵や物語で人々を魅了する。発想力と画力が大切。' },
  BEAUTICIAN: { name: '美容師/ネイリスト', conditions: { charm: 70, physical: 50 }, salary: 280_000, salaryUp: 20_000, description: '美を追求し、人々を輝かせる仕事。' },
  RESTAURANT_OWNER: { name: '飲食店経営者', conditions: { charm: 60, physical: 60 }, salary: 250_000, salaryUp: 40_000, description: '自分の店を持ち、美味しい料理とサービスを提供する。' },
  RESEARCHER: { name: '研究者', conditions: { academic: 75 }, salary: 400_000, salaryUp: 30_000, description: '未知の真理を探求する。知的好奇心と忍耐力が必要。' },
  PROGRAMMER: { name: 'プログラマー/エンジニア', conditions: { academic: 70 }, salary: 400_000, salaryUp: 35_000, description: 'ソフトウェアやシステムを開発する技術職。' },
  TREASURE_HUNTER: { name: 'トレジャーハンター', conditions: { physical: 70, luck: 70 }, salary: 100_000, salaryUp: 10_000, special: true, description: '遺跡や秘境を探索し、失われた財宝を発見するロマン溢れる職業。体力と運が重要。' },
  GAMBLER: { name: 'ギャンブラー', conditions: { luck: 75 }, salary: 50_000, salaryUp: 0, special: true, description: '一攫千金を夢見る勝負師。運が全てを左右するスリリングな生き方。' },
  ARTIST: { name: '芸術家', conditions: { charm: 70, academic: 60 }, salary: 80_000, salaryUp: 10_000, special: true, description: '独自の感性で作品を創造し、人々の心を動かす。魅力と学識が成功の鍵。' },
  MODEL: { name: 'モデル', conditions: { charm: 90, physical: 70 }, salary: 550_000, salaryUp: 65_000, oneTimeBonus: 7_000_000, description: 'ファッション界の華。美貌とスタイルが求められる。' },
  VOICE_ACTOR: { name: '声優', conditions: { charm: 80, academic: 50 }, salary: 450_000, salaryUp: 40_000, description: '声でキャラクターに命を吹き込む。表現力と演技力が必要。' },
  INFLUENCER: { name: 'インフルエンサー', conditions: { charm: 90 }, salary: 400_000, salaryUp: 100_000, description: 'SNSで情報を発信し、多くの人に影響を与える。' },
  ENTREPRENEUR: { name: '起業家', conditions: { academic: 60, luck: 60 }, salary: 0, salaryUp: 0, description: '自ら事業を興し、夢を追いかける。成功すれば巨万の富も。' },
};

export type SkillCategory = 'knowledge' | 'physical' | 'social' | 'life';
export const SKILL_CATEGORY_LABEL: Record<SkillCategory, string> = { knowledge: '知識', physical: '身体', social: '社交', life: '生活' };
export const STAT_TO_CATEGORY: Record<StatKey, SkillCategory> = { academic: 'knowledge', physical: 'physical', charm: 'social', luck: 'life' };

export type Skill = { name: string; type: 'positive' | 'negative'; category: SkillCategory; effect: string; value: number };

export const SKILLS = {
  HAKUSHIKI: { name: '博識', type: 'positive', category: 'knowledge', effect: '学力判定時有利、学力上昇イベント効果UP。', value: 50_000 },
  JOHOTSU: { name: '情報通', type: 'positive', category: 'knowledge', effect: '一部イベントで有利な選択肢が出現。就職・転職で選択肢が増えることがある。', value: 40_000 },
  GOGAKU_TANNO: { name: '語学堪能', type: 'positive', category: 'knowledge', effect: '海外関連イベントで成功率UP、獲得金額UP。', value: 60_000 },
  PC_SKILL: { name: 'PCスキル', type: 'positive', category: 'knowledge', effect: '一部職業で給料UP、IT系イベントで有利。', value: 70_000 },
  SHISAN_UNYO: { name: '資産運用知識', type: 'positive', category: 'knowledge', effect: 'お金獲得イベントで獲得額UP。', value: 100_000 },
  KENKO_TAI: { name: '健康体', type: 'positive', category: 'physical', effect: '体力低下イベントの効果軽減、病気になりにくい。', value: 80_000 },
  UNDO_SHINKEI: { name: '運動神経抜群', type: 'positive', category: 'physical', effect: '体力判定時有利、スポーツ系イベントで成功率UP。', value: 70_000 },
  TOUGHNESS: { name: 'タフネス', type: 'positive', category: 'physical', effect: 'BADイベントのステータス減少を少し軽減。', value: 60_000 },
  DIY_SKILL: { name: 'DIYスキル', type: 'positive', category: 'physical', effect: '一部出費イベントを回避または軽減。', value: 30_000 },
  JINMYAKU_HOFU: { name: '人脈豊富', type: 'positive', category: 'social', effect: '就職や一部イベントで有利。', value: 90_000 },
  CHARISMA: { name: 'カリスマ', type: 'positive', category: 'social', effect: '魅力判定時有利、対人イベントで成功率UP。', value: 80_000 },
  KIKIJOUZU: { name: '聞き上手', type: 'positive', category: 'social', effect: '恋愛イベントや対人トラブル回避に有利。', value: 50_000 },
  COMMURYOKU_OBAKE: { name: 'コミュ力おばけ', type: 'positive', category: 'social', effect: '多くの対人イベントで成功率大幅UP。', value: 120_000 },
  AZATO_JOSHI_DANSHI: { name: 'あざと女子（男子）', type: 'positive', category: 'social', effect: '異性関連のイベントで特に有利。', value: 60_000 },
  KENYAKUKA: { name: '倹約家', type: 'positive', category: 'life', effect: '出費イベントの効果軽減。', value: 70_000 },
  KAIMONO_JOUZU: { name: '買い物上手', type: 'positive', category: 'life', effect: '一部アイテム購入イベントで割引。', value: 40_000 },
  GOUN: { name: '豪運', type: 'positive', category: 'life', effect: '運判定時有利、良いイベントの発生率が微増。', value: 150_000 },
  HOKO_ONCHI: { name: '方向音痴', type: 'negative', category: 'knowledge', effect: '移動系イベントで失敗しやすくなる。', value: -30_000 },
  UKKARI_HACHIBEI: { name: 'うっかり八兵衛', type: 'negative', category: 'knowledge', effect: 'アイテム紛失や小さな損害イベントが発生しやすくなる。', value: -40_000 },
  KIKAI_ONCHI: { name: '機械音痴', type: 'negative', category: 'knowledge', effect: 'IT系イベントで不利、機械トラブルに巻き込まれやすい。', value: -50_000 },
  RONRI_SHIKO_NIGATE: { name: '論理的思考苦手', type: 'negative', category: 'knowledge', effect: '学力判定や問題解決イベントで不利。', value: -60_000 },
  KYOJAKU_TAISHITSU: { name: '虚弱体質', type: 'negative', category: 'physical', effect: '体力低下イベントの効果増大、病気になりやすい。', value: -70_000 },
  UNDO_GIRAI: { name: '運動嫌い', type: 'negative', category: 'physical', effect: '体力上昇イベントの効果減、体力低下しやすい。', value: -50_000 },
  INDOOR_HA: { name: 'インドア派', type: 'negative', category: 'physical', effect: '一部アウトドア系イベントに参加できない、または不利。', value: -20_000 },
  HITOMISHIRI: { name: '人見知り', type: 'negative', category: 'social', effect: '対人イベントで不利、新しい出会いが減る。', value: -60_000 },
  OSHABERI_SUKI: { name: 'おしゃべり好き', type: 'negative', category: 'social', effect: '余計な一言でトラブルを招くことがある。', value: -30_000 },
  KODAWARI_TSUYOSUGI: { name: 'こだわり強すぎ', type: 'negative', category: 'social', effect: '協調性が求められる場面で不利。', value: -40_000 },
  JIISHIKI_KAJO: { name: '自意識過剰', type: 'negative', category: 'social', effect: '周囲から引かれることがある。', value: -30_000 },
  SUKEBE: { name: 'スケベ', type: 'negative', category: 'social', effect: 'セクハライベントのリスク、評判ダウン。', value: -80_000 },
  ROHIKA: { name: '浪費家', type: 'negative', category: 'life', effect: '出費イベントの効果増大、お金が貯まりにくい。', value: -90_000 },
  SHODO_GAI_KUSE: { name: '衝動買い癖', type: 'negative', category: 'life', effect: '不要なものを買ってしまい、お金を失いやすい。', value: -70_000 },
  SHAKKIN_TAISHITSU: { name: '借金体質', type: 'negative', category: 'life', effect: '借金イベントが発生しやすくなる。', value: -100_000 },
  ZUBORA: { name: 'ズボラ', type: 'negative', category: 'life', effect: '家の維持費増大、一部イベントでペナルティ。', value: -50_000 },
} satisfies Record<string, Skill>;
export type SkillId = keyof typeof SKILLS;
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

export type ItemId =
  | 'USED_CAR'
  | 'NEW_CAR'
  | 'LUXURY_CAR'
  | 'SMALL_APARTMENT'
  | 'FAMILY_HOUSE'
  | 'LUXURY_CONDO'
  | 'GOLD_BAR'
  | 'DIAMOND_RING'
  | 'ART_PIECE'
  | 'LUXURY_WATCH'
  | 'SMALL_LAND'
  | 'PRIVATE_JET'
  | 'MYSTERIOUS_BEADS'
  | 'ENGAGEMENT_RING'
  | 'USED_MOTORCYCLE'
  | 'DESIGNER_BAG'
  | 'LATEST_PC'
  | 'HIGH_END_CAMERA'
  | 'FASHIONABLE_CLOTHES'
  | 'ANTIQUE_FURNITURE';

/** assetValue が 'random' のものは買った瞬間に 500〜500,000円のどれかに決まる（旧版の怪しい数珠） */
export type Item = { name: string; price: number; assetValue: number | 'random'; icon: string };

export const ITEMS: Record<ItemId, Item> = {
  USED_CAR: { name: '中古車', price: 500_000, assetValue: 400_000, icon: '🚗' },
  NEW_CAR: { name: '新車', price: 2_000_000, assetValue: 1_800_000, icon: '🚙' },
  LUXURY_CAR: { name: '高級車', price: 10_000_000, assetValue: 9_000_000, icon: '🏎️' },
  SMALL_APARTMENT: { name: 'ワンルームマンション', price: 8_000_000, assetValue: 7_500_000, icon: '🏢' },
  FAMILY_HOUSE: { name: '一戸建て', price: 30_000_000, assetValue: 28_000_000, icon: '🏡' },
  LUXURY_CONDO: { name: '高級マンション', price: 100_000_000, assetValue: 95_000_000, icon: '🌆' },
  GOLD_BAR: { name: '金の延べ棒', price: 7_000_000, assetValue: 7_000_000, icon: '🪙' },
  DIAMOND_RING: { name: 'ダイヤモンドリング', price: 1_000_000, assetValue: 900_000, icon: '💎' },
  ART_PIECE: { name: '美術品', price: 5_000_000, assetValue: 6_000_000, icon: '🖼️' },
  LUXURY_WATCH: { name: '高級腕時計', price: 1_500_000, assetValue: 1_200_000, icon: '⌚' },
  SMALL_LAND: { name: '小さな土地', price: 15_000_000, assetValue: 16_000_000, icon: '🌱' },
  PRIVATE_JET: { name: 'プライベートジェット', price: 500_000_000, assetValue: 450_000_000, icon: '🛩️' },
  MYSTERIOUS_BEADS: { name: '怪しい数珠', price: 50_000, assetValue: 'random', icon: '📿' },
  ENGAGEMENT_RING: { name: '婚約指輪', price: 100_000, assetValue: 90_000, icon: '💍' },
  USED_MOTORCYCLE: { name: '中古バイク', price: 200_000, assetValue: 150_000, icon: '🏍️' },
  DESIGNER_BAG: { name: 'ブランドバッグ', price: 250_000, assetValue: 200_000, icon: '👜' },
  LATEST_PC: { name: '最新PCセット', price: 280_000, assetValue: 200_000, icon: '💻' },
  HIGH_END_CAMERA: { name: '高級カメラ', price: 180_000, assetValue: 150_000, icon: '📷' },
  FASHIONABLE_CLOTHES: { name: 'おしゃれな服一式', price: 80_000, assetValue: 30_000, icon: '👕' },
  ANTIQUE_FURNITURE: { name: 'アンティーク家具', price: 220_000, assetValue: 250_000, icon: '🪑' },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/**
 * メインボードのマスの出現率。旧版の既定値そのまま（合計 90%。旧版も配るときに比で割り直していた）。
 * 旧版の既定では 💰臨時収入・💸出費 はこの表に無く、メインボードに出てこない。
 * 気づいて本人に確認中の点なので、勝手には足さない。
 */
export const MAIN_BOARD_WEIGHTS: Partial<Record<CellType, number>> = {
  SUPER_BAD_ADULT: 0.03,
  JOB_SELECT: 0.08,
  LOVE_EVENT: 0.1,
  BRANCH_POINT: 0.02,
  FORCED_JOB_CHANGE: 0.03,
  SKILL_EVENT_SPECIFIC: 0.05,
  MIXED_STAT_EVENT: 0.05,
  JOB_SPECIFIC_EVENT: 0.1,
  SHOPPING_EVENT: 0.07,
  LOTTERY_EVENT: 0.03,
  SKILL_SCHOOL_EVENT: 0.05,
  TRIAL_EVENT: 0.03,
  START_BUSINESS_EVENT: 0.02,
  MOVE_ABROAD_EVENT: 0.01,
  ILLNESS_EVENT: 0.02,
  INHERITANCE_EVENT: 0.01,
  STATUS_GOOD: 0.1,
  STATUS_BAD: 0.1,
};

export type BoardKey = 'HIGH_SCHOOL' | 'PROFESSIONAL_SCHOOL' | 'UNIVERSITY' | 'MAIN' | 'BRANCH_ROUTE';
export const BOARD_KEYS: BoardKey[] = ['HIGH_SCHOOL', 'PROFESSIONAL_SCHOOL', 'UNIVERSITY', 'MAIN', 'BRANCH_ROUTE'];

export const BOARDS: Record<BoardKey, { name: string; short: string; length: number; tuition?: number }> = {
  HIGH_SCHOOL: { name: '高校', short: '高校', length: 45 },
  PROFESSIONAL_SCHOOL: { name: '専門学校', short: '専門', length: 20, tuition: 80_000 },
  UNIVERSITY: { name: '大学', short: '大学', length: 30, tuition: 100_000 },
  // メインボードの長さは部屋の設定（コースの長さ）で決まる
  MAIN: { name: '社会人', short: '社会', length: 50 },
  BRANCH_ROUTE: { name: '分岐ルート', short: '分岐', length: 25 },
};

/** 高校にいられるターン数。超えると強制的に卒業になる */
export const HIGH_SCHOOL_MAX_TURNS = 9;

/** コースの長さ（メインボードのマス数）。旧版の選択肢のまま */
export const COURSE_LENGTHS = [30, 50, 80] as const;

type MessagePool = Record<StatKey, string[]>;
export const STATUS_MESSAGES: Record<'HIGH_SCHOOL' | 'PROFESSIONAL_SCHOOL' | 'UNIVERSITY' | 'MAIN', { good: MessagePool; bad: MessagePool }> = {
  HIGH_SCHOOL: {
    good: {
      academic: ['小テストで満点を取った！', '抜き打ちテストで高得点！', '難しい問題が解けてスッキリ！', '先生に質問して理解が深まった！'],
      physical: ['体育祭のリレーで大活躍！', '部活動の練習で新記録達成！', '体力測定で学年トップ！', '朝練の成果が出た！'],
      charm: ['文化祭の準備でクラスの人気者に！', '新しい友達ができた！', '異性から告白された！', 'おしゃれをして褒められた！'],
      luck: ['落とし物を拾って感謝された！', '懸賞に当たった！', 'たまたま見つけたお店が大当たり！', '絶体絶命のピンチを切り抜けた！'],
    },
    bad: {
      academic: ['期末テストで赤点を取ってしまった...', '授業中に居眠りしてしまった...', '宿題を忘れて怒られた...', '難しい問題が全然わからない...'],
      physical: ['体育の授業で見学...', '大事な試合でミスをしてしまった...', '風邪をひいて体調が悪い...', '運動不足で体がなまっている...'],
      charm: ['文化祭の出し物が大失敗...', '友達と喧嘩してしまった...', '校則違反で注意された...', '陰口を言われているのを聞いてしまった...'],
      luck: ['楽しみにしていたイベントが中止になった...', '財布を落としてしまった...', 'カラスにフンを落とされた...', '占いで最悪の結果が出た...'],
    },
  },
  PROFESSIONAL_SCHOOL: {
    good: {
      academic: ['課題のプレゼンテーションが大成功！', '実習で高い技術を習得！', '難しい専門書を読破！', '講師に才能を見出された！'],
      physical: ['徹夜続きだったが体調は万全！', '実技試験で最高のパフォーマンス！', '体力勝負の課題をクリア！', '健康管理がうまくいっている！'],
      charm: ['業界セミナーで有力なコネクションができた！', 'グループワークでリーダーシップを発揮！', '自主制作が高く評価された！', 'クラスの人気者になった！'],
      luck: ['コンペで入賞！', '偶然出会った業界人と意気投合！', 'なくしたと思っていた道具が見つかった！', '課題のテーマが得意分野だった！'],
    },
    bad: {
      academic: ['課題の提出が遅れてしまった...', '資格試験に落ちてしまった...', '専門用語が頭に入ってこない...', '発表で緊張しすぎた...'],
      physical: ['実習中に機材を破損...', '徹夜続きで体調を崩した...', '寝不足で集中できない...', '実技で大きなミスをした...'],
      charm: ['インターンシップ先で評価が低かった...', '作品のアイデアが浮かばない...', 'グループワークで孤立してしまった...', '業界人に失礼な態度をとってしまった...'],
      luck: ['大事なデータが消えてしまった...', '課題のテーマが苦手分野だった...', 'ライバルに先を越された...', '期待していたイベントが中止になった...'],
    },
  },
  UNIVERSITY: {
    good: {
      academic: ['難しい論文を完成させた！', '学会発表で注目を浴びた！', '興味深い講義に感銘を受けた！', '尊敬する教授と親しくなれた！'],
      physical: ['サークル活動で全国大会に出場！', 'スポーツで新記録を樹立！', '健康的な生活で心身ともに充実！', '研究で体力が必要な実験を乗り越えた！'],
      charm: ['学園祭の実行委員長として大成功！', '留学プログラムに選ばれた！', 'ボランティア活動で社会貢献！', '多くの友人や知人に囲まれている！'],
      luck: ['抽選で海外旅行が当たった！', '偶然見つけた古本に貴重な情報が！', '憧れの人と偶然出会った！', '研究のテーマが大当たり！'],
    },
    bad: {
      academic: ['単位を落としてしまった...', 'ゼミの発表で大失敗...', 'レポートの締め切りに追われている...', '実験でミスを連発...'],
      physical: ['飲み会で羽目を外しすぎた...', '寝坊して講義をサボってしまった...', '研究室に泊まり込みで体調不良...', '運動不足で体が重い...'],
      charm: ['就職活動で連敗中...', '人間関係で悩んでいる...', 'サークルでトラブル発生...', '失言で友人を怒らせてしまった...'],
      luck: ['大事なプレゼン資料を忘れた...', '研究データが破損した...', 'アルバイト先が突然閉店した...', '楽しみにしていたイベントが悪天候で中止...'],
    },
  },
  MAIN: {
    good: {
      academic: ['ひらめきが冴えている！', '難しい本を読破した！', '新しい知識を吸収した！'],
      physical: ['体調がすこぶる良い！', 'エネルギッシュに活動できた！', '運動の成果が出ている！'],
      charm: ['人との出会いが楽しい！', '自分の魅力に気づいた！', '周囲からの評判が良い！'],
      luck: ['幸運が舞い込んできた！', '良い予感がする！', '何だかツイてる！'],
    },
    bad: {
      academic: ['頭が働かない...', '集中力が続かない...', '勉強が手につかない...'],
      physical: ['なんだか体がだるい...', '疲れが取れない...', '運動不足を感じる...'],
      charm: ['人付き合いが億劫だ...', '自信をなくしてしまった...', '周りの目が気になる...'],
      luck: ['ついてない日だ...', '悪い予感がする...', '何をやってもうまくいかない...'],
    },
  },
};
