import { buildGoogleEarthHint, buildGoogleMapsLink } from "./mapLinks";
import type { ReportInput } from "./types";

export const sampleInvestigationInput: ReportInput = {
  userScope: {
    country: "Mongolia",
    region: "Dornogovi",
    facilityType: "railway station",
    source: "CCTV 7",
    notes: "China Mongolia joint training"
  },
  extractedClues: {
    ocrText: ["中蒙 草原伙伴 2026 陆军联合训练"],
    visibleLabels: ["CCTV 7"],
    languages: ["Chinese"],
    sceneFeatures: ["railway", "station building", "grassland", "communication tower"],
    spatialRelationships: ["railway runs horizontally in foreground", "station building behind tracks"],
    inferredSearchTerms: ["China Mongolia joint training railway station"]
  },
  searchQueries: [
    {
      query: "Mongolia Dornogovi railway station CCTV 7 China Mongolia joint training",
      language: "en",
      purpose: "scope-source-facility"
    }
  ],
  candidates: [
    {
      id: "candidate-1",
      name: "Railway station near training area",
      latitude: 42.25967,
      longitude: 112.75623,
      confidence: "high",
      mapLinks: {
        googleMaps: buildGoogleMapsLink(42.25967, 112.75623),
        googleEarthHint: buildGoogleEarthHint(42.25967, 112.75623)
      },
      matchingEvidence: [
        "railway runs horizontally in the image and at the candidate site",
        "station building appears behind the tracks",
        "open grassland/desert surroundings match the screenshot"
      ],
      uncertainty: ["satellite imagery date may differ from the video date"],
      sources: [
        {
          title: "User-provided image context",
          url: "local://uploaded-image",
          note: "Manual/sample evidence for offline MVP"
        }
      ],
      earthVerificationChecklist: [
        "Confirm railway alignment and number of visible tracks",
        "Check whether station buildings sit north of the tracks",
        "Compare tower and road positions with the screenshot",
        "Use historical imagery to check construction changes"
      ]
    }
  ]
};
