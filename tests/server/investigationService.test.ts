import { describe, expect, it } from "vitest";
import { runInvestigation } from "../../server/investigationService";

describe("runInvestigation", () => {
  it("runs the manual/mock path and returns a report", async () => {
    const result = await runInvestigation({
      image: {
        originalPath: "local://sample",
        cropMode: "upper_half"
      },
      userScope: {
        country: "Mongolia",
        region: "Dornogovi",
        facilityType: "railway station",
        source: "CCTV 7",
        notes: "China Mongolia joint training"
      },
      manualClues: {
        ocrText: ["中蒙 草原伙伴 2026 陆军联合训练"],
        visibleLabels: ["CCTV 7"],
        languages: ["Chinese"],
        sceneFeatures: ["railway", "station building", "grassland"],
        spatialRelationships: ["railway runs horizontally in foreground"],
        inferredSearchTerms: ["China Mongolia joint training railway station"]
      }
    });

    expect(result.searchQueries.length).toBeGreaterThan(0);
    expect(result.candidates[0].latitude).toBe(42.25967);
    expect(result.report.summaryMarkdown).toContain("High confidence");
  });
});
