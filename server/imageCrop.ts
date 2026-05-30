import path from "node:path";
import sharp from "sharp";
import type { CropMode } from "../src/shared/types";

export type ManualCrop = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export async function createAnalysisCrop(args: {
  imagePath: string;
  cropMode: CropMode;
  manualCrop?: ManualCrop;
}) {
  if (args.cropMode === "full") {
    return args.imagePath;
  }

  const image = sharp(args.imagePath);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read image dimensions");
  }

  const extract =
    args.cropMode === "upper_half"
      ? { left: 0, top: 0, width: metadata.width, height: Math.floor(metadata.height / 2) }
      : args.manualCrop;

  if (!extract) {
    throw new Error("Manual crop is required when cropMode is manual");
  }

  const parsed = path.parse(args.imagePath);
  const outputPath = path.join(parsed.dir, `${parsed.name}-${args.cropMode}${parsed.ext || ".jpg"}`);
  await sharp(args.imagePath).extract(extract).toFile(outputPath);
  return outputPath;
}
