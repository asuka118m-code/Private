import { describe, expect, it } from "vitest";
import { firstNumber, formatNumber, scaleAmount } from "../src/lib/scale";

describe("分量の計算", () => {
  it.each([
    ["200g", 1.5, "300g"],
    ["大さじ2", 1.5, "大さじ3"],
    ["大さじ1", 1.5, "大さじ1と1/2"],
    ["1/2個", 3, "1と1/2個"],
    ["1/3本", 2, "2/3本"],
    ["大さじ1と1/2", 2, "大さじ3"],
    ["２〜３本", 2, "4〜6本"],
    ["1かけ(10g)", 2, "2かけ(20g)"],
    ["½カップ", 2, "1カップ"],
    ["400ml", 0.5, "200ml"],
    ["少々", 2, "少々"],
    ["適量", 3, "適量"],
    ["250g", 0.75, "188g"],
    ["小さじ1", 2 / 3, "小さじ2/3"],
  ])("%s ×%s → %s", (a, f, want) => expect(scaleAmount(a, f)).toBe(want));

  it("最初の数値", () => {
    expect(firstNumber("2人分")).toBe(2);
    expect(firstNumber("大さじ1と1/2")).toBe(1.5);
    expect(firstNumber("４個分")).toBe(4);
    expect(firstNumber("少々")).toBeNull();
  });

  it("表記", () => {
    expect(formatNumber(0.25)).toBe("1/4");
    expect(formatNumber(2)).toBe("2");
    expect(formatNumber(1.2)).toBe("1.2");
  });
});
