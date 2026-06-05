import { existsSync } from "node:fs";
import exifr from "exifr";
import type { MetadataEvidence } from "../../src/shared/types";
import type { MetadataProvider } from "./types";

type MetadataTags = Record<string, unknown>;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cleanGps(tags: MetadataTags) {
  const latitude = cleanNumber(tags.latitude ?? tags.GPSLatitude);
  const longitude = cleanNumber(tags.longitude ?? tags.GPSLongitude);
  if (latitude === undefined || longitude === undefined) {
    return undefined;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return undefined;
  }
  return { latitude, longitude };
}

function cleanCapturedAt(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString();
  }
  const text = cleanString(value);
  if (!text) {
    return undefined;
  }
  const exifDate = text.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}:\d{2}:\d{2})$/);
  if (exifDate) {
    return `${exifDate[1]}-${exifDate[2]}-${exifDate[3]}T${exifDate[4]}`;
  }
  return text;
}

function cleanCamera(tags: MetadataTags) {
  const camera = [cleanString(tags.Make), cleanString(tags.Model)].filter(Boolean);
  return [...new Set(camera)].join(" ") || undefined;
}

export function buildMetadataEvidenceFromTags(sourcePath: string, tags: MetadataTags): MetadataEvidence {
  const gps = cleanGps(tags);
  return {
    sourcePath,
    gps,
    capturedAt: cleanCapturedAt(tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate),
    camera: cleanCamera(tags),
    evidenceType: "exif",
    notes: gps ? ["EXIF GPS coordinates found in the original media file."] : ["No EXIF GPS coordinates found."]
  };
}

export const exifMetadataProvider: MetadataProvider = {
  async extractMetadata(request) {
    const results: MetadataEvidence[] = [];
    for (const mediaPath of request.mediaPaths) {
      if (!mediaPath || mediaPath.startsWith("local://") || !existsSync(mediaPath)) {
        continue;
      }

      try {
        const tags = (await exifr.parse(mediaPath, {
          gps: true,
          translateValues: true,
          reviveValues: true,
          pick: ["latitude", "longitude", "GPSLatitude", "GPSLongitude", "DateTimeOriginal", "CreateDate", "ModifyDate", "Make", "Model"]
        })) as MetadataTags | undefined;
        if (tags) {
          results.push(buildMetadataEvidenceFromTags(mediaPath, tags));
        }
      } catch {
        results.push({
          sourcePath: mediaPath,
          evidenceType: "exif",
          notes: ["Unable to parse EXIF metadata from this media file."]
        });
      }
    }
    return results;
  }
};
