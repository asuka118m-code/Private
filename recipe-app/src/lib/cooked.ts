// 「作った」記録
import type { Recipe } from "./types";

/** 端末の日付で "YYYY-MM-DD" */
export function dateStr(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const todayStr = () => dateStr();

export const cookedDates = (r: Recipe) => r.cookedDates ?? [];
export const isCooked = (r: Recipe) => cookedDates(r).length > 0;
export const cookedCount = (r: Recipe) => cookedDates(r).length;
export const lastCooked = (r: Recipe) => cookedDates(r)[0];
export const cookedToday = (r: Recipe) => cookedDates(r).includes(todayStr());

/** 作った日を足す（同じ日は1回まで）。新しい順にそろえる */
export function addCooked(r: Recipe, day = todayStr()): Recipe {
  const set = new Set([...cookedDates(r), day]);
  return { ...r, cookedDates: [...set].sort().reverse() };
}
export function removeCooked(r: Recipe, day: string): Recipe {
  return { ...r, cookedDates: cookedDates(r).filter((d) => d !== day) };
}

/** "2026-11-20" → 「11月20日」（今年以外は年も） */
export function fmtDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return y === new Date().getFullYear() ? `${m}月${d}日` : `${y}年${m}月${d}日`;
}

/** 最後に作ってから何日たったか（作っていなければ null） */
export function daysSince(r: Recipe) {
  const last = lastCooked(r);
  if (!last) return null;
  const [y, m, d] = last.split("-").map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - new Date(y, m - 1, d).getTime()) / 86400000);
}
