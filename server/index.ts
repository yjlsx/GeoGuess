import express from "express";
import multer from "multer";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { createAnalysisCrop, CropValidationError } from "./imageCrop";
import { runInvestigation } from "./investigationService";
import { createInvestigationDir, saveUploadedImage } from "./storage";
import { extractVideoFrames, VideoFrameExtractionError } from "./videoFrames";

export const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const defaultOpenAIBaseUrl = "https://api.openai.com/v1";

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

const coordinateBoxSchema = z.object({
  minLat: z.number(),
  minLon: z.number(),
  maxLat: z.number(),
  maxLon: z.number()
});

const bodySchema = z.object({
  cropMode: z.enum(["full", "upper_half", "manual"]).default("full"),
  outputLanguage: z.enum(["zh-CN", "en-US"]).default("zh-CN"),
  regionScope: z.enum(["custom", "global", "country"]).optional(),
  boundaryMode: z.enum(["rectangle", "polygon"]).optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  coordinateBox: coordinateBoxSchema.optional(),
  polygonCoordinates: z.string().optional(),
  facilityType: z.string().optional(),
  source: z.string().optional(),
  dateOrTimeHint: z.string().optional(),
  notes: z.string().optional(),
  visionConfig: z
    .object({
      apiKey: z.string().min(1),
      baseUrl: z.string().url().optional(),
      model: z.string().min(1).optional(),
      matchingThreshold: z.number().min(0).max(1).optional(),
      maxCandidates: z.number().int().min(1).max(50).optional(),
      coordinateSystem: z.enum(["WGS84 (EPSG:4326)", "GCJ-02", "BD-09"]).optional(),
      terrainValidation: z.boolean().optional()
    })
    .optional(),
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

const modelListSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional()
});

function openAIBaseUrlFromConfig(baseUrl?: string) {
  return (baseUrl?.trim() || process.env.OPENAI_BASE_URL?.trim() || defaultOpenAIBaseUrl).replace(/\/+$/, "");
}

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

app.post("/api/models", async (req, res, next) => {
  try {
    const parsed = modelListSchema.parse(req.body);
    const baseUrl = openAIBaseUrlFromConfig(parsed.baseUrl);
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${parsed.apiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new ClientInputError(`模型列表获取失败（HTTP ${response.status}）`);
    }

    const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
    const models = Array.isArray(body.data)
      ? body.data
          .map((model) => (typeof model.id === "string" ? model.id : ""))
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right))
      : [];

    res.json({ models });
  } catch (error) {
    next(error);
  }
});

function uploadedFiles(req: express.Request) {
  if (req.file) {
    return [req.file];
  }
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return [...(files?.image ?? []), ...(files?.assets ?? [])];
}

async function createEvidencePaths(args: {
  dir: string;
  files: Express.Multer.File[];
  cropMode: z.infer<typeof bodySchema>["cropMode"];
  manualCrop?: z.infer<typeof manualCropSchema>;
}) {
  const evidencePaths: string[] = [];
  const sourcePaths: string[] = [];
  let originalPath = "";

  for (const file of args.files) {
    const savedPath = await saveUploadedImage({
      dir: args.dir,
      originalName: file.originalname,
      buffer: file.buffer
    });
    originalPath ||= savedPath;
    sourcePaths.push(savedPath);

    if (file.mimetype.startsWith("video/")) {
      const framePaths = await extractVideoFrames({
        videoPath: savedPath,
        outputDir: args.dir
      });
      for (const framePath of framePaths) {
        evidencePaths.push(
          await createAnalysisCrop({
            imagePath: framePath,
            cropMode: args.cropMode,
            manualCrop: args.manualCrop
          })
        );
      }
      continue;
    }

    evidencePaths.push(
      await createAnalysisCrop({
        imagePath: savedPath,
        cropMode: args.cropMode,
        manualCrop: args.manualCrop
      })
    );
  }

  return {
    originalPath,
    cropPath: evidencePaths[0],
    sourcePaths,
    evidencePaths
  };
}

app.post("/api/investigations", upload.fields([{ name: "image", maxCount: 1 }, { name: "assets", maxCount: 8 }]), async (req, res, next) => {
  try {
    const files = uploadedFiles(req);
    if (files.length === 0) {
      res.status(400).json({ error: "image file is required" });
      return;
    }

    const parsed = bodySchema.parse({
      ...req.body,
      coordinateBox: parseJsonField(req.body.coordinateBox, "coordinateBox"),
      manualClues: parseJsonField(req.body.manualClues, "manualClues"),
      visionConfig: parseJsonField(req.body.visionConfig, "visionConfig"),
      manualCrop: parseJsonField(req.body.manualCrop, "manualCrop")
    });

    const { id, dir } = await createInvestigationDir();
    const image = await createEvidencePaths({
      dir,
      files,
      cropMode: parsed.cropMode,
      manualCrop: parsed.manualCrop
    });

    const investigation = await runInvestigation({
      id,
      image: { ...image, cropMode: parsed.cropMode },
      outputLanguage: parsed.outputLanguage,
      userScope: {
        regionScope: parsed.regionScope,
        boundaryMode: parsed.boundaryMode,
        country: parsed.country,
        region: parsed.region,
        coordinateBox: parsed.coordinateBox,
        polygonCoordinates: parsed.polygonCoordinates,
        facilityType: parsed.facilityType,
        source: parsed.source,
        dateOrTimeHint: parsed.dateOrTimeHint,
        notes: parsed.notes
      },
      manualClues: parsed.manualClues,
      visionConfig: parsed.visionConfig
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
  if (error instanceof VideoFrameExtractionError) {
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
