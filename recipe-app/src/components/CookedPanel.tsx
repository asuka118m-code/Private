import { useState } from "react";
import type { Recipe } from "../lib/types";
import { addCooked, cookedCount, cookedDates, cookedToday, dateStr, fmtDay, removeCooked, todayStr } from "../lib/cooked";

/** 「今日作った！」ボタンと、作った日の記録 */
export function CookedPanel({ recipe, onChange }: { recipe: Recipe; onChange: (r: Recipe) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(todayStr());
  const [justNow, setJustNow] = useState(false);
  const dates = cookedDates(recipe);
  const today = cookedToday(recipe);

  return (
    <div className={`cooked ${dates.length ? "has" : ""}`}>
      <div className="cooked-main">
        {today ? (
          <span className="cooked-today">✓ 今日作りました</span>
        ) : (
          <button className="btn primary cook-btn" onClick={async () => { await onChange(addCooked(recipe)); setJustNow(true); }}>🍳 今日作った！</button>
        )}
        <span className="cooked-info">
          {dates.length ? <>作った <b>{cookedCount(recipe)}回</b>・最後 {fmtDay(dates[0])}</> : "まだ作っていません（作ってみたい）"}
        </span>
        <button className="link small" onClick={() => setOpen(!open)}>{open ? "閉じる" : "記録"}</button>
      </div>
      {justNow && <p className="hint small">記録しました！ 下の「作った料理の写真」や「感想・コメント」も残しておくと、次に作る時の参考になります。</p>}
      {open && (
        <div className="cooked-log">
          <div className="row">
            <input className="input" type="date" value={day} max={todayStr()} onChange={(e) => setDay(e.target.value)} />
            <button className="btn small" disabled={!day || dates.includes(day)} onClick={() => onChange(addCooked(recipe, day))}>この日に作った</button>
          </div>
          {dates.length > 0 && (
            <ul>
              {dates.map((d) => (
                <li key={d}>
                  <span>{fmtDay(d)}{d === dateStr() ? "（今日）" : ""}</span>
                  <button className="link small" onClick={() => confirm(`${fmtDay(d)}の記録を消しますか？`) && onChange(removeCooked(recipe, d))}>消す</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
