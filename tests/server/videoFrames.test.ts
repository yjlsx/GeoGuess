import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { extractVideoFrames } from "../../server/videoFrames";

describe("extractVideoFrames", () => {
  it("extracts sampled frames with ffmpeg into the investigation directory", async () => {
    const tempDir = await mkdtemp(join(os.tmpdir(), "image-geo-video-"));
    const videoPath = join(tempDir, "clip.mp4");
    await writeFile(videoPath, "fake-video");
    const seen = {
      command: "",
      args: [] as string[]
    };

    const frames = await extractVideoFrames({
      videoPath,
      outputDir: tempDir,
      maxFrames: 2,
      runner: async (command, args) => {
        seen.command = command;
        seen.args = args;
        await writeFile(join(tempDir, "video-frame-001.jpg"), "frame-1");
        await writeFile(join(tempDir, "video-frame-002.jpg"), "frame-2");
      }
    });

    expect(seen.command).toBe("ffmpeg");
    expect(seen.args).toContain(videoPath);
    expect(seen.args).toContain("-frames:v");
    expect(seen.args).toContain("2");
    expect(frames).toEqual([join(tempDir, "video-frame-001.jpg"), join(tempDir, "video-frame-002.jpg")]);
  });
});
