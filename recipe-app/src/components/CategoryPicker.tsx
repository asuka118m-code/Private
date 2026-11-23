import { useEffect, useState } from "react";
import { addCategory, listCategories, onDataChange } from "../lib/db";
import type { Category } from "../lib/types";

/** レシピに入れるカテゴリを選ぶ（複数選択可・その場で新規作成も可） */
export function CategoryPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => {
    listCategories().then(setCats);
    return onDataChange(() => listCategories().then(setCats));
  }, []);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  async function add() {
    const n = name.trim();
    if (!n) return;
    const existing = cats.find((c) => c.name === n);
    const c = existing ?? (await addCategory(n));
    if (!value.includes(c.id)) onChange([...value, c.id]);
    setName("");
    setAdding(false);
  }

  return (
    <div className="cat-picker">
      {cats.map((c) => (
        <button type="button" key={c.id} className={`chip ${value.includes(c.id) ? "on" : ""}`} onClick={() => toggle(c.id)}>
          {value.includes(c.id) ? "✓ " : ""}{c.name}
        </button>
      ))}
      {adding ? (
        <span className="row">
          <input className="input" autoFocus placeholder="カテゴリ名" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
          <button type="button" className="btn small primary" onClick={add}>追加</button>
        </span>
      ) : (
        <button type="button" className="chip ghost" onClick={() => setAdding(true)}>＋ 新しいカテゴリ</button>
      )}
    </div>
  );
}
