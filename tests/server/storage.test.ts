import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalCwd = process.cwd();
let tempDir: string;

describe("storage helpers", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "image-geo-storage-"));
    process.chdir(tempDir);
    vi.resetModules();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates an investigation directory and saves uploads with a safe file name", async () => {
    const { createInvestigationDir, saveUploadedImage } = await import("../../server/storage");
    const { id, dir } = await createInvestigationDir("case-123");
    const outputPath = await saveUploadedImage({
      dir,
      originalName: "street view?.jpg",
      buffer: Buffer.from("image-bytes")
    });

    expect(id).toBe("case-123");
    expect(dir).toBe(path.resolve(".data", "investigations", "case-123"));
    expect(outputPath).toBe(path.join(dir, "street_view_.jpg"));
    await expect(readFile(outputPath, "utf8")).resolves.toBe("image-bytes");
  });
});
