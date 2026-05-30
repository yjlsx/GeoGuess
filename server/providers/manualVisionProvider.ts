import type { ExtractedClues } from "../../src/shared/types";
import type { VisionProvider } from "./types";

function cloneClues(clues?: ExtractedClues): ExtractedClues {
  return {
    ocrText: [...(clues?.ocrText ?? [])],
    visibleLabels: [...(clues?.visibleLabels ?? [])],
    languages: [...(clues?.languages ?? [])],
    sceneFeatures: [...(clues?.sceneFeatures ?? [])],
    spatialRelationships: [...(clues?.spatialRelationships ?? [])],
    inferredSearchTerms: [...(clues?.inferredSearchTerms ?? [])]
  };
}

export const manualVisionProvider: VisionProvider = {
  async extractClues(request) {
    return cloneClues(request.manualClues);
  }
};
