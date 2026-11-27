import { describe, expect, it } from "vitest";
import { mergeShopping, nameKey, parseQty, sumAmounts, type ShopEntry } from "../src/lib/shopMerge";

describe("買い物リストのまとめ", () => {
  it("表記ゆれ・カッコの説明", () => {
    expect(nameKey("しょうゆ").key).toBe(nameKey("醤油").key);
    expect(nameKey("ニンニク").name).toBe("にんにく");
    expect(nameKey("黒胡椒").name).toBe("黒こしょう");
    expect(nameKey("豚バラ肉（薄切り）")).toEqual({ key: nameKey("豚バラ肉").key, name: "豚バラ肉", note: "薄切り" });
    expect(nameKey("ピーマン").key).toBe(nameKey("ぴーまん").key);
  });

  it("分量の読み取りと合計", () => {
    expect(parseQty("大さじ1と1/2")).toEqual({ unit: "大さじ", value: 1.5, prefix: true });
    expect(parseQty("200g")).toEqual({ unit: "g", value: 200, prefix: false });
    expect(parseQty("少々")).toBeNull();
    expect(sumAmounts(["大さじ2", "大さじ1"])).toBe("大さじ3");
    expect(sumAmounts(["1個", "1/2個"])).toBe("1と1/2個");
    expect(sumAmounts(["大さじ2", "小さじ1"])).toBe("大さじ2＋小さじ1");
    expect(sumAmounts(["200g", "1パック"])).toBe("200g＋1パック");
    expect(sumAmounts(["少々", "適量"])).toBe("少々・適量");
    expect(sumAmounts(["少々", "大さじ1"])).toBe("大さじ1");
    expect(sumAmounts(["2〜3本", "1本"])).toBe("1本＋2〜3本");
  });

  it("料理をまたいでまとめ、使う料理を残す", () => {
    const entries: ShopEntry[] = [
      { id: "e1", recipeId: "r1", title: "肉じゃが", factor: 1, ingredients: [{ name: "玉ねぎ", amount: "1個" }, { name: "醤油", amount: "大さじ2" }, { name: "塩", amount: "少々" }] },
      { id: "e2", recipeId: "r2", title: "生姜焼き", factor: 1, ingredients: [{ name: "たまねぎ", amount: "1/2個" }, { name: "しょうゆ", amount: "大さじ1" }, { name: "豚ロース", amount: "250g" }] },
      { id: "e3", recipeId: null, title: "", factor: 1, addedBy: "ゆう", ingredients: [{ name: "牛乳", amount: "1本" }] },
    ];
    const items = mergeShopping(entries, [{ key: nameKey("塩").key, checked: false, pantry: true }]);
    const by = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(by["玉ねぎ"].total).toBe("1と1/2個");
    expect(by["玉ねぎ"].parts.map((p) => p.title)).toEqual(["肉じゃが", "生姜焼き"]);
    expect(by["醤油"].total).toBe("大さじ3");
    expect(by["塩"].pantry).toBe(true);
    expect(by["牛乳"].parts[0].title).toBe("ゆうさんが追加");
    expect(items.map((i) => i.name)).toEqual(["玉ねぎ", "醤油", "塩", "豚ロース", "牛乳"]);
  });
});
