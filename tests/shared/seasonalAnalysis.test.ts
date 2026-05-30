import { describe, expect, it } from "vitest";
import { buildSeasonalAnalysis } from "../../src/shared/seasonalAnalysis";

describe("buildSeasonalAnalysis", () => {
  it("infers a northern hemisphere season from a dated capture hint", () => {
    const analysis = buildSeasonalAnalysis({
      userScope: { country: "Mongolia", dateOrTimeHint: "2026-04-18" },
      outputLanguage: "zh-CN"
    });

    expect(analysis.inferredSeason).toBe("春季");
    expect(analysis.confidence).toBe("medium");
    expect(analysis.reasoning.join("\n")).toContain("2026-04-18");
    expect(analysis.mapComparisonNotes.join("\n")).toContain("Google Earth");
  });

  it("reports uncertainty when the date does not include a month", () => {
    const analysis = buildSeasonalAnalysis({
      userScope: { dateOrTimeHint: "2026" },
      outputLanguage: "zh-CN"
    });

    expect(analysis.inferredSeason).toBe("日期不足，无法可靠判断季节");
    expect(analysis.confidence).toBe("low");
  });
});
