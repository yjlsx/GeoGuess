import { describe, expect, it } from "vitest";
import { runInvestigation } from "../../server/investigationService";
import type { Candidate, ExtractedClues, SearchQuery } from "../../src/shared/types";

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
    expect(result.candidates[0].confidence).toBe("low");
    expect(result.candidates[0].uncertainty).toContain("mock provider is not an authoritative location search result");
    expect(result.candidates[0].sources[0].title).toBe("Offline mock search provider");
  });

  it("does not reuse mutable clue arrays when manual clues are omitted", async () => {
    const input = {
      image: {
        originalPath: "local://sample",
        cropMode: "full" as const
      },
      userScope: {
        country: "Mongolia"
      }
    };

    const first = await runInvestigation(input);
    first.extractedClues.sceneFeatures.push("pollution from first run");

    const second = await runInvestigation(input);

    expect(second.extractedClues.sceneFeatures).toEqual([]);
    expect(second.extractedClues.sceneFeatures).not.toBe(first.extractedClues.sceneFeatures);
  });

  it("uses injected providers with crop path, planned queries, custom candidate, and supplied id", async () => {
    const manualClues: ExtractedClues = {
      ocrText: ["Station 42"],
      visibleLabels: ["Blue roof"],
      languages: ["English"],
      sceneFeatures: ["rail siding"],
      spatialRelationships: ["road north of tracks"],
      inferredSearchTerms: ["custom depot"]
    };
    const seen = {
      imagePath: "",
      queries: [] as SearchQuery[]
    };
    const customCandidate: Candidate = {
      id: "custom-candidate",
      name: "Custom depot candidate",
      latitude: 12.34,
      longitude: 56.78,
      confidence: "medium",
      mapLinks: {
        googleMaps: "https://maps.example/custom"
      },
      matchingEvidence: ["provider supplied candidate"],
      uncertainty: ["test provider"],
      sources: [
        {
          title: "Test source",
          url: "local://test-source",
          note: "Custom provider result"
        }
      ],
      earthVerificationChecklist: ["Verify custom provider result"]
    };

    const result = await runInvestigation({
      id: "stored-investigation-id",
      image: {
        originalPath: "local://original-image",
        cropPath: "local://cropped-image",
        cropMode: "manual"
      },
      userScope: {
        country: "Mongolia",
        facilityType: "rail depot"
      },
      manualClues,
      providers: {
        vision: {
          async extractClues(request) {
            seen.imagePath = request.imagePath;
            return request.manualClues ?? manualClues;
          }
        },
        search: {
          async findCandidates(args) {
            seen.queries = args.queries;
            return [customCandidate];
          }
        }
      }
    });

    expect(result.id).toBe("stored-investigation-id");
    expect(seen.imagePath).toBe("local://cropped-image");
    expect(seen.queries.length).toBeGreaterThan(0);
    expect(seen.queries.map((query) => query.query).join("\n")).toContain("custom depot");
    expect(result.candidates).toEqual([customCandidate]);
  });
});
