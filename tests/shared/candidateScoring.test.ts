import { describe, expect, it } from "vitest";
import { scoreAndRankCandidates } from "../../src/shared/candidateScoring";
import type { Candidate, ExtractedClues, MapFeatureProfile, UserScope } from "../../src/shared/types";

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    id: overrides.id ?? "candidate",
    name: overrides.name,
    latitude: overrides.latitude ?? 42.1,
    longitude: overrides.longitude ?? 112.1,
    confidence: overrides.confidence ?? "low",
    matchScore: overrides.matchScore,
    matchedFeatures: overrides.matchedFeatures ?? [],
    missingOrUnverifiedFeatures: overrides.missingOrUnverifiedFeatures ?? [],
    viewpointNotes: overrides.viewpointNotes ?? [],
    mapLinks: {
      googleMaps: "https://maps.example/candidate",
      googleEarthHint: "Check candidate in Earth",
      ...overrides.mapLinks
    },
    mapPreview: {
      googleMapsEmbedUrl: "https://maps.example/embed",
      googleEarthWebUrl: "https://earth.example/search",
      screenshotStatus: "Needs verification",
      notes: [],
      ...overrides.mapPreview
    },
    matchingEvidence: overrides.matchingEvidence ?? [],
    uncertainty: overrides.uncertainty ?? [],
    sources: overrides.sources ?? [],
    osintLinks: overrides.osintLinks,
    earthVerificationChecklist: overrides.earthVerificationChecklist ?? []
  };
}

const clues: ExtractedClues = {
  ocrText: ["Station 42"],
  visibleLabels: ["blue roof sign"],
  languages: ["English"],
  sceneFeatures: ["rail platform", "blue roof", "utility poles", "open grassland"],
  spatialRelationships: ["camera south of tracks looking north", "platform left of blue roof building"],
  inferredSearchTerms: ["rail platform blue roof open grassland"]
};

const mapFeatureProfile: MapFeatureProfile = {
  primaryFeatures: ["rail platform", "blue roof", "utility poles", "open grassland"],
  spatialRelationships: ["camera south of tracks looking north", "platform left of blue roof building"],
  viewpointConstraints: ["camera south of tracks looking north"],
  auxiliaryTextClues: ["Station 42"],
  excludedSourceOnlyClues: ["CCTV 7"],
  searchInstruction: "Primary map checks: rail platform; blue roof; utility poles."
};

const userScope: UserScope = {
  country: "Mongolia",
  region: "Dornogovi",
  facilityType: "rail station"
};

