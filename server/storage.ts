import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = path.resolve(".data", "investigations");

export async function createInvestigationDir(id = `investigation-${randomUUID()}`) {
  const dir = path.join(dataDir, id);
  await mkdir(dir, { recursive: true });
  return { id, dir };
}

export async function saveUploadedImage(args: { dir: string; originalName: string; buffer: Buffer }) {
  const baseName = path.basename(args.originalName);
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeName = !sanitized || sanitized === "." || sanitized === ".." ? "upload.jpg" : sanitized;
  const outputPath = path.join(args.dir, `${randomUUID()}-${safeName}`);
  const resolvedDir = path.resolve(args.dir);
  const resolvedOutputPath = path.resolve(outputPath);

  if (!resolvedOutputPath.startsWith(`${resolvedDir}${path.sep}`)) {
    throw new Error("Upload path escapes investigation directory");
  }

  await writeFile(outputPath, args.buffer);
  return outputPath;
}
