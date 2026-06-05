import { describe, expect, it } from "vitest";
import { buildSearchQueries } from "../../src/shared/queryPlanner";
import type { ExtractedClues, UserScope } from "../../src/shared/types";

const scope: UserScope = {
  country: "Mongolia",
  region: "Dornogovi",
  facilityType: "railway station",
  source: "CCTV 7",
  notes: "China Mongolia joint training"
};

const clues: ExtractedClues = {
  ocrText: ["中蒙 草原伙伴 2026 陆军联合训练"],
  visibleLabels: ["CCTV 7"],
  languages: ["Chinese"],
  sceneFeatures: ["railway", "station building", "grassland"],
  spatialRelationships: ["railway runs horizontally in foreground", "station building behind tracks"],
  inferredSearchTerms: ["China Mongolia joint exercise", "railway station"]
};

describe("buildSearchQueries", () => {
  it("prioritizes visual feature bundles over source-only OCR clues", () => {
    const queries = buildSearchQueries(scope, clues);
    expect(queries[0]).toEqual({
      query:
        "Mongolia Dornogovi railway station railway station building grassland railway runs horizontally in foreground station building behind tracks",
      language: "en",
      purpose: "visual-feature-bundle"
    });
    expect(queries.map((item) => item.query)).not.toContain("CCTV 7 Mongolia railway station");
  });

  it("deduplicates repeated queries", () => {
    const queries = buildSearchQueries(scope, {
      ...clues,
      inferredSearchTerms: ["railway station", "railway station"]
    });
    const unique = new Set(queries.map((item) => item.query));
    expect(unique.size).toBe(queries.length);
  });

  it("deduplicates normalized query text across language metadata", () => {
    const queries = buildSearchQueries(
      {
        source: "Railway   Station"
      },
      {
        ocrText: [" railway station "],
        visibleLabels: [],
        languages: ["Chinese"],
        sceneFeatures: [],
        spatialRelationships: [],
        inferredSearchTerms: []
      }
    );
    const unique = new Set(queries.map((item) => item.query.trim().replace(/\s+/g, " ").toLocaleLowerCase()));
    expect(unique.size).toBe(queries.length);
    expect(queries[0]).toEqual({
      query: "Railway Station",
      language: "en",
      purpose: "visual-feature-bundle"
    });
  });

  it("uses case-insensitive station fallback clues", () => {
    const queries = buildSearchQueries(
      {
        country: "Mongolia"
      },
      {
        ...clues,
        sceneFeatures: ["Station Building"],
        inferredSearchTerms: []
      }
    );
    expect(queries[0].query).toBe(
      "Mongolia Station Building railway runs horizontally in foreground station building behind tracks"
    );
    expect(queries[0].purpose).toBe("visual-feature-bundle");
  });
});
