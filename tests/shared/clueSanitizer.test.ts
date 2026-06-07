import { describe, expect, it } from "vitest";
import { sanitizeExtractedClues } from "../../src/shared/clueSanitizer";

describe("sanitizeExtractedClues", () => {
  it("moves media overlays out of physical clue fields", () => {
    const clues = sanitizeExtractedClues({
      ocrText: [" Depot 14 "],
      visibleLabels: ["station sign"],
      languages: ["English"],
      sceneFeatures: ["top-left logo bug", "rail platform", "blue warehouse"],
      spatialRelationships: ["lower-right timestamp overlays the road", "blue warehouse behind rail platform"],
      inferredSearchTerms: ["timestamp overlay rail depot", "rail platform blue warehouse"]
    });

    expect(clues.visibleLabels).toEqual([
      "station sign",
      "top-left logo bug",
      "lower-right timestamp overlays the road",
      "timestamp overlay rail depot"
    ]);
    expect(clues.sceneFeatures).toEqual(["rail platform", "blue warehouse"]);
    expect(clues.spatialRelationships).toEqual(["blue warehouse behind rail platform"]);
    expect(clues.inferredSearchTerms).toEqual(["rail platform blue warehouse"]);
  });
});
