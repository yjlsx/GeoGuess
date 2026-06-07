import { cleanClueText, isMediaOverlayOnly } from "./clueClassification";
import type { ExtractedClues } from "./types";

function cleanList(items: string[]) {
  return items.map(cleanClueText).filter(Boolean);
}

function unique(items: string[]) {
  return [...new Set(cleanList(items))];
}

export function sanitizeExtractedClues(clues: ExtractedClues): ExtractedClues {
  const sceneFeatures = unique(clues.sceneFeatures);
  const spatialRelationships = unique(clues.spatialRelationships);
  const inferredSearchTerms = unique(clues.inferredSearchTerms);
  const overlayArtifacts = unique(
    [...sceneFeatures, ...spatialRelationships, ...inferredSearchTerms].filter(isMediaOverlayOnly)
  );

  return {
    ocrText: unique(clues.ocrText),
    visibleLabels: unique([...clues.visibleLabels, ...overlayArtifacts]),
    languages: unique(clues.languages),
    sceneFeatures: sceneFeatures.filter((item) => !isMediaOverlayOnly(item)),
    spatialRelationships: spatialRelationships.filter((item) => !isMediaOverlayOnly(item)),
    inferredSearchTerms: inferredSearchTerms.filter((item) => !isMediaOverlayOnly(item))
  };
}
