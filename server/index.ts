import express from "express";
import multer from "multer";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { createAnalysisCrop, CropValidationError } from "./imageCrop";
import { runInvestigation } from "./investigationService";
import { createInvestigationDir, saveUploadedImage } from "./storage";

export const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

class ClientInputError extends Error {
  statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "ClientInputError";
  }
}

const manualCropSchema = z.object({
  left: z.number().int().nonnegative(),
  top: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

const bodySchema = z.object({
  cropMode: z.enum(["full", "upper_half", "manual"]).default("full"),
  outputLanguage: z.enum(["zh-CN", "en-US"]).default("zh-CN"),
  country: z.string().optional(),
  region: z.string().optional(),
  facilityType: z.string().optional(),
  source: z.string().optional(),
  dateOrTimeHint: z.string().optional(),
  notes: z.string().optional(),
  manualClues: z
    .object({
      ocrText: z.array(z.string()).default([]),
      visibleLabels: z.array(z.string()).default([]),
      languages: z.array(z.string()).default([]),
      sceneFeatures: z.array(z.string()).default([]),
      spatialRelationships: z.array(z.string()).default([]),
      inferredSearchTerms: z.array(z.string()).default([])
    })
    .optional(),
  manualCrop: manualCropSchema.optional()
}).superRefine((body, ctx) => {
  if (body.cropMode === "manual" && !body.manualCrop) {
    ctx.addIssue({
      code: "custom",
      path: ["manualCrop"],
      message: "manual crop coordinates are required when cropMode is manual"
    });
  }
});

function parseJsonField(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ClientInputError(`${fieldName} must be a JSON string`);
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new ClientInputError(`${fieldName} must be valid JSON`);
  }
}

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/investigations", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "image file is required" });
      return;
    }

    const parsed = bodySchema.parse({
      ...req.body,
      manualClues: parseJsonField(req.body.manualClues, "manualClues"),
      manualCrop: parseJsonField(req.body.manualCrop, "manualCrop")
    });

    const { id, dir } = await createInvestigationDir();
    const originalPath = await saveUploadedImage({
      dir,
      originalName: req.file.originalname,
      buffer: req.file.buffer
    });
    const cropPath = await createAnalysisCrop({
      imagePath: originalPath,
      cropMode: parsed.cropMode,
      manualCrop: parsed.manualCrop
    });

    const investigation = await runInvestigation({
      id,
      image: { originalPath, cropPath, cropMode: parsed.cropMode },
      outputLanguage: parsed.outputLanguage,
      userScope: {
        country: parsed.country,
        region: parsed.region,
        facilityType: parsed.facilityType,
        source: parsed.source,
        dateOrTimeHint: parsed.dateOrTimeHint,
        notes: parsed.notes
      },
      manualClues: parsed.manualClues
    });

    res.json(investigation);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown server error";
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "file too large" });
    return;
  }
  if (error instanceof ClientInputError) {
    res.status(error.statusCode).json({ error: message });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? "invalid request body", details: z.treeifyError(error) });
    return;
  }
  if (error instanceof CropValidationError) {
    res.status(400).json({ error: message });
    return;
  }
  res.status(500).json({ error: message });
});

export function startServer() {
  const port = Number(process.env.PORT ?? 8787);
  return app.listen(port, "127.0.0.1", () => {
    console.log(`Image Geo Finder API listening on http://127.0.0.1:${port}`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  startServer();
}
