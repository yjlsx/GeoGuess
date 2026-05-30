import type { ExtractedClues } from "../../src/shared/types";
import type { VisionProvider } from "./types";

const emptyClues: ExtractedClues = {
  ocrText: [],
  visibleLabels: [],
  languages: [],
  sceneFeatures: [],
  spatialRelationships: [],
  inferredSearchTerms: []
};

export const manualVisionProvider: VisionProvider = {
  async extractClues(request) {
    return request.manualClues ?? emptyClues;
  }
};
