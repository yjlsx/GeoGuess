import express from "express";
import multer from "multer";
import { z } from "zod";
import { createAnalysisCrop } from "./imageCrop";
import { runInvestigation } from "./investigationService";
import { createInvestigationDir, saveUploadedImage } from "./storage";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const bodySchema = z.object({
  cropMode: z.enum(["full", "upper_half", "manual"]).default("upper_half"),
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
    .optional()
});

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
      manualClues: req.body.manualClues ? JSON.parse(req.body.manualClues) : undefined
    });

    const { id, dir } = await createInvestigationDir();
    const originalPath = await saveUploadedImage({
      dir,
      originalName: req.file.originalname,
      buffer: req.file.buffer
    });
    const cropPath = await createAnalysisCrop({
      imagePath: originalPath,
      cropMode: parsed.cropMode
    });

    const investigation = await runInvestigation({
      id,
      image: { originalPath, cropPath, cropMode: parsed.cropMode },
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
  res.status(500).json({ error: message });
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, "127.0.0.1", () => {
  console.log(`Image Geo Finder API listening on http://127.0.0.1:${port}`);
});
