import { buildGoogleEarthHint, buildGoogleMapsLink } from "../../src/shared/mapLinks";
import type { SearchProvider } from "./types";

export const mockSearchProvider: SearchProvider = {
  async findCandidates(args) {
    return [
      {
        id: "mock-candidate-1",
        name: "Mock railway candidate for offline MVP",
        latitude: 42.25967,
        longitude: 112.75623,
        confidence: "low",
        mapLinks: {
          googleMaps: buildGoogleMapsLink(42.25967, 112.75623),
          googleEarthHint: buildGoogleEarthHint(42.25967, 112.75623)
        },
        matchingEvidence: [
          "manual/mock candidate keeps the full report flow testable without external APIs",
          ...args.clues.spatialRelationships.slice(0, 2),
          ...args.clues.sceneFeatures.slice(0, 3).map((feature) => `visible feature: ${feature}`)
        ],
        uncertainty: ["mock provider is not an authoritative location search result"],
        sources: [
          {
            title: "Offline mock search provider",
            url: "local://mock-search",
            note: `Generated from ${args.queries.length} planned search queries`
          }
        ],
        earthVerificationChecklist: [
          "Confirm railway alignment and number of tracks",
          "Compare station building position relative to tracks",
          "Check roads, open ground, towers, and roof colors",
          "Use historical imagery to confirm whether features changed"
        ]
      }
    ];
  }
};
