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
              featureMatches: [
                {
                  imageFeature: "red running track visible behind the road",
                  mapFeature: "oval running track north of the gate",
                  verification: "Compare the track curve and gate-road alignment in Google Earth.",
                  status: "matched"
                },
                {
                  imageFeature: "original image shows a road boundary on the right",
                  mapFeature: "candidate map has the boundary on the opposite side",
                  verification: "Reject the candidate if the road boundary remains reversed after rotating the map.",
                  status: "mismatch"
                }
              ],
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
    expect(JSON.stringify(request.input)).toContain("featureMatches");
    expect(candidates[0]).toMatchObject({
      id: "openai-candidate-1",
      name: "Example rail yard",
      latitude: 35.6895,
      longitude: 139.6917,
      confidence: "medium",
      matchScore: 68,
      matchedFeatures: ["rail platforms", "urban towers"],
      featureMatches: [
        {
          imageFeature: "red running track visible behind the road",
          mapFeature: "oval running track north of the gate",
          verification: "Compare the track curve and gate-road alignment in Google Earth.",
          status: "matched"
        },
        {
          imageFeature: "original image shows a road boundary on the right",
          mapFeature: "candidate map has the boundary on the opposite side",
          verification: "Reject the candidate if the road boundary remains reversed after rotating the map.",
          status: "mismatch"
        }
      ],
      missingOrUnverifiedFeatures: ["road boundary unclear"],
      viewpointNotes: ["Camera appears south of the tracks looking north"],
      matchingEvidence: expect.arrayContaining([
        "Visible rail platforms match public map imagery",
        expect.stringContaining("本地证据评分 68/100")
      ]),
      uncertainty: expect.arrayContaining([
        "Image crop hides surrounding road network",
        expect.stringContaining("本地证据评分扣分项")
      ]),
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

  it("uses sanitized map-verifiable clues in the candidate search prompt", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          candidates: [
            {
              name: "Clean prompt candidate",
              latitude: 35.6895,
              longitude: 139.6917,
              confidence: "medium",
              matchScore: 72,
              matchedFeatures: ["rail platform", "blue warehouse"],
              missingOrUnverifiedFeatures: [],
              viewpointNotes: ["blue warehouse behind rail platform"],
              matchingEvidence: ["Satellite map shows rail platform and blue warehouse"],
              uncertainty: [],
              sources: [
                {
                  title: "Example source",
                  url: "https://example.test/clean-prompt",
                  note: "Search result for candidate"
                }
              ],
              earthVerificationChecklist: ["Compare platform and warehouse alignment"]
            }
          ]
        })
      })
    }));
    const provider = createOpenAISearchProvider({
      apiKey: "test-api-key",
      fetchImpl: fetchMock
    });

    await provider.findCandidates({
      ...baseSearchArgs,
      clues: {
        ...baseSearchArgs.clues,
        visibleLabels: ["top-left logo bug"],
        sceneFeatures: ["top-left logo bug", "rail platform", "blue warehouse"],
        spatialRelationships: ["lower-right timestamp overlays the road", "blue warehouse behind rail platform"],
        inferredSearchTerms: ["timestamp overlay rail depot"]
      },
      mapFeatureProfile: {
        primaryFeatures: ["rail platform", "blue warehouse"],
        spatialRelationships: ["blue warehouse behind rail platform"],
        viewpointConstraints: [],
        auxiliaryTextClues: [],
        excludedSourceOnlyClues: ["top-left logo bug", "lower-right timestamp overlays the road"],
        searchInstruction: "Primary map checks: rail platform; blue warehouse."
      }
    });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { input: string };
    const promptLines = request.input.split("\n");
    const visualLine = promptLines.find((line) => line.startsWith("视觉特征"));
    const spatialLine = promptLines.find((line) => line.startsWith("空间关系"));
    const excludedLine = promptLines.find((line) => line.startsWith("排除为主要证据"));

    expect(visualLine).toContain("rail platform");
    expect(visualLine).toContain("blue warehouse");
    expect(visualLine).not.toContain("logo bug");
    expect(spatialLine).toContain("blue warehouse behind rail platform");
    expect(spatialLine).not.toContain("timestamp");
    expect(excludedLine).toContain("logo bug");
    expect(excludedLine).toContain("timestamp");
  });

  it("parses candidates from nested Responses API output_text content", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  candidates: [
                    {
                      name: "Nested response candidate",
                      latitude: 35.6895,
                      longitude: 139.6917,
                      confidence: "medium",
                      matchScore: 72,
                      matchedFeatures: ["rail platforms"],
                      missingOrUnverifiedFeatures: [],
                      viewpointNotes: ["Needs map check"],
                      matchingEvidence: ["Public map imagery shows rail platforms"],
                      uncertainty: ["test"],
                      sources: [
                        {
                          title: "Nested source",
                          url: "https://example.test/nested",
                          note: "Nested Responses API result"
                        }
                      ],
                      earthVerificationChecklist: ["Compare rail alignment"]
                    }
                  ]
                })
              }
            ]
          }
        ]
      })
    }));
    const provider = createOpenAISearchProvider({
      apiKey: "test-api-key",
      fetchImpl: fetchMock
    });

    const candidates = await provider.findCandidates(baseSearchArgs);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: "Nested response candidate",
      latitude: 35.6895,
      longitude: 139.6917
    });
  });

  it("adds explicit custom rectangle scope constraints to the search prompt", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          candidates: [
            {
              name: "Scoped rail candidate",
              latitude: 35.1,
              longitude: 139.2,
              confidence: "medium",
              matchScore: 72,
              matchedFeatures: ["rail platforms", "urban towers"],
              matchingEvidence: ["Satellite map imagery shows rail platforms and urban towers"],
              uncertainty: ["Needs manual confirmation"],
              sources: [
                {
                  title: "Scoped source",
                  url: "https://example.test/scoped",
                  note: "Candidate source"
                }
              ],
              earthVerificationChecklist: ["Compare rail platform orientation"]
            }
          ]
        })
      })
    }));

    const provider = createOpenAISearchProvider({
      apiKey: "test-api-key",
      fetchImpl: fetchMock
    });

    await provider.findCandidates({
      ...baseSearchArgs,
      userScope: {
        ...baseSearchArgs.userScope,
        regionScope: "custom",
        boundaryMode: "rectangle",
        coordinateBox: {
          minLat: 35,
          minLon: 139,
          maxLat: 36,
          maxLon: 140
        }
      }
    });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(String(request.input)).toContain("用户自定义矩形范围约束");
    expect(String(request.input)).toContain("南 35");
    expect(String(request.input)).toContain("西 139");
    expect(String(request.input)).toContain("范围外候选只能作为低置信备选");
  });

  it("adds explicit custom polygon scope constraints to the search prompt", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          candidates: [
            {
              name: "Polygon scoped rail candidate",
              latitude: 35.1,
              longitude: 139.2,
              confidence: "medium",
              matchScore: 72,
              matchedFeatures: ["rail platforms", "urban towers"],
              matchingEvidence: ["Satellite map imagery shows rail platforms and urban towers"],
              uncertainty: ["Needs manual confirmation"],
              sources: [
                {
                  title: "Polygon source",
                  url: "https://example.test/polygon",
                  note: "Candidate source"
                }
              ],
              earthVerificationChecklist: ["Compare rail platform orientation"]
            }
          ]
        })
      })
    }));

    const provider = createOpenAISearchProvider({
      apiKey: "test-api-key",
      fetchImpl: fetchMock
    });

    await provider.findCandidates({
      ...baseSearchArgs,
      userScope: {
        ...baseSearchArgs.userScope,
        regionScope: "custom",
        boundaryMode: "polygon",
        polygonCoordinates: ["35.000000, 139.000000", "35.000000, 140.000000", "36.000000, 140.000000"].join("\n")
      }
    });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(String(request.input)).toContain("用户自定义多边形范围约束");
    expect(String(request.input)).toContain("35.000000, 139.000000");
    expect(String(request.input)).toContain("范围外候选只能作为低置信备选");
  });

  it("normalizes GCJ-02 candidate coordinates to WGS84 for Google map verification", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          candidates: [
            {
              name: "Beijing coordinate candidate",
              latitude: 39.910226,
              longitude: 116.403713,
              confidence: "medium",
              matchScore: 72,
              matchedFeatures: ["rail platforms", "urban towers"],
              matchingEvidence: ["Satellite map imagery shows rail platforms and urban towers"],
              uncertainty: ["Needs manual confirmation"],
              sources: [
                {
                  title: "Coordinate source",
                  url: "https://example.test/gcj",
                  note: "Source reports GCJ-02 coordinate"
                }
              ],
              earthVerificationChecklist: ["Compare converted coordinate in Google Earth"]
            }
          ]
        })
      })
    }));

    const provider = createOpenAISearchProvider({
      apiKey: "test-api-key",
      coordinateSystem: "GCJ-02",
      fetchImpl: fetchMock
    });

    const candidates = await provider.findCandidates(baseSearchArgs);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);

    expect(String(request.input)).toContain("候选坐标系统：GCJ-02");
    expect(candidates[0].latitude).toBeCloseTo(39.90882, 4);
    expect(candidates[0].longitude).toBeCloseTo(116.39747, 4);
    expect(candidates[0].mapLinks.googleMaps).toContain("39.908");
    expect(candidates[0].mapLinks.googleMaps).toContain("116.397");
    expect(candidates[0].uncertainty.join(" ")).toContain("GCJ-02 坐标已转换为 WGS84");
  });

  it("normalizes BD-09 candidate coordinates to WGS84 for Google map verification", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          candidates: [
            {
              name: "Beijing BD coordinate candidate",
              latitude: 39.916566,
              longitude: 116.410086,
              confidence: "medium",
              matchScore: 72,
              matchedFeatures: ["rail platforms", "urban towers"],
              matchingEvidence: ["Satellite map imagery shows rail platforms and urban towers"],
              uncertainty: ["Needs manual confirmation"],
              sources: [
                {
                  title: "Coordinate source",
                  url: "https://example.test/bd",
                  note: "Source reports BD-09 coordinate"
                }
              ],
              earthVerificationChecklist: ["Compare converted coordinate in Google Earth"]
            }
          ]
        })
      })
    }));

    const provider = createOpenAISearchProvider({
      apiKey: "test-api-key",
      coordinateSystem: "BD-09",
      fetchImpl: fetchMock
    });

    const candidates = await provider.findCandidates(baseSearchArgs);

    expect(candidates[0].latitude).toBeCloseTo(39.90882, 3);
    expect(candidates[0].longitude).toBeCloseTo(116.39747, 3);
    expect(candidates[0].mapPreview.googleEarthWebUrl).toContain("39.90");
    expect(candidates[0].uncertainty.join(" ")).toContain("BD-09 坐标已转换为 WGS84");
  });

  it("retries transient upstream response failures before giving up on candidate search", async () => {
    const upstreamFailure =
      '{"error":{"message":"Upstream request failed","type":"upstream_error"}}event: response.failed data: {"type":"response.failed"}';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
        text: async () => upstreamFailure
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            candidates: [
              {
                name: "Recovered candidate",
                latitude: 35.1,
                longitude: 139.2,
                confidence: "low",
                matchScore: 56,
                matchedFeatures: ["rail platforms"],
                matchingEvidence: ["Rail platforms are visible on public map imagery"],
                uncertainty: ["Recovered after a transient upstream failure"],
                sources: [
                  {
                    title: "Recovered source",
                    url: "https://example.test/recovered",
                    note: "Confirms the recovered rail platform candidate after retry"
                  }
                ],
                earthVerificationChecklist: ["Compare rail platform orientation"]
              }
            ]
          })
        })
      });
    const providerOptions = {
      apiKey: "test-api-key",
      baseUrl: "https://proxy.example/v1",
      model: "gpt-4o",
      fetchImpl: fetchMock,
      retryDelayMs: 0
    } as Parameters<typeof createOpenAISearchProvider>[0] & { retryDelayMs: number };
    const provider = createOpenAISearchProvider(providerOptions);

    const candidates = await provider.findCandidates(baseSearchArgs);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: "Recovered candidate",
      latitude: 35.1,
      longitude: 139.2,
      matchScore: 46
    });
  });

  it("retries thrown network failures before candidate search fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("read ECONNRESET"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            candidates: [
              {
                name: "Recovered after network reset",
                latitude: 35.1,
                longitude: 139.2,
                confidence: "medium",
                matchScore: 72,
                matchedFeatures: ["rail platforms", "urban towers"],
                matchingEvidence: ["Satellite map imagery shows rail platforms and urban towers"],
                uncertainty: ["Recovered after network reset"],
                sources: [
                  {
                    title: "Recovered source",
                    url: "https://example.test/network-recovered",
                    note: "Candidate source after network retry"
                  }
                ],
                earthVerificationChecklist: ["Compare rail orientation"]
              }
            ]
          })
        })
      });
    const providerOptions = {
      apiKey: "test-api-key",
      fetchImpl: fetchMock,
      retryDelayMs: 0
    } as Parameters<typeof createOpenAISearchProvider>[0] & { retryDelayMs: number };
    const provider = createOpenAISearchProvider(providerOptions);

    const candidates = await provider.findCandidates(baseSearchArgs);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toBe("Recovered after network reset");
  });

  it("summarizes repeated thrown network failures with the retry count", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("fetch failed: getaddrinfo ENOTFOUND proxy.example");
    });
    const providerOptions = {
      apiKey: "test-api-key",
      fetchImpl: fetchMock,
      retryDelayMs: 0
    } as Parameters<typeof createOpenAISearchProvider>[0] & { retryDelayMs: number };
    const provider = createOpenAISearchProvider(providerOptions);

    let message = "";
    try {
      await provider.findCandidates(baseSearchArgs);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(message).toContain("联网候选搜索暂时不可用（网络请求异常）");
    expect(message).toContain("系统已自动重试 3 次");
    expect(message).toContain("fetch failed");
  });

  it("summarizes repeated upstream failures without leaking streamed error payloads", async () => {
    const upstreamFailure =
      '{"error":{"message":"Upstream request failed","type":"upstream_error"}}event: response.failed data: {"type":"response.failed","response":{"status":"failed"}}';
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => ({}),
      text: async () => upstreamFailure
    }));
    const providerOptions = {
      apiKey: "test-api-key",
      baseUrl: "https://proxy.example/v1",
      model: "gpt-4o",
      fetchImpl: fetchMock,
      retryDelayMs: 0
    } as Parameters<typeof createOpenAISearchProvider>[0] & { retryDelayMs: number };
    const provider = createOpenAISearchProvider(providerOptions);

    let message = "";
    try {
      await provider.findCandidates(baseSearchArgs);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(message).toContain("联网候选搜索暂时不可用（HTTP 502）");
    expect(message).toContain("系统已自动重试 3 次");
    expect(message).toContain("切换模型或 Base URL");
    expect(message).not.toContain("event: response.failed");
    expect(message).not.toContain('"response":{"status":"failed"}');
    const fallbackCall = fetchMock.mock.calls[3] as unknown as [string, RequestInit];
    const fallbackRequest = JSON.parse(fallbackCall[1].body as string);
    expect(fallbackRequest.tools).toBeUndefined();
    const chatFallbackCall = fetchMock.mock.calls[4] as unknown as [string, RequestInit];
    expect(chatFallbackCall[0]).toBe("https://proxy.example/v1/chat/completions");
  });

  it("falls back to model-only candidate generation when web search upstream is unavailable", async () => {
    const upstreamFailure = '{"error":{"message":"Upstream request failed","type":"upstream_error"}}';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
        text: async () => upstreamFailure
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
        text: async () => upstreamFailure
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
        text: async () => upstreamFailure
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            candidates: [
              {
                name: "Model-only review candidate",
                latitude: 35.1,
                longitude: 139.2,
                confidence: "low",
                matchScore: 38,
                matchedFeatures: ["rail platforms", "red wall"],
                missingOrUnverifiedFeatures: ["source link unavailable"],
                viewpointNotes: ["Generated without live web search; requires manual map check"],
                matchingEvidence: ["Visual clues suggest a rail-adjacent training ground"],
                uncertainty: ["Web search upstream was unavailable"],
                sources: [
                  {
                    title: "Model-only fallback",
                    url: "local://model-only-candidate",
                    note: "Candidate generated from extracted clues without live web search"
                  }
                ],
                earthVerificationChecklist: ["Manually compare rail platform, red wall, and parade ground geometry"]
              }
            ]
          })
        })
      });
    const providerOptions = {
      apiKey: "test-api-key",
      baseUrl: "https://proxy.example/v1",
      model: "gpt-4o",
      fetchImpl: fetchMock,
      retryDelayMs: 0
    } as Parameters<typeof createOpenAISearchProvider>[0] & { retryDelayMs: number };
    const provider = createOpenAISearchProvider(providerOptions);

    const candidates = await provider.findCandidates(baseSearchArgs);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const fallbackCall = fetchMock.mock.calls[3] as unknown as [string, RequestInit];
    const fallbackRequest = JSON.parse(fallbackCall[1].body as string);
    expect(fallbackRequest.tools).toBeUndefined();
    expect(JSON.stringify(fallbackRequest.input)).toContain("无联网工具候选生成模式");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: "Model-only review candidate",
      confidence: "low"
    });
    expect(candidates[0].uncertainty.join(" ")).toContain("Web search upstream was unavailable");
  });

  it("falls back to chat completions when an OpenAI-compatible Base URL does not support Responses API", async () => {
    const upstreamFailure = '{"error":{"message":"Upstream request failed","type":"upstream_error"}}';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
        text: async () => upstreamFailure
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
        text: async () => upstreamFailure
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
        text: async () => upstreamFailure
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
        text: async () => upstreamFailure
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  candidates: [
                    {
                      name: "Chat fallback review candidate",
                      latitude: 35.1,
                      longitude: 139.2,
                      confidence: "low",
                      matchScore: 34,
                      matchedFeatures: ["rail platforms", "red wall"],
                      missingOrUnverifiedFeatures: ["public source link unavailable"],
                      viewpointNotes: ["Generated through chat fallback; requires manual map check"],
                      matchingEvidence: ["Visual clues suggest rail platforms beside a red wall"],
                      uncertainty: ["Responses API or web search tool was unavailable"],
                      sources: [],
                      earthVerificationChecklist: ["Compare rail platform, red wall, and nearby road geometry in Google Earth"]
                    }
                  ]
                })
              }
            }
          ]
        })
      });
    const providerOptions = {
      apiKey: "test-api-key",
      baseUrl: "https://proxy.example/v1",
      model: "compat-vision-model",
      fetchImpl: fetchMock,
      retryDelayMs: 0
    } as Parameters<typeof createOpenAISearchProvider>[0] & { retryDelayMs: number };
    const provider = createOpenAISearchProvider(providerOptions);

    const candidates = await provider.findCandidates(baseSearchArgs);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    const chatCall = fetchMock.mock.calls[4] as unknown as [string, RequestInit];
    expect(chatCall[0]).toBe("https://proxy.example/v1/chat/completions");
    const chatRequest = JSON.parse(chatCall[1].body as string);
    expect(chatRequest.model).toBe("compat-vision-model");
    expect(chatRequest.messages[1].content).toContain("无联网工具候选生成模式");
    expect(chatRequest.response_format).toEqual({ type: "json_object" });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: "Chat fallback review candidate",
      confidence: "low",
      sources: []
    });
    expect(candidates[0].uncertainty.join(" ")).toContain("未附可追溯来源链接");
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
                    note: "Confirms the broader rail platform candidate"
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
      matchScore: 29,
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
                  note: "Confirms the below-threshold rail platform candidate"
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
      matchScore: 29
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

  it("rejects sourced candidates that lack map-verifiable physical evidence", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            candidates: [
              {
                name: "Source-only candidate",
                latitude: 35.6895,
                longitude: 139.6917,
                confidence: "high",
                matchScore: 88,
                matchedFeatures: [],
                matchingEvidence: ["Same broadcast clip is mentioned by this source"],
                uncertainty: ["No map-visible features listed"],
                sources: [
                  {
                    title: "Broadcast source",
                    url: "https://example.test/broadcast-only",
                    note: "Mentions the same video"
                  }
                ],
                earthVerificationChecklist: ["Find physical features later"]
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
                name: "Physical evidence candidate",
                latitude: 35.1,
                longitude: 139.2,
                confidence: "low",
                matchScore: 45,
                matchedFeatures: ["rail platform"],
                matchingEvidence: ["Satellite map shows a rail platform beside low buildings"],
                uncertainty: ["Needs manual confirmation"],
                sources: [
                  {
                    title: "Map source",
                    url: "https://example.test/map-evidence",
                    note: "Mentions the candidate area"
                  }
                ],
                earthVerificationChecklist: ["Compare rail platform alignment"]
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
    expect(candidates[0].name).toBe("Physical evidence candidate");
  });

  it("re-ranks model candidates with local evidence scoring before returning them", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          candidates: [
            {
              name: "High model score but weak evidence",
              latitude: 35.6895,
              longitude: 139.6917,
              confidence: "high",
              matchScore: 92,
              matchedFeatures: ["rail platforms"],
              missingOrUnverifiedFeatures: ["urban towers missing", "viewpoint opposite", "source not found"],
              viewpointNotes: ["Camera direction appears opposite"],
              matchingEvidence: ["Possible rail platforms"],
              uncertainty: ["No public source"],
              sources: [],
              earthVerificationChecklist: []
            },
            {
              name: "Lower model score but stronger evidence",
              latitude: 35.1,
              longitude: 139.2,
              confidence: "medium",
              matchScore: 72,
              matchedFeatures: ["rail platforms", "urban towers"],
              missingOrUnverifiedFeatures: [],
              viewpointNotes: ["Camera south of the tracks looking north"],
              matchingEvidence: ["Satellite map imagery shows rail platforms and urban towers"],
              uncertainty: ["Needs final manual confirmation"],
              sources: [
                {
                  title: "Public candidate source",
                  url: "https://example.test/stronger",
                  note: "Mentions the candidate rail station"
                }
              ],
              earthVerificationChecklist: ["Compare rail orientation", "Compare tower position"]
            }
          ]
        })
      })
    }));

    const provider = createOpenAISearchProvider({
      apiKey: "test-api-key",
      fetchImpl: fetchMock
    });

    const candidates = await provider.findCandidates(baseSearchArgs);

    expect(candidates).toHaveLength(2);
    expect(candidates[0].name).toBe("Lower model score but stronger evidence");
    expect(candidates[0].matchScore).toBeGreaterThan(candidates[1].matchScore ?? 0);
    expect(candidates[0].matchingEvidence.join(" ")).toContain("本地证据评分");
    expect(candidates[1].uncertainty.join(" ")).toContain("本地证据评分");
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
