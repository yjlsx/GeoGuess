import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { createOpenAIVisionProvider } from "../../server/providers/openaiVisionProvider";

describe("createOpenAIVisionProvider", () => {
  it("calls an OpenAI-compatible vision model with base URL, API key, and image data", async () => {
    const imageDir = join(process.cwd(), "tmp-test-output");
    await mkdir(imageDir, { recursive: true });
    const imagePath = join(imageDir, "vision-provider.jpg");
    await writeFile(
      imagePath,
      await sharp({
        create: {
          width: 12,
          height: 8,
          channels: 3,
          background: "#ffffff"
        }
      })
        .jpeg()
        .toBuffer()
    );

    const create = vi.fn(async (_input: unknown) => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              ocrText: ["CCTV 7"],
              visibleLabels: ["station building"],
              languages: ["Chinese"],
              sceneFeatures: ["railway tracks", "open grassland"],
              spatialRelationships: ["tracks run horizontally in front of the building"],
              inferredSearchTerms: ["railway station grassland military transport"]
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

    const provider = createOpenAIVisionProvider({
      apiKey: "test-api-key",
      baseUrl: "https://proxy.example/v1",
      model: "vision-model",
      clientFactory
    });

    const clues = await provider.extractClues({
      imagePath,
      userScope: { country: "Mongolia" },
      manualClues: {
        ocrText: ["manual OCR"],
        visibleLabels: [],
        languages: [],
        sceneFeatures: [],
        spatialRelationships: [],
        inferredSearchTerms: []
      }
    });

    expect(clientFactory).toHaveBeenCalledWith({
      apiKey: "test-api-key",
      baseURL: "https://proxy.example/v1"
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "vision-model",
        response_format: expect.objectContaining({ type: "json_schema" })
      })
    );
    const request = create.mock.calls[0][0] as { messages: unknown[] };
    expect(JSON.stringify(request.messages)).toContain("data:image/jpeg;base64,");
    expect(JSON.stringify(request.messages)).toContain("Mongolia");
    expect(clues.ocrText).toEqual(["CCTV 7", "manual OCR"]);
    expect(clues.sceneFeatures).toContain("railway tracks");
    expect(clues.spatialRelationships).toContain("tracks run horizontally in front of the building");
  });
});
