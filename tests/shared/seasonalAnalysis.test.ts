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

  it("uses southern hemisphere seasons for clearly southern scopes", () => {
    const analysis = buildSeasonalAnalysis({
      userScope: { country: "Australia", dateOrTimeHint: "2026-01-12" },
      outputLanguage: "en-US"
    });

    expect(analysis.inferredSeason).toBe("summer");
    expect(analysis.confidence).toBe("medium");
    expect(analysis.reasoning.join("\n")).toContain("southern hemisphere summer");
  });

  it("does not force tropical cross-equator scopes into southern hemisphere seasons", () => {
    const analysis = buildSeasonalAnalysis({
      userScope: { country: "Indonesia", dateOrTimeHint: "2026-07-08" },
      outputLanguage: "en-US"
    });

    expect(analysis.inferredSeason).toBe("summer");
    expect(analysis.reasoning.join("\n")).toContain("northern hemisphere summer");
  });

  it("extracts standalone Chinese month hints", () => {
    const analysis = buildSeasonalAnalysis({
      userScope: { country: "Mongolia", dateOrTimeHint: "4月中旬" },
      outputLanguage: "zh-CN"
    });

    expect(analysis.inferredSeason).toBe("春季");
    expect(analysis.confidence).toBe("medium");
    expect(analysis.reasoning.join("\n")).toContain("4月中旬");
  });

  it("uses season words as low-confidence historical imagery guidance", () => {
    const analysis = buildSeasonalAnalysis({
      userScope: { country: "Mongolia", dateOrTimeHint: "summer training" },
      outputLanguage: "en-US"
    });

    expect(analysis.inferredSeason).toBe("summer");
    expect(analysis.confidence).toBe("low");
    expect(analysis.reasoning.join("\n")).toContain("low-confidence verification direction");
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
