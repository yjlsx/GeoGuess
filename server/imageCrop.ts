import path from "node:path";
import sharp from "sharp";
import type { CropMode } from "../src/shared/types";

export type ManualCrop = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export class CropValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CropValidationError";
  }
}

export async function createAnalysisCrop(args: {
  imagePath: string;
  cropMode: CropMode;
  manualCrop?: ManualCrop;
}) {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(args.imagePath).metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read image dimensions";
    throw new CropValidationError(message);
  }
  if (!metadata.width || !metadata.height) {
    throw new CropValidationError("Unable to read image dimensions");
  }

  if (args.cropMode === "full") {
    return args.imagePath;
  }

  const extract =
    args.cropMode === "upper_half"
      ? { left: 0, top: 0, width: metadata.width, height: Math.max(1, Math.floor(metadata.height / 2)) }
      : args.manualCrop;

  if (!extract) {
    throw new CropValidationError("Manual crop is required when cropMode is manual");
  }

  const parsed = path.parse(args.imagePath);
  const outputPath = path.join(parsed.dir, `${parsed.name}-${args.cropMode}.jpg`);
  try {
    await sharp(args.imagePath).extract(extract).jpeg().toFile(outputPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid crop";
    throw new CropValidationError(message);
  }
  return outputPath;
}
