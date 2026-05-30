import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = path.resolve(".data", "investigations");

export async function createInvestigationDir(id = `investigation-${Date.now()}`) {
  const dir = path.join(dataDir, id);
  await mkdir(dir, { recursive: true });
  return { id, dir };
}

export async function saveUploadedImage(args: { dir: string; originalName: string; buffer: Buffer }) {
  const safeName = args.originalName.replace(/[^a-zA-Z0-9._-]/g, "_") || "upload.jpg";
  const outputPath = path.join(args.dir, safeName);
  await writeFile(outputPath, args.buffer);
  return outputPath;
}
