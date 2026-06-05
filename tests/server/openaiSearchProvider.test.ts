import { describe, expect, it, vi } from "vitest";
import { createOpenAISearchProvider } from "../../server/providers/openaiSearchProvider";

describe("createOpenAISearchProvider", () => {
  const baseSearchArgs = {
    userScope: {
      country: "Japan",
      region: "Tokyo",
      facilityType: "rail station"
    },
    clues: {
      ocrText: ["JR"],
      visibleLabels: ["platform sign"],
      languages: ["Japanese"],
      sceneFeatures: ["rail platforms", "urban towers"],
      spatialRelationships: ["tracks run beside towers"],
      inferredSearchTerms: ["Tokyo JR rail platform towers"]
    },
    mapFeatureProfile: {
      primaryFeatures: ["rail platforms", "urban towers"],
      spatialRelationships: ["tracks run beside towers"],
      viewpointConstraints: ["camera south of tracks looking north"],
      auxiliaryTextClues: ["JR"],
      excludedSourceOnlyClues: ["CCTV 7"],
      searchInstruction:
        "Primary map checks: rail platforms; urban towers. Spatial checks: tracks run beside towers. Viewpoint checks: camera south of tracks looking north."
    },
    queries: [
      {
        query: "Tokyo JR rail platform towers",
        purpose: "inferred-term"
      }
    ]
  };

  it("uses OpenAI web search to produce coordinate candidates", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          candidates: [
            {
              name: "Example rail yard",
              latitude: 35.6895,
              longitude: 139.6917,
              confidence: "medium",
              matchScore: 72,
              matchedFeatures: ["rail platforms", "urban towers"],
              missingOrUnverifiedFeatures: ["road boundary unclear"],
              viewpointNotes: ["Camera appears south of the tracks looking north"],
              matchingEvidence: ["Visible rail platforms match public map imagery"],
              uncertainty: ["Image crop hides surrounding road network"],
              sources: [
                {
                  title: "Example source",
                  url: "https://example.test/source",
                  note: "Search result for candidate rail yard"
                }
              ],
              earthVerificationChecklist: ["Compare platform alignment in Google Earth"]
            }
          ]
        })
      })
    }));

    const provider = createOpenAISearchProvider({
      apiKey: "test-api-key",
      baseUrl: "https://proxy.example/v1",
      model: "gpt-4o",
      fetchImpl: fetchMock
    });

    const candidates = await provider.findCandidates(baseSearchArgs);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://proxy.example/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key"
        })
      })
    );
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.model).toBe("gpt-4o");
    expect(request.tools).toEqual([{ type: "web_search_preview" }]);
    expect(JSON.stringify(request.input)).toContain("Tokyo JR rail platform towers");
    expect(JSON.stringify(request.input)).toContain("Primary map checks");
    expect(JSON.stringify(request.input)).toContain("CCTV 7");
    expect(JSON.stringify(request.input)).toContain("3-5");
    expect(JSON.stringify(request.input)).toContain("matchScore");
    expect(candidates[0]).toMatchObject({
      id: "openai-candidate-1",
      name: "Example rail yard",
      latitude: 35.6895,
      longitude: 139.6917,
      confidence: "medium",
      matchScore: 72,
      matchedFeatures: ["rail platforms", "urban towers"],
      missingOrUnverifiedFeatures: ["road boundary unclear"],
      viewpointNotes: ["Camera appears south of the tracks looking north"],
      matchingEvidence: ["Visible rail platforms match public map imagery"],
      uncertainty: ["Image crop hides surrounding road network"],
      sources: [
        {
          title: "Example source",
          url: "https://example.test/source",
          note: "Search result for candidate rail yard"
        }
      ],
      earthVerificationChecklist: ["Compare platform alignment in Google Earth"]
    });
    expect(candidates[0].mapLinks.googleMaps).toContain("35.68950%2C139.69170");
    expect(candidates[0].mapPreview.googleEarthWebUrl).toContain("earth.google.com");
  });

  it("runs a broader candidate discovery pass when the strict search returns no coordinates", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({ candidates: [] })
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            candidates: [
              {
                name: "Broader rail candidate",
                latitude: 35.1,
                longitude: 139.2,
                confidence: "low",
                matchScore: 41,
                matchedFeatures: ["rail platforms"],
                missingOrUnverifiedFeatures: ["urban towers"],
                viewpointNotes: ["Needs satellite angle check"],
                matchingEvidence: ["Rail platform geometry may fit"],
                uncertainty: ["Candidate came from broadened search"],
                sources: [
                  {
                    title: "Broader source",
                    url: "https://example.test/broader",
                    note: "Candidate source"
                  }
                ],
                earthVerificationChecklist: ["Compare rail orientation"]
              }
            ]
          })
        })
      });

    const provider = createOpenAISearchProvider({
      apiKey: "test-api-key",
      baseUrl: "https://proxy.example/v1",
      model: "gpt-4o",
      fetchImpl: fetchMock
    });

    const candidates = await provider.findCandidates(baseSearchArgs);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const strictRequest = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const broadRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(JSON.stringify(strictRequest.input)).toContain("严格候选搜索");
    expect(JSON.stringify(broadRequest.input)).toContain("扩大候选发现");
    expect(JSON.stringify(broadRequest.input)).toContain("3-5");
    expect(JSON.stringify(broadRequest.input)).toContain("low");
    expect(JSON.stringify(broadRequest.input)).toContain("Primary map checks");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: "Broader rail candidate",
      confidence: "low",
      matchScore: 41,
      matchedFeatures: ["rail platforms"]
    });
  });

  it("keeps low-scoring candidates for manual review when the threshold would remove every result", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          candidates: [
            {
              name: "Below threshold rail candidate",
              latitude: 35.1,
              longitude: 139.2,
              confidence: "low",
              matchScore: 41,
              matchedFeatures: ["rail platforms"],
              missingOrUnverifiedFeatures: ["urban towers"],
              viewpointNotes: ["Needs satellite angle check"],
              matchingEvidence: ["Rail platform geometry may fit"],
              uncertainty: ["Candidate came from broadened search"],
              sources: [
                {
                  title: "Below threshold source",
                  url: "https://example.test/below-threshold",
                  note: "Candidate source"
                }
              ],
              earthVerificationChecklist: ["Compare rail orientation"]
            }
          ]
        })
      })
    }));

    const provider = createOpenAISearchProvider({
      apiKey: "test-api-key",
      matchingThreshold: 0.6,
      fetchImpl: fetchMock
    });

    const candidates = await provider.findCandidates(baseSearchArgs);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: "Below threshold rail candidate",
      matchScore: 41
    });
  });

  it("keeps physical-feature coordinate candidates even when the model omits source links", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          candidates: [
            {
              name: "Unsourced but reviewable candidate",
              latitude: 35.1,
              longitude: 139.2,
              confidence: "medium",
              matchScore: 68,
              matchedFeatures: ["rail platforms", "low buildings"],
              matchingEvidence: ["Rail platforms and low buildings need map confirmation"],
              sources: [],
              uncertainty: ["Source link omitted by model"],
              earthVerificationChecklist: ["Check rail alignment in Google Earth"]
            }
          ]
        })
      })
    }));

    const provider = createOpenAISearchProvider({
      apiKey: "test-api-key",
      matchingThreshold: 0.6,
      fetchImpl: fetchMock
    });

    const candidates = await provider.findCandidates(baseSearchArgs);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: "Unsourced but reviewable candidate",
      confidence: "low",
      sources: []
    });
    expect(candidates[0].uncertainty.join(" ")).toContain("未附可追溯来源链接");
  });

  it("rejects coordinates that do not include source support and matched physical features", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            candidates: [
              {
                name: "Unsourced coordinate",
                latitude: 35.6895,
                longitude: 139.6917,
                confidence: "high",
                matchScore: 90,
                matchedFeatures: [],
                matchingEvidence: [],
                uncertainty: ["No evidence"],
                sources: [],
                earthVerificationChecklist: ["No concrete check"]
              }
            ]
          })
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            candidates: [
              {
                name: "Sourced physical-feature candidate",
                latitude: 35.1,
                longitude: 139.2,
                confidence: "low",
                matchScore: 45,
                matchedFeatures: ["rail platforms"],
                missingOrUnverifiedFeatures: ["tower shape unclear"],
                viewpointNotes: ["Needs camera angle check"],
                matchingEvidence: ["Rail platforms and adjacent towers appear in source imagery"],
                uncertainty: ["Still needs manual map comparison"],
                sources: [
                  {
                    title: "Candidate source",
                    url: "https://example.test/candidate",
                    note: "Shows the candidate facility layout"
                  }
                ],
                earthVerificationChecklist: ["Compare rail platform orientation"]
              }
            ]
          })
        })
      });

    const provider = createOpenAISearchProvider({
      apiKey: "test-api-key",
      fetchImpl: fetchMock
    });

    const candidates = await provider.findCandidates(baseSearchArgs);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toBe("Sourced physical-feature candidate");
  });
});
