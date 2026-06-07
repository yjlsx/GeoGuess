import { cleanClueText, isSourceOnlyClue, sourceOnlyLabel } from "./clueClassification";
import type { ExtractedClues, MapFeatureProfile, UserScope } from "./types";

function clean(value: string) {
  return cleanClueText(value);
}

function unique(items: string[]) {
  return [...new Set(items.map(clean).filter(Boolean))];
}

function isViewpoint(value: string) {
  return /(camera|view|looking|facing|foreground|background|angle|viewpoint|视角|镜头|前景|背景|朝向|拍摄方向)/i.test(
    value
  );
}

function buildInstruction(profile: Omit<MapFeatureProfile, "searchInstruction">) {
  const parts = [
    profile.primaryFeatures.length ? `Primary map checks: ${profile.primaryFeatures.join("; ")}` : "",
    profile.spatialRelationships.length ? `Spatial checks: ${profile.spatialRelationships.join("; ")}` : "",
    profile.viewpointConstraints.length ? `Viewpoint checks: ${profile.viewpointConstraints.join("; ")}` : "",
    profile.auxiliaryTextClues.length ? `Auxiliary text only: ${profile.auxiliaryTextClues.join("; ")}` : ""
  ].filter(Boolean);

  return parts.join(". ");
}

export function buildMapFeatureProfile(scope: UserScope, clues: ExtractedClues): MapFeatureProfile {
  const sourceOnly = unique(
    [
      scope.source,
      ...clues.visibleLabels,
      ...clues.ocrText,
      ...clues.sceneFeatures,
      ...clues.spatialRelationships
    ].flatMap((item) => {
      if (!item) {
        return [];
      }
      const label = sourceOnlyLabel(item);
      return label ? [label] : [];
    })
  );
  const primaryFeatures = unique(clues.sceneFeatures.filter((feature) => !isSourceOnlyClue(feature)).slice(0, 14));
  const spatialRelationships = unique(
    clues.spatialRelationships.filter((relationship) => !isSourceOnlyClue(relationship)).slice(0, 12)
  );
  const viewpointConstraints = unique(spatialRelationships.filter(isViewpoint).slice(0, 8));
  const auxiliaryTextClues = unique(
    [...clues.ocrText, ...clues.visibleLabels]
      .filter((clue) => !isSourceOnlyClue(clue))
      .filter((clue) => !sourceOnlyLabel(clue))
      .slice(0, 10)
  );

  const profile = {
    primaryFeatures,
    spatialRelationships,
    viewpointConstraints,
    auxiliaryTextClues,
    excludedSourceOnlyClues: sourceOnly
  };

  return {
    ...profile,
    searchInstruction: buildInstruction(profile)
  };
}