describe("scoreAndRankCandidates", () => {
  it("ranks evidence-supported candidates above model-high but weak candidates", () => {
    const ranked = scoreAndRankCandidates(
      [
        candidate({
          id: "weak-model-score",
          name: "Weak model score",
          confidence: "high",
          matchScore: 92,
          matchedFeatures: ["rail platform"],
          matchingEvidence: ["Possible rail platform"],
          missingOrUnverifiedFeatures: ["blue roof missing", "viewpoint opposite", "source not found"],
          uncertainty: ["No public source", "Several image features are absent"],
          sources: []
        }),
        candidate({
          id: "evidence-supported",
          name: "Evidence supported",
          confidence: "medium",
          matchScore: 72,
          matchedFeatures: ["rail platform", "blue roof", "utility poles", "open grassland"],
          matchingEvidence: ["Satellite map shows rail platform, blue roof, utility poles, and open grassland"],
          viewpointNotes: ["camera south of tracks looking north"],
          sources: [
            {
              title: "Public source",
              url: "https://example.test/source",
              note: "Mentions the rail station candidate"
            }
          ],
          earthVerificationChecklist: ["Compare platform alignment", "Check blue roof building"]
        })
      ],
      { clues, mapFeatureProfile, userScope }
    );

    expect(ranked[0].id).toBe("evidence-supported");
    expect(ranked[0].matchScore).toBeGreaterThan(ranked[1].matchScore ?? 0);
    expect(ranked[0].matchingEvidence.join(" ")).toContain("本地证据评分");
    expect(ranked[1].uncertainty.join(" ")).toContain("本地证据评分");
  });

  it("rewards EXIF candidates without adding artificial uncertainty", () => {
    const [ranked] = scoreAndRankCandidates(
      [
        candidate({
          id: "metadata-candidate-1",
          name: "EXIF GPS metadata",
          confidence: "high",
          matchScore: 100,
          matchedFeatures: ["EXIF GPS coordinates found in original media"],
          sources: [
            {
              title: "Original media metadata",
              url: "local://image.jpg",
              note: "EXIF GPS extracted from original media."
            }
          ]
        })
      ],
      { clues, mapFeatureProfile, userScope }
    );

    expect(ranked.matchScore).toBe(100);
    expect(ranked.confidence).toBe("high");
    expect(ranked.uncertainty.join(" ")).not.toContain("来源不足");
  });

  it("does not let source-only clues outrank physical feature evidence", () => {
    const sourceOnlyClues: ExtractedClues = {
      ...clues,
      sceneFeatures: ["CCTV 7", "rail platform"],
      spatialRelationships: []
    };
    const sourceOnlyProfile: MapFeatureProfile = {
      ...mapFeatureProfile,
      primaryFeatures: ["rail platform"],
      spatialRelationships: [],
      viewpointConstraints: [],
      excludedSourceOnlyClues: ["CCTV 7"]
    };

    const ranked = scoreAndRankCandidates(
      [
        candidate({
          id: "source-watermark-only",
          name: "Source watermark only",
          confidence: "high",
          matchScore: 96,
          matchedFeatures: ["CCTV 7"],
          matchingEvidence: ["CCTV 7 watermark appears in the image"],
          sources: [
            {
              title: "Video frame source",
              url: "https://example.test/cctv-frame",
              note: "Only confirms the broadcast watermark"
            }
          ]
        }),
        candidate({
          id: "physical-feature",
          name: "Physical feature",
          confidence: "low",
          matchScore: 45,
          matchedFeatures: ["rail platform"],
          matchingEvidence: ["Satellite imagery shows the rail platform"],
          sources: [
            {
              title: "Map source",
              url: "https://example.test/map-source",
              note: "Confirms the rail platform candidate"
            }
          ],
          earthVerificationChecklist: ["Compare platform alignment"]
        })
      ],
      { clues: sourceOnlyClues, mapFeatureProfile: sourceOnlyProfile, userScope: { country: "", region: "", facilityType: "" } }
    );

    expect(ranked[0].id).toBe("physical-feature");
    expect(ranked.find((item) => item.id === "source-watermark-only")?.uncertainty.join(" ")).toContain("来源词不能作为地物匹配");
  });

  it("does not reward public links that only confirm source overlays", () => {
    const [ranked] = scoreAndRankCandidates(
      [
        candidate({
          id: "source-overlay-link",
          name: "CCTV 7 video frame",
          confidence: "high",
          matchScore: 96,
          matchedFeatures: ["CCTV 7"],
          matchingEvidence: ["CCTV 7 watermark appears in the image"],
          sources: [
            {
              title: "CCTV 7 source frame",
              url: "https://example.test/cctv-7-frame",
              note: "Only confirms the CCTV 7 watermark"
            }
          ]
        })
      ],
      {
        clues: { ...clues, sceneFeatures: ["CCTV 7"], spatialRelationships: [] },
        mapFeatureProfile: {
          ...mapFeatureProfile,
          primaryFeatures: [],
          spatialRelationships: [],
          viewpointConstraints: [],
          excludedSourceOnlyClues: ["CCTV 7"]
        },
        userScope: { country: "", region: "", facilityType: "" }
      }
    );

    expect(ranked.matchingEvidence.join(" ")).not.toContain("public source link is attached");
    expect(ranked.uncertainty.join(" ")).toContain("来源词不能作为地物匹配");
    expect(ranked.uncertainty.join(" ")).toContain("来源不足");
  });

  it("does not reward source-only public links when physical evidence comes from candidate text", () => {
    const [ranked] = scoreAndRankCandidates(
      [
        candidate({
          id: "physical-feature-with-source-overlay-link",
          name: "Rail platform candidate",
          confidence: "high",
          matchScore: 96,
          matchedFeatures: ["rail platform"],
          matchingEvidence: ["Satellite imagery shows a rail platform"],
          sources: [
            {
              title: "CCTV 7 source frame",
              url: "https://example.test/cctv-7-frame",
              note: "Only confirms the CCTV 7 watermark"
            }
          ]
        })
      ],
      {
        clues: { ...clues, sceneFeatures: ["rail platform", "CCTV 7"], spatialRelationships: [] },
        mapFeatureProfile: {
          ...mapFeatureProfile,
          primaryFeatures: ["rail platform"],
          spatialRelationships: [],
          viewpointConstraints: [],
          excludedSourceOnlyClues: ["CCTV 7"]
        },
        userScope: { country: "", region: "", facilityType: "" }
      }
    );

    expect(ranked.matchingEvidence.join(" ")).not.toContain("public source link is attached");
    expect(ranked.uncertainty.join(" ")).toContain("来源不足");
  });

  it("does not score verification checklist items as evidence", () => {
    const [ranked] = scoreAndRankCandidates(
      [
        candidate({
          id: "checklist-only",
          name: "Needs map review",
          confidence: "low",
          matchScore: 30,
          matchingEvidence: ["Potential candidate requires manual review"],
          earthVerificationChecklist: ["Open Google Earth and compare rail orientation"]
        })
      ],
      {
        clues: { ...clues, sceneFeatures: [], spatialRelationships: [] },
        mapFeatureProfile: {
          ...mapFeatureProfile,
          primaryFeatures: [],
          spatialRelationships: [],
          viewpointConstraints: [],
          excludedSourceOnlyClues: []
        },
        userScope: { country: "", region: "", facilityType: "" }
      }
    );

    expect(ranked.matchingEvidence.join(" ")).not.toContain("Google Earth/Maps checklist is available");
    expect(ranked.uncertainty.join(" ")).toContain("来源不足");
  });

  it("does not reward negated map or satellite evidence text", () => {
    const [ranked] = scoreAndRankCandidates(
      [
        candidate({
          id: "negated-map-evidence",
          name: "Map mismatch candidate",
          confidence: "medium",
          matchScore: 50,
          matchingEvidence: ["No satellite imagery match found for the rail platform"],
          sources: [
            {
              title: "Rail platform source",
              url: "https://example.test/rail-platform",
              note: "Confirms a rail platform candidate"
            }
          ]
        })
      ],
      {
        clues: { ...clues, sceneFeatures: [], spatialRelationships: [] },
        mapFeatureProfile: {
          ...mapFeatureProfile,
          primaryFeatures: [],
          spatialRelationships: [],
          viewpointConstraints: [],
          excludedSourceOnlyClues: []
        },
        userScope: { country: "", region: "", facilityType: "" }
      }
    );

    expect(ranked.matchingEvidence.join(" ")).not.toContain("map or satellite evidence is explicitly described");
  });

  it("does not reward uncertain viewpoint notes as geometry evidence", () => {
    const [ranked] = scoreAndRankCandidates(
      [
        candidate({
          id: "uncertain-viewpoint",
          name: "Uncertain viewpoint candidate",
          confidence: "medium",
          matchScore: 50,
          matchingEvidence: ["Rail platform candidate"],
          viewpointNotes: ["Camera angle unknown"],
          sources: [
            {
              title: "Rail platform source",
              url: "https://example.test/rail-platform",
              note: "Confirms a rail platform candidate"
            }
          ]
        })
      ],
      {
        clues: { ...clues, sceneFeatures: [], spatialRelationships: [] },
        mapFeatureProfile: {
          ...mapFeatureProfile,
          primaryFeatures: [],
          spatialRelationships: [],
          viewpointConstraints: [],
          excludedSourceOnlyClues: []
        },
        userScope: { country: "", region: "", facilityType: "" }
      }
    );

    expect(ranked.matchingEvidence.join(" ")).not.toContain("viewpoint geometry is described");
  });

  it("does not treat facility type words as geographic scope alignment", () => {
    const [ranked] = scoreAndRankCandidates(
      [
        candidate({
          id: "facility-only-scope",
          name: "Possible rail station",
          confidence: "high",
          matchScore: 90,
          matchingEvidence: ["Rail station candidate with no country or region evidence"],
          sources: [
            {
              title: "Facility source",
              url: "https://example.test/facility",
              note: "Mentions a rail station candidate"
            }
          ]
        })
      ],
      {
        clues: { ...clues, sceneFeatures: [], spatialRelationships: [] },
        mapFeatureProfile: {
          ...mapFeatureProfile,
          primaryFeatures: [],
          spatialRelationships: [],
          viewpointConstraints: [],
          excludedSourceOnlyClues: []
        },
        userScope
      }
    );

    expect(ranked.matchingEvidence.join(" ")).not.toContain("candidate text aligns with user scope");
  });

  it("does not match short geographic scope terms inside unrelated words", () => {
    const [ranked] = scoreAndRankCandidates(
      [
        candidate({
          id: "scope-substring-only",
          name: "Campus rail platform",
          confidence: "high",
          matchScore: 90,
          matchingEvidence: ["Campus rail platform candidate"],
          sources: [
            {
              title: "Campus source",
              url: "https://example.test/campus",
              note: "Mentions a campus rail platform"
            }
          ]
        })
      ],
      {
        clues: { ...clues, sceneFeatures: [], spatialRelationships: [] },
        mapFeatureProfile: {
          ...mapFeatureProfile,
          primaryFeatures: [],
          spatialRelationships: [],
          viewpointConstraints: [],
          excludedSourceOnlyClues: []
        },
        userScope: { country: "US", region: "", facilityType: "" }
      }
    );

    expect(ranked.matchingEvidence.join(" ")).not.toContain("candidate text aligns with user scope");
  });

  it("does not treat generic feature words as full map-verifiable matches", () => {
    const ranked = scoreAndRankCandidates(
      [
        candidate({
          id: "generic-feature-words",
          name: "Generic feature words",
          confidence: "high",
          matchScore: 96,
          matchedFeatures: ["rail", "road"],
          matchingEvidence: ["Rail and road are visible near the possible site"],
          sources: [
            {
              title: "Generic source",
              url: "https://example.test/generic",
              note: "Mentions a rail-adjacent road"
            }
          ]
        }),
        candidate({
          id: "specific-map-evidence",
          name: "Specific map evidence",
          confidence: "low",
          matchScore: 45,
          matchedFeatures: ["rail platform", "blue roof"],
          matchingEvidence: ["Satellite map shows the rail platform and blue roof"],
          sources: [
            {
              title: "Specific source",
              url: "https://example.test/specific",
              note: "Confirms the candidate rail station"
            }
          ],
          earthVerificationChecklist: ["Compare platform alignment"]
        })
      ],
      { clues, mapFeatureProfile, userScope: { country: "", region: "", facilityType: "" } }
    );

    expect(ranked[0].id).toBe("specific-map-evidence");
    expect(ranked.find((item) => item.id === "generic-feature-words")?.matchingEvidence.join(" ")).not.toContain(
      "map-verifiable feature matches"
    );
  });

  it("penalizes terrain-only candidates when built facility clues are required", () => {
    const facilityClues: ExtractedClues = {
      ...clues,
      sceneFeatures: ["rail platform", "station building", "paved road"],
      spatialRelationships: ["station building east of the platform"]
    };
    const facilityProfile: MapFeatureProfile = {
      ...mapFeatureProfile,
      primaryFeatures: ["rail platform", "station building", "paved road"],
      spatialRelationships: ["station building east of the platform"],
      viewpointConstraints: []
    };

    const ranked = scoreAndRankCandidates(
      [
        candidate({
          id: "terrain-only",
          name: "Terrain-only hillside",
          confidence: "high",
          matchScore: 99,
          matchedFeatures: ["open farmland", "forest", "mountain slope"],
          matchingEvidence: [
            "Satellite imagery shows open farmland, forest, and a tree-covered mountain slope; no rail platform or station building is visible"
          ],
          sources: [
            {
              title: "Terrain source",
              url: "https://example.test/terrain",
              note: "Shows a field, forest, and mountain slope at the proposed coordinate"
            }
          ]
        }),
        candidate({
          id: "facility-supported",
          name: "Facility-supported station",
          confidence: "low",
          matchScore: 35,
          matchedFeatures: ["rail platform", "station building"],
          matchingEvidence: ["Satellite map shows a rail platform and station building beside a paved road"],
          sources: [
            {
              title: "Facility source",
              url: "https://example.test/facility",
              note: "Confirms the rail station candidate"
            }
          ]
        })
      ],
      { clues: facilityClues, mapFeatureProfile: facilityProfile, userScope: { country: "", region: "", facilityType: "rail station" } }
    );

    expect(ranked[0].id).toBe("facility-supported");
    const terrainOnly = ranked.find((item) => item.id === "terrain-only");
    expect(terrainOnly?.confidence).toBe("low");
    expect(terrainOnly?.uncertainty.join(" ")).toContain("地貌/设施错配");
  });

  it("penalizes non-EXIF candidates outside a custom coordinate box", () => {
    const scopedBox: UserScope = {
      ...userScope,
      regionScope: "custom",
      boundaryMode: "rectangle",
      coordinateBox: {
        minLat: 41.9,
        minLon: 111.9,
        maxLat: 42.3,
        maxLon: 112.4
      }
    };

    const ranked = scoreAndRankCandidates(
      [
        candidate({
          id: "outside-box",
          latitude: 43.1,
          longitude: 113.1,
          confidence: "high",
          matchScore: 92,
          matchedFeatures: ["rail platform", "blue roof", "utility poles", "open grassland"],
          matchingEvidence: ["Satellite map shows rail platform, blue roof, utility poles, and open grassland"],
          viewpointNotes: ["camera south of tracks looking north"],
          sources: [
            {
              title: "Outside source",
              url: "https://example.test/outside",
              note: "Mentions a similar rail station"
            }
          ],
          earthVerificationChecklist: ["Compare platform alignment", "Check blue roof building"]
        }),
        candidate({
          id: "inside-box",
          latitude: 42.1,
          longitude: 112.1,
          confidence: "medium",
          matchScore: 72,
          matchedFeatures: ["rail platform", "blue roof", "utility poles", "open grassland"],
          matchingEvidence: ["Satellite map shows rail platform, blue roof, utility poles, and open grassland"],
          viewpointNotes: ["camera south of tracks looking north"],
          sources: [
            {
              title: "Inside source",
              url: "https://example.test/inside",
              note: "Mentions the rail station candidate"
            }
          ],
          earthVerificationChecklist: ["Compare platform alignment", "Check blue roof building"]
        })
      ],
      { clues, mapFeatureProfile, userScope: scopedBox }
    );

    expect(ranked[0].id).toBe("inside-box");
    expect(ranked[1].uncertainty.join(" ")).toContain("自定义坐标范围");
  });

  it("compares custom GCJ-02 coordinate boxes against normalized WGS84 candidates", () => {
    const scopedGcjBox: UserScope = {
      country: "China",
      region: "Beijing",
      facilityType: "rail station",
      regionScope: "custom",
      boundaryMode: "rectangle",
      coordinateBox: {
        minLat: 39.91,
        minLon: 116.4034,
        maxLat: 39.9105,
        maxLon: 116.404
      }
    };

    const [ranked] = scoreAndRankCandidates(
      [
        candidate({
          id: "wgs-candidate-inside-gcj-box",
          latitude: 39.90882,
          longitude: 116.39747,
          confidence: "medium",
          matchScore: 72,
          matchedFeatures: ["rail platform", "blue roof"],
          matchingEvidence: ["Satellite map shows rail platform and blue roof in Beijing"],
          sources: [
            {
              title: "Beijing source",
              url: "https://example.test/beijing",
              note: "Mentions the candidate rail station"
            }
          ],
          earthVerificationChecklist: ["Compare platform alignment"]
        })
      ],
      { clues, mapFeatureProfile, userScope: scopedGcjBox, coordinateSystem: "GCJ-02" }
    );

    expect(ranked.id).toBe("wgs-candidate-inside-gcj-box");
    expect(ranked.uncertainty.join(" ")).not.toContain("自定义坐标范围");
  });

  it("penalizes non-EXIF candidates outside a custom polygon boundary", () => {
    const scopedPolygon: UserScope = {
      ...userScope,
      regionScope: "custom",
      boundaryMode: "polygon",
      polygonCoordinates: [
        "41.900000, 111.900000",
        "41.900000, 112.400000",
        "42.300000, 112.400000",
        "42.300000, 111.900000"
      ].join("\n")
    };

    const ranked = scoreAndRankCandidates(
      [
        candidate({
          id: "outside-polygon",
          latitude: 43.1,
          longitude: 113.1,
          confidence: "high",
          matchScore: 92,
          matchedFeatures: ["rail platform", "blue roof", "utility poles", "open grassland"],
          matchingEvidence: ["Satellite map shows rail platform, blue roof, utility poles, and open grassland"],
          viewpointNotes: ["camera south of tracks looking north"],
          sources: [
            {
              title: "Outside source",
              url: "https://example.test/outside-polygon",
              note: "Mentions a similar rail station"
            }
          ],
          earthVerificationChecklist: ["Compare platform alignment", "Check blue roof building"]
        }),
        candidate({
          id: "inside-polygon",
          latitude: 42.1,
          longitude: 112.1,
          confidence: "medium",
          matchScore: 72,
          matchedFeatures: ["rail platform", "blue roof", "utility poles", "open grassland"],
          matchingEvidence: ["Satellite map shows rail platform, blue roof, utility poles, and open grassland"],
          viewpointNotes: ["camera south of tracks looking north"],
          sources: [
            {
              title: "Inside source",
              url: "https://example.test/inside-polygon",
              note: "Mentions the rail station candidate"
            }
          ],
          earthVerificationChecklist: ["Compare platform alignment", "Check blue roof building"]
        })
      ],
      { clues, mapFeatureProfile, userScope: scopedPolygon }
    );

    expect(ranked[0].id).toBe("inside-polygon");
    expect(ranked[1].uncertainty.join(" ")).toContain("自定义多边形范围");
  });
});
