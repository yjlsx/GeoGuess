import { describe, expect, it, vi } from "vitest";
import { createOpenAIEvidenceVerifier } from "../../server/providers/openaiEvidenceVerifier";

describe("createOpenAIEvidenceVerifier", () => {
  it("uses the configured vision model to compare original and map evidence images", async () => {
    const create = vi.fn(async (_input: unknown) => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              status: "supports",
              confidence: "high",
              rationale: "The blue-roof building, oval track curve, and entry road keep the same relative order in both images."
            })
          }
        }
      ]
    }));
    const clientFactory = vi.fn(() => ({
      chat: {
        completions: {
          create
        }
      }
    }));

    const verifier = createOpenAIEvidenceVerifier({
      apiKey: "test-api-key",
      baseUrl: "https://proxy.example/v1",
      model: "geo-vision-v2",
      clientFactory
    });

    const result = await verifier.verify({
      candidateName: "Example sports ground",
      coordinates: "35.68950, 139.69170",
      imageFeature: "原图左侧蓝顶建筑和跑道弯道相邻",
      mapFeature: "Earth 截图里蓝顶建筑和椭圆跑道弯道相邻",
      verification: "对比蓝顶建筑、椭圆跑道弧线和入口道路三点关系。",
      originalImageDataUrl: "data:image/jpeg;base64,b3JpZ2luYWw=",
      mapImageDataUrl: "data:image/png;base64,bWFw",
      evidenceLink: "https://earth.google.com/web/search/35.6895,139.6917"
    });

    expect(clientFactory).toHaveBeenCalledWith({
      apiKey: "test-api-key",
      baseURL: "https://proxy.example/v1"
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "geo-vision-v2",
        response_format: expect.objectContaining({ type: "json_schema" })
      })
    );
    const request = create.mock.calls[0][0] as { messages: Array<{ content?: unknown }> };
    const requestText = JSON.stringify(request.messages);
    expect(requestText).toContain("原图左侧蓝顶建筑和跑道弯道相邻");
    expect(requestText).toContain("Earth 截图里蓝顶建筑和椭圆跑道弯道相邻");
    expect(requestText).toContain("35.68950, 139.69170");
    expect(requestText).toContain("data:image/jpeg;base64,b3JpZ2luYWw=");
    expect(requestText).toContain("data:image/png;base64,bWFw");
    expect(result).toEqual({
      status: "supports",
      confidence: "high",
      rationale: "The blue-roof building, oval track curve, and entry road keep the same relative order in both images.",
      model: "geo-vision-v2"
    });
  });

  it("normalizes unsupported model output into an inconclusive verification", async () => {
    const verifier = createOpenAIEvidenceVerifier({
      apiKey: "test-api-key",
      model: "geo-vision-v2",
      clientFactory: vi.fn(() => ({
        chat: {
          completions: {
            create: vi.fn(async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      status: "maybe",
                      confidence: "certain",
                      rationale: ""
                    })
                  }
                }
              ]
            }))
          }
        }
      }))
    });

    const result = await verifier.verify({
      imageFeature: "原图中可见白色围墙转角",
      mapFeature: "地图截图中疑似白色围墙",
      verification: "对比围墙转角和入口道路方向。"
    });

    expect(result).toEqual({
      status: "inconclusive",
      confidence: "low",
      rationale: "模型没有给出可用的证据核验理由。",
      model: "geo-vision-v2"
    });
  });
});
