import request from "supertest";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runInvestigationMock } = vi.hoisted(() => ({
  runInvestigationMock: vi.fn(async (input) => ({
    id: input.id,
    image: input.image,
    userScope: input.userScope,
    extractedClues: {
      ocrText: [],
      visibleLabels: [],
      languages: [],
      sceneFeatures: [],
      spatialRelationships: [],
      inferredSearchTerms: []
    },
    searchQueries: [],
    candidates: [],
    report: {
      summaryMarkdown: "",
      fullMarkdown: "",
      createdAt: "2026-05-31T00:00:00.000Z"
    }
  }))
}));

vi.mock("../../server/investigationService", () => ({
  runInvestigation: runInvestigationMock
}));

const { app } = await import("../../server/index");

async function imageBuffer() {
  return sharp({
    create: {
      width: 8,
      height: 6,
      channels: 3,
      background: "#ffffff"
    }
  })
    .jpeg()
    .toBuffer();
}

describe("local investigation API", () => {
  beforeEach(() => {
    runInvestigationMock.mockClear();
  });

  it("can be imported without listening and serves health checks", async () => {
    await request(app).get("/api/health").expect(200, { ok: true });
  });

  it("returns 400 when the image upload is missing", async () => {
    const response = await request(app).post("/api/investigations").expect(400);

    expect(response.body.error).toBe("image file is required");
    expect(runInvestigationMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed manualClues JSON", async () => {
    const response = await request(app)
      .post("/api/investigations")
      .attach("image", await imageBuffer(), "scene.jpg")
      .field("manualClues", "{bad-json")
      .expect(400);

    expect(response.body.error).toMatch(/manualClues/i);
    expect(runInvestigationMock).not.toHaveBeenCalled();
  });

  it("returns 400 for manual crop mode without coordinates", async () => {
    const response = await request(app)
      .post("/api/investigations")
      .attach("image", await imageBuffer(), "scene.jpg")
      .field("cropMode", "manual")
      .expect(400);

    expect(response.body.error).toMatch(/manual crop/i);
    expect(runInvestigationMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid image bytes", async () => {
    const response = await request(app)
      .post("/api/investigations")
      .attach("image", Buffer.from("not-an-image"), "scene.jpg")
      .expect(400);

    expect(response.body.error).toMatch(/image|input|buffer/i);
    expect(runInvestigationMock).not.toHaveBeenCalled();
  });

  it("passes JSON manualCrop coordinates to manual crop requests", async () => {
    const response = await request(app)
      .post("/api/investigations")
      .attach("image", await imageBuffer(), "scene.jpg")
      .field("cropMode", "manual")
      .field("manualCrop", JSON.stringify({ left: 1, top: 1, width: 4, height: 3 }))
      .expect(200);

    expect(response.body.image.cropMode).toBe("manual");
    expect(response.body.image.cropPath).toMatch(/-manual\.jpg$/);
    expect(runInvestigationMock).toHaveBeenCalledOnce();
  });

  it("returns 413 when the upload exceeds the configured file size limit", async () => {
    const response = await request(app)
      .post("/api/investigations")
      .attach("image", Buffer.alloc(20 * 1024 * 1024 + 1), "large.jpg")
      .expect(413);

    expect(response.body.error).toMatch(/file too large/i);
    expect(runInvestigationMock).not.toHaveBeenCalled();
  });
});
