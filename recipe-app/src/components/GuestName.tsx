import { useEffect } from "react";
import { getGuestName, setGuestName } from "../lib/share";

/**
 * 共有ページの名前欄。前回の名前が入った状態で出す。
 * そのまま送れて、変えたい時はタップして書き換えるだけ（送った名前が次回も入る）。
 */
export function GuestNameField({ value, onChange }: { value: string; onChange: (n: string) => void }) {
  // 同じページの別の欄で名前が変わったら、こちらにも反映する
  useEffect(() => {
    const on = () => onChange(getGuestName());
    window.addEventListener("guestname", on);
    return () => window.removeEventListener("guestname", on);
  }, [onChange]);
  return (
    <label className="name-field">
      <span>名前</span>
      <input className="input" placeholder="あなたの名前" maxLength={40} value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => value.trim() && value.trim() !== getGuestName() && setGuestName(value)} />
    </label>
  );
}
