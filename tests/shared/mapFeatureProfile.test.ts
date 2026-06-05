import { describe, expect, it } from "vitest";
import { buildMapFeatureProfile } from "../../src/shared/mapFeatureProfile";

describe("buildMapFeatureProfile", () => {
  it("separates map-verifiable visual features from media/source-only clues", () => {
    const profile = buildMapFeatureProfile(
      {
        source: "CCTV 7",
        notes: "视频来自国防军事频道，旁边有站台和红色围墙"
      },
      {
        ocrText: ["CCTV.com", "袁航"],
        visibleLabels: ["CCTV 7", "国防军事"],
        languages: ["Chinese"],
        sceneFeatures: ["CCTV 7", "red wall", "blue roof", "utility poles", "flowerbed", "platform edge"],
        spatialRelationships: [
          "camera south of tracks looking north",
          "platform left of blue-roof building",
          "CCTV.com lower-right bug"
        ],
        inferredSearchTerms: ["火箭军 新兵团 红色围墙 蓝色屋顶 站台"]
      }
    );

    expect(profile.primaryFeatures).toEqual(["red wall", "blue roof", "utility poles", "flowerbed", "platform edge"]);
    expect(profile.spatialRelationships).toEqual([
      "camera south of tracks looking north",
      "platform left of blue-roof building"
    ]);
    expect(profile.viewpointConstraints).toEqual(["camera south of tracks looking north"]);
    expect(profile.auxiliaryTextClues).toEqual(["袁航"]);
    expect(profile.excludedSourceOnlyClues).toEqual(["CCTV 7", "国防军事", "CCTV.com"]);
    expect(profile.searchInstruction).toContain("red wall");
    expect(profile.searchInstruction).not.toContain("CCTV");
  });
});
