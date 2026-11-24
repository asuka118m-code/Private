import type { RecipeDraft } from "./types";
// 取り込み画面 → 編集画面へ下書きを受け渡す（メモリ上のみ）
let pending: RecipeDraft | null = null;
export const setDraft = (d: RecipeDraft) => void (pending = d);
export const takeDraft = () => {
  const d = pending;
  pending = null;
  return d;
};

/** OKしたリクエスト（取り込み画面に渡す） */
export interface PendingRequest { id: string; author: string; text: string; url?: string | null; kind?: "request" | "inbox" }
let pendingRequest: PendingRequest | null = null;
export const setPendingRequest = (r: PendingRequest) => void (pendingRequest = r);
export const getPendingRequest = () => pendingRequest;
export const clearPendingRequest = () => void (pendingRequest = null);
export const requestMemo = (r: PendingRequest) =>
  r.kind === "inbox" ? (r.text ? `🔖 ${r.text}` : "") : `🙋 ${r.author}さんのリクエスト${r.text ? `：${r.text}` : ""}`;
