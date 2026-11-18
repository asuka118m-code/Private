export interface Ingredient {
  name: string;
  amount: string;
}

export interface Comment {
  id: string;
  createdAt: number;
  text: string;
  rating?: number; // 1-5
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
}
