import type { RecipeDraft } from "./types";
// 取り込み画面 → 編集画面へ下書きを受け渡す（メモリ上のみ）
let pending: RecipeDraft | null = null;
export const setDraft = (d: RecipeDraft) => void (pending = d);
export const takeDraft = () => {
  const d = pending;
  pending = null;
  return d;
};
