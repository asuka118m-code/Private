import { useState, type ReactNode } from "react";
import type { Ingredient } from "../lib/types";
import { firstNumber, formatNumber, isScalable, normalize, scaleAmount } from "../lib/scale";
import { MarkBadge, markColor } from "./Mark";

/**
 * 材料の表示＋「今回の分量」計算。
 * 登録した分量は一切変えず、右側の「今回」欄に計算結果を出す。
 * 人数欄または好きな材料の「今回」欄に数字を入れると、全体がその比率で計算される。
 */
export function IngredientsPanel({ ingredients, servings, renderName, initialFactor = 1, note, onFactorChange }: {
  ingredients: Ingredient[]; servings: string; renderName?: (ing: Ingredient) => ReactNode;
  initialFactor?: number; // 親のレシピから倍率を引き継いで開く場合
  note?: ReactNode; // 引き継いだ倍率の説明
  onFactorChange?: (factor: number) => void;
}) {
  const [factor, setFactorState] = useState(initialFactor);
  const [showNote, setShowNote] = useState(initialFactor !== 1);
  const setFactor = (f: number) => { setFactorState(f); onFactorChange?.(f); };
  const [editing, setEditing] = useState<string | null>(null); // "servings" | 材料の番号
  const [text, setText] = useState("");

  const baseServings = firstNumber(servings);
  const servingsUnit = baseServings !== null ? normalize(servings).replace(/^[^\d]*[\d.\/と]+\s*/, "") : "";
  const scalableCount = ingredients.filter((i) => isScalable(i.amount)).length;
  const canScale = baseServings !== null || scalableCount > 0;
  const changed = factor !== 1;

  function input(key: string, value: string, base: number) {
    setEditing(key);
    setText(value);
    const n = firstNumber(value);
    if (n !== null) setFactor(n / base);
  }
  const reset = () => { setFactor(1); setEditing(null); setText(""); setShowNote(false); };

  if (ingredients.length === 0) return <p className="hint">未登録</p>;

  return (
    <>
      {showNote && note && <div className="inherit-note">{note}</div>}
      {canScale && (
        <div className={`scale-bar ${changed ? "on" : ""}`}>
          {baseServings !== null ? (
            <label className="serv">
              <span className="hint small">登録：{servings}</span>
              <span className="arrow">→</span>
              <span className="hint small">今回</span>
              <input className={`input scale-input ${changed ? "filled" : ""}`} inputMode="decimal" placeholder={formatNumber(baseServings * factor)}
                value={editing === "servings" ? text : changed ? formatNumber(baseServings * factor) : ""}
                onFocus={() => { setEditing("servings"); setText(""); }}
                onBlur={() => setEditing(null)}
                onChange={(e) => input("servings", e.target.value, baseServings)} />
              <span className="small">{servingsUnit}</span>
            </label>
          ) : (
            <span className="hint small">材料の「今回」欄に数字を入れると、ほかの材料も計算されます</span>
          )}
          <button type="button" className="btn small" disabled={!changed && !text} onClick={reset}>リセット</button>
        </div>
      )}
      <ul className={`ingredients ${canScale ? "with-scale" : ""}`}>
        {canScale && (
          <li className="ing-head"><span className="name" /><span className="dots" /><span className="amount">登録</span><span className="scaled-head">今回{changed && <b> ×{Math.round(factor * 100) / 100}</b>}</span></li>
        )}
        {ingredients.map((ing, k) => {
          const base = firstNumber(ing.amount);
          const key = String(k);
          return (
            <li key={k} className={ing.mark ? "marked" : ""} style={ing.mark ? ({ "--mk": markColor(ing.mark) } as React.CSSProperties) : undefined}>
              {ing.mark && <MarkBadge mark={ing.mark} />}
              <span className="name">{renderName ? renderName(ing) : ing.name}</span>
              <span className="dots" />
              <span className="amount">{ing.amount}</span>
              {canScale && (base !== null ? (
                <input inputMode="decimal"
                  className={`input scale-input ${changed ? "filled" : ""} ${editing !== key && changed && scaleAmount(ing.amount, factor).length > 6 ? "long" : ""}`}
                  placeholder={editing === key ? formatNumber(base * factor) : "今回"}
                  aria-label={`${ing.name}の今回の分量`}
                  value={editing === key ? text : changed ? scaleAmount(ing.amount, factor) : ""}
                  onFocus={() => { setEditing(key); setText(""); }}
                  onBlur={() => setEditing(null)}
                  onChange={(e) => input(key, e.target.value, base)} />
              ) : (
                <span className="scale-fixed">{changed ? ing.amount : ""}</span>
              ))}
            </li>
          );
        })}
      </ul>
    </>
  );
}
