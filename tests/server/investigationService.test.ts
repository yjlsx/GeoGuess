import { afterEach, describe, expect, it, vi } from "vitest";
import { runInvestigation } from "../../server/investigationService";
import type { Candidate, ExtractedClues, SearchQuery } from "../../src/shared/types";

describe("runInvestigation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not return the sample coordinate from the default offline search path", async () => {
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
    expect(result.candidates).toEqual([]);
    expect(result.searchProcess.length).toBeGreaterThan(0);
    expect(result.imageAnalysis.observations.length).toBeGreaterThan(0);
    expect(result.seasonalAnalysis.inferredSeason).toBeDefined();
    expect(result.report.summaryMarkdown).toContain("尚未生成候选坐标");
    expect(result.report.fullMarkdown).toContain("尚未生成候选坐标");
    expect(result.report.summaryMarkdown).not.toContain("Low confidence");
  });

  it("does not reuse mutable clue arrays when manual clues are omitted", async () => {
    const input = {
      image: {
        originalPath: "local://sample",
        cropMode: "full" as const
      },
      outputLanguage: "zh-CN" as const,
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
      queries: [] as SearchQuery[],
      metadataPaths: [] as string[],
      mapFeatureProfile: undefined as Awaited<ReturnType<typeof runInvestigation>>["mapFeatureProfile"] | undefined
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
      mapPreview: {
        googleMapsEmbedUrl: "https://maps.example/embed",
        googleEarthWebUrl: "https://earth.example/search",
        screenshotStatus: "自定义候选没有截图",
        notes: ["custom preview"]
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
      outputLanguage: "zh-CN",
      manualClues,
      providers: {
        vision: {
          async extractClues(request) {
            seen.imagePath = request.imagePath;
            return request.manualClues ?? manualClues;
          }
        },
        metadata: {
          async extractMetadata(request) {
            seen.metadataPaths = request.mediaPaths;
            return [];
          }
        },
        search: {
          async findCandidates(args) {
            seen.queries = args.queries;
            seen.mapFeatureProfile = args.mapFeatureProfile;
            return [customCandidate];
          }
        }
      }
    });

    expect(result.id).toBe("stored-investigation-id");
    expect(seen.imagePath).toBe("local://cropped-image");
    expect(seen.metadataPaths).toEqual(["local://original-image"]);
    expect(seen.queries.length).toBeGreaterThan(0);
    expect(seen.queries.map((query) => query.query).join("\n")).toContain("custom depot");
    expect(seen.mapFeatureProfile?.primaryFeatures).toContain("rail siding");
    expect(seen.mapFeatureProfile?.spatialRelationships).toContain("road north of tracks");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject(customCandidate);
    expect(result.candidates[0].osintLinks?.map((link) => link.title)).toContain("OpenRailwayMap nearby");
    expect(result.candidates[0].osintLinks?.map((link) => link.title)).toContain("Mapillary street-level imagery");
    expect(result.mapFeatureProfile.primaryFeatures).toContain("rail siding");
    expect(result.report.fullMarkdown).toContain("搜索过程");
    expect(result.report.fullMarkdown).toContain("地图核验特征集合");
  });

  it("turns EXIF GPS metadata into a direct high-confidence coordinate candidate", async () => {
    const result = await runInvestigation({
      id: "metadata-investigation-id",
      image: {
        originalPath: "local://original-a",
        sourcePaths: ["local://original-a", "local://original-b"],
        cropMode: "full",
        evidencePaths: ["local://crop-a"]
      },
      userScope: {
        country: "Japan"
      },
      providers: {
        vision: {
          async extractClues() {
            return {
              ocrText: [],
              visibleLabels: [],
              languages: [],
              sceneFeatures: ["rail platform"],
              spatialRelationships: [],
              inferredSearchTerms: []
            };
          }
        },
        metadata: {
          async extractMetadata(request) {
            expect(request.mediaPaths).toEqual(["local://original-a", "local://original-b"]);
            return [
              {
                sourcePath: "local://original-a",
                gps: {
                  latitude: 35.6895,
                  longitude: 139.6917
                },
                capturedAt: "2026-05-31T10:20:30",
                camera: "ExampleCam Geo 1",
                evidenceType: "exif",
                notes: ["EXIF GPS coordinates found in the original media file."]
              }
            ];
          }
        },
        search: {
          async findCandidates() {
            return [];
          }
        }
      }
    });

    expect(result.metadataEvidence).toHaveLength(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      id: "metadata-candidate-1",
      name: "EXIF GPS metadata",
      latitude: 35.6895,
      longitude: 139.6917,
      confidence: "high",
      matchScore: 100,
      matchedFeatures: ["EXIF GPS coordinates found in original media"]
    });
    expect(result.candidates[0].osintLinks?.map((link) => link.title)).toContain("OpenStreetMap nearby");
    expect(result.candidates[0].osintLinks?.map((link) => link.title)).toContain("SunCalc shadow check");
    expect(result.report.summaryMarkdown).toContain("35.68950, 139.69170");
    expect(result.report.fullMarkdown).toContain("EXIF / 元数据");
    expect(result.report.fullMarkdown).toContain("ExampleCam Geo 1");
  });

  it("merges visual clues from multiple evidence paths before searching", async () => {
    const seen = {
      imagePaths: [] as string[],
      searchedFeatures: [] as string[]
    };

    await runInvestigation({
      image: {
        originalPath: "local://frame-a",
        cropMode: "full",
        evidencePaths: ["local://frame-a", "local://frame-b"]
      },
      userScope: {
        country: "China"
      },
      providers: {
        vision: {
          async extractClues(request) {
            seen.imagePaths.push(request.imagePath);
            return {
              ocrText: [],
              visibleLabels: [],
              languages: [],
              sceneFeatures: request.imagePath.endsWith("frame-a") ? ["red wall"] : ["blue roof"],
              spatialRelationships: request.imagePath.endsWith("frame-a") ? ["platform left of building"] : ["poles beside road"],
              inferredSearchTerms: []
            };
          }
        },
        search: {
          async findCandidates(args) {
            seen.searchedFeatures = args.clues.sceneFeatures;
            return [];
          }
        }
      }
    });

    expect(seen.imagePaths).toEqual(["local://frame-a", "local://frame-b"]);
    expect(seen.searchedFeatures).toEqual(["red wall", "blue roof"]);
  });

  it("uses the default OpenAI-backed search provider when vision config is supplied", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          candidates: [
            {
              name: "OpenAI searched candidate",
              latitude: 1.23,
              longitude: 4.56,
              confidence: "medium",
              matchScore: 64,
              matchedFeatures: ["rail platform"],
              missingOrUnverifiedFeatures: ["road alignment unclear"],
              viewpointNotes: ["Needs satellite angle check"],
              matchingEvidence: ["web search candidate"],
              uncertainty: ["test"],
              sources: [
                {
                  title: "OpenAI source",
                  url: "https://example.test/openai-candidate",
                  note: "Search result source"
                }
              ],
              earthVerificationChecklist: ["verify"]
            }
          ]
        })
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runInvestigation({
      image: {
        originalPath: "local://image",
        cropMode: "full"
      },
      userScope: {
        country: "Japan"
      },
      visionConfig: {
        apiKey: "test-api-key",
        model: "gpt-4o"
      },
      providers: {
        vision: {
          async extractClues() {
            return {
              ocrText: ["JR"],
              visibleLabels: [],
              languages: [],
              sceneFeatures: ["rail platform"],
              spatialRelationships: [],
              inferredSearchTerms: ["Tokyo rail platform"]
            };
          }
        }
      }
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(result.candidates[0].name).toBe("OpenAI searched candidate");
    expect(result.report.summaryMarkdown).toContain("1.23000, 4.56000");
  });
});
