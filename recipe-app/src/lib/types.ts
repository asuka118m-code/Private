export interface Ingredient {
  name: string;
  amount: string;
  mark?: string; // 「A」「★」など、調味料のまとまりを表す印
  recipeId?: string; // 別のレシピ（例：ビビンバの中の「人参のナムル」）につなぐ場合
}

export interface Comment {
  id: string;
  createdAt: number;
  text: string;
  rating?: number; // 1-5
  author?: string; // 共有リンクから書いた人の名前（自分のコメントは空）
  shared?: boolean; // 共有リンクから届いたコメント
}

export interface Recipe {
  id: string;
  title: string;
  servings: string;
  ingredients: Ingredient[];
  steps: string[];
  sourceUrl: string;
  sourceImageIds: string[]; // 参考にしたスクショ・元画像
  photoIds: string[]; // 自分で作った料理の写真
  coverImageId?: string; // 一覧に表示する画像（未指定なら自動）
  categoryIds?: string[]; // 入っているカテゴリ（複数可）
  cookedDates?: string[]; // 実際に作った日（"2026-11-23" の形、新しい順）
  memo: string;
  comments: Comment[];
  createdAt: number;
  updatedAt: number;
}

/** 取り込み結果（保存前の下書き） */
export interface RecipeDraft {
  title: string;
  servings: string;
  ingredients: Ingredient[];
  steps: string[];
  sourceUrl: string;
  sourceImages: Blob[];
  categoryIds?: string[];
}

export interface Category {
  id: string;
  name: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}
