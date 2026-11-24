import { useEffect, useState } from "react";
import { getGuestName, setGuestName } from "../lib/share";

/** 共有ページの名前（端末に保存・どこで変えても全部に反映） */
export function useGuestName(): [string, (n: string) => void] {
  const [name, setName] = useState(getGuestName);
  useEffect(() => {
    const on = () => setName(getGuestName());
    window.addEventListener("guestname", on);
    return () => window.removeEventListener("guestname", on);
  }, []);
  return [name, setGuestName];
}

/**
 * 送る前の名前欄。保存済みなら「👤 ゆう として送ります［変更］」、
 * 未保存（初めて）なら入力欄を出す。
 */
export function GuestNameField({ value, onChange }: { value: string; onChange: (n: string) => void }) {
  const [saved, save] = useGuestName();
  const [editing, setEditing] = useState(!saved);
  // 保存済みの名前が変わったら、この欄の値もそろえる
  useEffect(() => { if (saved && !editing) onChange(saved); }, [saved, editing]); // eslint-disable-line react-hooks/exhaustive-deps
  // 送信して名前が保存されたら、表示を「○○ として送ります」に戻す
  useEffect(() => { if (saved && value.trim() === saved) setEditing(false); }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  if (saved && !editing) {
    return (
      <div className="guest-name">
        👤 <b>{saved}</b> として送ります
        <button type="button" className="link small" onClick={() => setEditing(true)}>変更</button>
      </div>
    );
  }
  return (
    <div className="row">
      <input className="input grow" placeholder="あなたの名前" maxLength={40} value={value} onChange={(e) => onChange(e.target.value)} />
      {saved && (
        <button type="button" className="btn small nowrap" disabled={!value.trim()} onClick={() => { save(value); setEditing(false); }}>決定</button>
      )}
    </div>
  );
}

/** ページ上部の「👤 ゆうさん ✎」 */
export function GuestNameBadge() {
  const [name, save] = useGuestName();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  if (!name && !editing) return null;
  if (editing) {
    return (
      <div className="row guest-badge-edit">
        <input className="input grow" autoFocus maxLength={40} value={draft} placeholder="あなたの名前" onChange={(e) => setDraft(e.target.value)} />
        <button className="btn small" disabled={!draft.trim()} onClick={() => { save(draft); setEditing(false); }}>決定</button>
        <button className="link small" onClick={() => setEditing(false)}>やめる</button>
      </div>
    );
  }
  return (
    <button className="guest-badge" onClick={() => { setDraft(name); setEditing(true); }} aria-label="名前を変更">
      👤 {name}さん <span>✎</span>
    </button>
  );
}
