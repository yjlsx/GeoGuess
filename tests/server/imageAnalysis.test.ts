import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { analyzeImageForInvestigation } from "../../server/imageAnalysis";

describe("analyzeImageForInvestigation", () => {
  it("extracts local image metadata as automatic recognition evidence", async () => {
    const buffer = await sharp({
      create: {
        width: 12,
        height: 8,
        channels: 3,
        background: "#c6b889"
      }
    })
      .jpeg()
      .toBuffer();

    const result = await analyzeImageForInvestigation({
      imagePath: "local://unit-test",
      imageBuffer: buffer,
      outputLanguage: "zh-CN"
    });

    expect(result.recognitionMode).toBe("local-metadata");
    expect(result.observations.join("\n")).toContain("12 x 8");
    expect(result.limitations.join("\n")).toContain("视觉模型");
  });
});
