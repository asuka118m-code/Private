import { useState } from "react";
import { recipeToText } from "../../shared/recipeText.mjs";
import type { Recipe } from "../lib/types";

/** 「📋 テキストでコピー」：レシピを文章にしてコピー（SNSの台本づくりやAIに貼る用） */
export function CopyTextButton({ recipe, url, className = "btn small" }: { recipe: Recipe; url?: string; className?: string }) {
  const [done, setDone] = useState("");
  async function copy() {
    const text = recipeToText(recipe, { url });
    try {
      await navigator.clipboard.writeText(text);
      setDone("コピーしました");
    } catch {
      // コピーが使えない時は共有メニューで
      if (navigator.share) { try { await navigator.share({ title: recipe.title, text }); setDone("共有しました"); } catch { /* キャンセル */ } }
      else setDone("コピーできませんでした");
    }
    setTimeout(() => setDone(""), 2500);
  }
  return <button type="button" className={className} onClick={copy}>{done || "📋 テキストでコピー"}</button>;
}
