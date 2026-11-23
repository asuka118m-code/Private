import { useEffect, useMemo, useState } from "react";
import { coverOf, listRecipes } from "../lib/db";
import type { Recipe } from "../lib/types";
import { StoredImage } from "./StoredImage";

/** 登録済みのレシピから1つ選ぶ（材料に別のレシピをつなぐ時に使う） */
export function RecipePicker({ excludeId, initialQuery = "", onPick, onClose }: {
  excludeId?: string; initialQuery?: string; onPick: (r: Recipe) => void; onClose: () => void;
}) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [q, setQ] = useState(initialQuery);
  useEffect(() => { listRecipes().then((rs) => setRecipes(rs.filter((r) => r.id !== excludeId))); }, [excludeId]);
  const shown = useMemo(() => {
    const k = q.trim();
    if (!k) return recipes;
    // 「人参ナムル」でも「人参のナムル」が見つかるよう、「の」や空白を無視して比べる
    const norm = (s: string) => s.replace(/[の\s　]/g, "");
    return recipes.filter((r) => norm(r.title).includes(norm(k)) || norm(k).includes(norm(r.title)));
  }, [recipes, q]);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>つなぐレシピを選ぶ</h2>
          <button type="button" className="link" onClick={onClose}>閉じる</button>
        </div>
        <input className="search" autoFocus placeholder="料理名で検索" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="pick-list">
          {shown.map((r) => {
            const cover = coverOf(r);
            return (
              <li key={r.id}>
                <button type="button" onClick={() => onPick(r)}>
                  {cover ? <StoredImage id={cover} className="pick-img" /> : <span className="pick-img noimg">🍳</span>}
                  <span>{r.title}</span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="hint">
              {recipes.length ? "見つかりません。" : "ほかのレシピがまだありません。"}先に「人参のナムル」などのレシピを登録してください。
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
