import { execFile } from "node:child_process";
import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type Runner = (command: string, args: string[]) => Promise<void>;

export class VideoFrameExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoFrameExtractionError";
  }
}

async function defaultRunner(command: string, args: string[]) {
  await execFileAsync(command, args, { windowsHide: true });
}

export async function extractVideoFrames(args: {
  videoPath: string;
  outputDir: string;
  maxFrames?: number;
  runner?: Runner;
}) {
  const maxFrames = args.maxFrames ?? 6;
  const runner = args.runner ?? defaultRunner;
  const resolvedOutputDir = path.resolve(args.outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });

  const outputPattern = path.join(resolvedOutputDir, "video-frame-%03d.jpg");
  try {
    await runner("ffmpeg", [
      "-y",
      "-i",
      args.videoPath,
      "-vf",
      "fps=1,scale='min(1280,iw)':-2",
      "-frames:v",
      String(maxFrames),
      outputPattern
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to extract video frames";
    throw new VideoFrameExtractionError(message);
  }

  const frameNames = (await readdir(resolvedOutputDir))
    .filter((name) => /^video-frame-\d+\.jpg$/i.test(name))
    .sort();
  return frameNames.map((name) => path.join(resolvedOutputDir, name));
}
