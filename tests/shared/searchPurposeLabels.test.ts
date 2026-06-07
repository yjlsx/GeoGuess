import { describe, expect, it } from "vitest";
import { searchPurposeLabel } from "../../src/shared/searchPurposeLabels";

describe("searchPurposeLabel", () => {
  it("labels search query purposes in both supported report languages", () => {
    expect(searchPurposeLabel("map-imagery-verification", "zh-CN")).toBe("地图影像核验");
    expect(searchPurposeLabel("viewpoint-geometry", "zh-CN")).toBe("视角几何核验");
    expect(searchPurposeLabel("source-visual-crosscheck", "en-US")).toBe("source/visual cross-check");
  });

  it("falls back to the raw purpose for unknown future query types", () => {
    expect(searchPurposeLabel("future-purpose", "zh-CN")).toBe("future-purpose");
  });
});
