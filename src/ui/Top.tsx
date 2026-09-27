import { useState } from 'react';
import { NAME_KEY, type Room } from '../net/useRoom';

const readName = (): string => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};

/** 入口。/room/<code> で開かれたら「この部屋に入る」、そうでなければ部屋を作るかコードで入る */
export function Top({ room, urlCode }: { room: Room; urlCode: string | null }) {
  const [name, setName] = useState(readName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  const go = async (fn: () => Promise<void>) => {
    if (!trimmed || busy) return;
    try {
      localStorage.setItem(NAME_KEY, trimmed);
    } catch {
      // 保存できなくても遊べる。次回に名前を打ち直すだけ
    }
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <div className="top">
      <div className="top-hero">
        <div className="hero-tiles" aria-hidden>
          {['🏠', '👍', '💼', '❤️', '🎰', '🏁'].map((t, i) => (
            <span key={i} style={{ animationDelay: `${i * 0.12}s` }}>
              {t}
            </span>
          ))}
        </div>
        <h1 className="brand">
          じんせい<span>すごろく</span>
        </h1>
        <p className="tagline">高校から社会人まで。サイコロひとつで、いちばんリッチな人生を。</p>
      </div>

      <form
        className="card top-card"
        onSubmit={(e) => {
          e.preventDefault();
          void go(() => (urlCode ? room.join(urlCode, trimmed) : room.create(trimmed)));
        }}
      >
        <label className="field">
          <span>あなたの名前</span>
          <input value={name} maxLength={10} onChange={(e) => setName(e.target.value)} placeholder="10文字まで" autoFocus />
        </label>
        {urlCode ? (
          <button type="submit" className="btn btn-primary btn-lg" disabled={!trimmed || busy}>
            部屋 {urlCode} に入る
          </button>
        ) : (
          <>
            <button type="submit" className="btn btn-primary btn-lg" disabled={!trimmed || busy}>
              部屋を作る
            </button>
            <div className="or">
              <span>または招待コードで入る</span>
            </div>
            <div className="join-row">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="コード" maxLength={8} aria-label="招待コード" />
              <button type="button" className="btn btn-secondary" disabled={!trimmed || !code.trim() || busy} onClick={() => void go(() => room.join(code.trim(), trimmed))}>
                入る
              </button>
            </div>
          </>
        )}
      </form>
      <p className="top-foot">2〜8人で遊べます。部屋のURLを送れば、そのまま招待になります。</p>
    </div>
  );
}
