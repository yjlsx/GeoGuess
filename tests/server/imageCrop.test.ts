import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAnalysisCrop } from "../../server/imageCrop";

let tempDir: string;

describe("createAnalysisCrop", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "image-geo-crop-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes an upper-half crop next to the original image", async () => {
    const imagePath = path.join(tempDir, "scene.jpg");
    await sharp({
      create: {
        width: 8,
        height: 6,
        channels: 3,
        background: "#ffffff"
      }
    })
      .jpeg()
      .toFile(imagePath);

    const cropPath = await createAnalysisCrop({
      imagePath,
      cropMode: "upper_half"
    });
    const metadata = await sharp(cropPath).metadata();

    expect(cropPath).toBe(path.join(tempDir, "scene-upper_half.jpg"));
    expect(metadata.width).toBe(8);
    expect(metadata.height).toBe(3);
  });
});
