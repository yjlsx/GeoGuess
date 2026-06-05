import type { ExtractedClues, MapFeatureProfile, UserScope } from "./types";

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function unique(items: string[]) {
  return [...new Set(items.map(clean).filter(Boolean))];
}

function mediaSourceLabel(value: string) {
  const text = clean(value);
  const lower = text.toLocaleLowerCase();

  const cctvNumber = lower.match(/\bcctv\s*[-]?\s*(\d+)\b/);
  if (cctvNumber) {
    return `CCTV ${cctvNumber[1]}`;
  }
  if (/\bcctv\.com\b/i.test(text)) {
    return "CCTV.com";
  }
  if (/^cctv$/i.test(text)) {
    return "CCTV";
  }
  if (text.includes("央视")) {
    return "央视";
  }
  if (text.includes("国防军事")) {
    return "国防军事";
  }

  return undefined;
}

function hasMapVerifiableWord(value: string) {
  return /(building|roof|wall|fence|flower|bed|pole|utility|platform|station|road|track|rail|yard|tower|field|ground|tree|water|river|mountain|shadow|building|屋顶|围墙|墙|花坛|电线杆|站台|道路|轨道|铁路|建筑|操场|塔|水体|河|山|阴影)/i.test(
    value
  );
}

function isSourceOnly(value: string) {
  const media = mediaSourceLabel(value);
  if (!media) {
    return false;
  }

  return !hasMapVerifiableWord(value);
}

function isViewpoint(value: string) {
  return /(camera|view|looking|foreground|background|north|south|east|west|angle|shadow|视角|镜头|前景|后方|北|南|东|西|阴影|朝向)/i.test(
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
      const label = mediaSourceLabel(item);
      return label ? [label] : [];
    })
  );
  const primaryFeatures = unique(clues.sceneFeatures.filter((feature) => !isSourceOnly(feature)).slice(0, 12));
  const spatialRelationships = unique(
    clues.spatialRelationships.filter((relationship) => !isSourceOnly(relationship)).slice(0, 10)
  );
  const viewpointConstraints = unique(spatialRelationships.filter(isViewpoint).slice(0, 6));
  const auxiliaryTextClues = unique(
    [...clues.ocrText, ...clues.visibleLabels]
      .filter((clue) => !isSourceOnly(clue))
      .filter((clue) => !mediaSourceLabel(clue))
      .slice(0, 8)
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
