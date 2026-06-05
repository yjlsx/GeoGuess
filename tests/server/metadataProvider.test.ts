import { describe, expect, it } from "vitest";
import { buildMetadataEvidenceFromTags } from "../../server/providers/metadataProvider";

describe("buildMetadataEvidenceFromTags", () => {
  it("normalizes GPS, capture time, and camera tags into metadata evidence", () => {
    const evidence = buildMetadataEvidenceFromTags("uploads/scene.jpg", {
      latitude: 35.6895,
      longitude: 139.6917,
      DateTimeOriginal: "2026:05:31 10:20:30",
      Make: "ExampleCam",
      Model: "Geo 1"
    });

    expect(evidence).toEqual({
      sourcePath: "uploads/scene.jpg",
      gps: {
        latitude: 35.6895,
        longitude: 139.6917
      },
      capturedAt: "2026-05-31T10:20:30",
      camera: "ExampleCam Geo 1",
      evidenceType: "exif",
      notes: ["EXIF GPS coordinates found in the original media file."]
    });
  });

  it("ignores invalid GPS coordinates but keeps useful non-location metadata", () => {
    const evidence = buildMetadataEvidenceFromTags("uploads/no-gps.jpg", {
      latitude: 120,
      longitude: 181,
      CreateDate: new Date("2026-05-31T12:00:00Z")
    });

    expect(evidence.gps).toBeUndefined();
    expect(evidence.capturedAt).toBe("2026-05-31T12:00:00.000Z");
    expect(evidence.notes).toEqual(["No EXIF GPS coordinates found."]);
  });
});
