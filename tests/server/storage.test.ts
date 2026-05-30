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
    expect(path.dirname(outputPath)).toBe(dir);
    expect(path.basename(outputPath)).toMatch(/^[0-9a-f-]+-street_view_\.jpg$/);
    await expect(readFile(outputPath, "utf8")).resolves.toBe("image-bytes");
  });

  it("creates distinct investigation ids for consecutive default calls", async () => {
    const { createInvestigationDir } = await import("../../server/storage");
    const first = await createInvestigationDir();
    const second = await createInvestigationDir();

    expect(first.id).toMatch(/^investigation-[0-9a-f-]+$/);
    expect(second.id).toMatch(/^investigation-[0-9a-f-]+$/);
    expect(first.id).not.toBe(second.id);
    expect(first.dir).not.toBe(second.dir);
  });

  it("sanitizes path-like upload names and keeps output inside the investigation dir", async () => {
    const { createInvestigationDir, saveUploadedImage } = await import("../../server/storage");
    const { dir } = await createInvestigationDir("case-escape");

    const outputPath = await saveUploadedImage({
      dir,
      originalName: "../..",
      buffer: Buffer.from("safe")
    });

    const resolvedDir = path.resolve(dir);
    const resolvedOutput = path.resolve(outputPath);
    expect(resolvedOutput.startsWith(`${resolvedDir}${path.sep}`)).toBe(true);
    expect(path.basename(outputPath)).toMatch(/^[0-9a-f-]+-upload\.jpg$/);
    await expect(readFile(outputPath, "utf8")).resolves.toBe("safe");
  });
});
