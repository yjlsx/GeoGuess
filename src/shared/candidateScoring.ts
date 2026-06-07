import { normalizeCoordinateToWgs84 } from "./coordinateSystems";
import { hasMapVerifiableWord } from "./clueClassification";
import type { Candidate, ExtractedClues, MapFeatureProfile, UserScope, VisionModelConfig } from "./types";

type ScoreArgs = {
  clues: ExtractedClues;
  mapFeatureProfile: MapFeatureProfile;
  userScope: UserScope;
  coordinateSystem?: NonNullable<VisionModelConfig["coordinateSystem"]>;
};

type ScoreBreakdown = {
  finalScore: number;
  positives: string[];
  penalties: string[];
};

type BoundaryScopeStatus = {
  status: "inside" | "outside";
  positive: string;
  penalty: string;
};

type PolygonPoint = {
  lat: number;
  lon: number;
};

function normalizedText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function includesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesAnyTerm(text: string, terms: string[]) {
  const normalized = normalizedText(text);
  return terms.some((term) => {
    const normalizedTerm = normalizedText(term);
    if (!normalizedTerm) {
      return false;
    }
    if (/^[a-z0-9\s-]+$/.test(normalizedTerm)) {
      return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalizedTerm)}(?:$|[^a-z0-9])`, "i").test(normalized);
    }
    return normalized.includes(normalizedTerm);
  });
}

function hasLocationRelevantHttpSource(candidate: Candidate, sourceOnly: string[]) {
  return candidate.sources.some((source) => {
    if (!/^https?:\/\//i.test(source.url)) {
      return false;
    }
    const sourceText = `${source.title} ${source.note}`;
    return hasMapVerifiableWord(sourceText) && !isSourceOnlyTerm(sourceText, sourceOnly);
  });
}

function sourceOnlyTerms(args: ScoreArgs) {
  return args.mapFeatureProfile.excludedSourceOnlyClues.map(normalizedText).filter(Boolean);
}

function isSourceOnlyTerm(value: string, terms: string[]) {
  const text = normalizedText(value);
  return terms.some((term) => text === term || text.includes(term) || term.includes(text));
}

function candidateContainsSourceOnlyTerm(candidate: Candidate, terms: string[]) {
  if (terms.length === 0) {
    return false;
  }

  const text = [
    candidate.name ?? "",
    ...(candidate.matchedFeatures ?? []),
    ...candidate.matchingEvidence,
    ...(candidate.viewpointNotes ?? []),
    ...candidate.sources.map((source) => `${source.title} ${source.note}`)
  ].join(" ");

  return terms.some((term) => normalizedText(text).includes(term));
}

function isExifCandidate(candidate: Candidate) {
  const text = [
    candidate.id,
    candidate.name ?? "",
    ...(candidate.matchedFeatures ?? []),
    ...candidate.matchingEvidence,
    ...candidate.sources.map((source) => `${source.title} ${source.note}`)
  ].join(" ");

  return /exif|gps metadata|original media metadata|原始媒体|元数据/i.test(text);
}

function textTokens(value: string) {
  return value.split(/\s+/).filter(Boolean);
}

function isSpecificPartialMatch(candidateItem: string, expectedItem: string) {
  if (!expectedItem.includes(candidateItem)) {
    return false;
  }

  const candidateTokens = textTokens(candidateItem);
  const expectedTokens = textTokens(expectedItem);
  if (candidateTokens.length > 1 && expectedTokens.length > 1) {
    return candidateTokens.length >= Math.ceil(expectedTokens.length * 0.6);
  }

  return candidateItem.length >= Math.max(8, Math.ceil(expectedItem.length * 0.6));
}

function candidateFeatureMatchesExpected(candidateItem: string, expectedItem: string) {
  return candidateItem.includes(expectedItem) || isSpecificPartialMatch(candidateItem, expectedItem);
}

function describesNegatedFeatureEvidence(value: string) {
  return /(?:\bno\b|\bwithout\b|\babsent\b).*(?:platform|station|building|roof|road|street|track|rail|wall|gate|fence|compound|facility)|(?:platform|station|building|roof|road|street|track|rail|wall|gate|fence|compound|facility)[\w\s-]*(?:missing|not found|not visible|absent|unclear|unverified|mismatch)|没有.*(?:站台|车站|建筑|楼|房|屋顶|道路|轨道|铁路|围墙|大门|院落|设施)|(?:站台|车站|建筑|楼|房|屋顶|道路|轨道|铁路|围墙|大门|院落|设施).*(?:缺失|未找到|不可见|不匹配|不清楚|待核验)/i.test(
    value
  );
}

function describesPositiveMapEvidence(value: string) {
  if (/no\s+(?:public\s+)?(?:map|satellite|earth|imagery)|(?:map|satellite|earth|imagery)[\w\s-]*(?:missing|not found|not visible|unclear|unverified|mismatch)|没有.*(?:地图|卫星|影像|地球)|(?:地图|卫星|影像|地球).*(?:缺失|未找到|不匹配|不清楚|待核验)/i.test(value)) {
    return false;
  }
  return /map|satellite|earth|imagery|地图|卫星|影像|地球/i.test(value);
}

function describesPositiveViewpointGeometry(value: string) {
  if (/\b(?:unknown|unclear|unverified|needs?|check|opposite|mismatch)\b|不明|不清楚|待核验|相反|不匹配/i.test(value)) {
    return false;
  }
  return /\b(?:looking|facing|north|south|east|west|northeast|northwest|southeast|southwest)\b|朝|向|视角|镜头/i.test(value);
}

function countFeatureMatches(candidate: Candidate, args: ScoreArgs) {
  const sourceOnly = sourceOnlyTerms(args);
  const expected = [
    ...args.mapFeatureProfile.primaryFeatures,
    ...args.mapFeatureProfile.spatialRelationships,
    ...args.mapFeatureProfile.viewpointConstraints,
    ...args.clues.sceneFeatures,
    ...args.clues.spatialRelationships
  ].filter((item) => !isSourceOnlyTerm(item, sourceOnly)).map(normalizedText);
  const candidateText = [
    ...(candidate.matchedFeatures ?? []),
    ...candidate.matchingEvidence,
    ...(candidate.viewpointNotes ?? [])
  ].filter((item) => !describesNegatedFeatureEvidence(item)).map(normalizedText);
  const matched = new Set<string>();

  for (const expectedItem of expected) {
    if (!expectedItem) {
      continue;
    }
    if (candidateText.some((item) => candidateFeatureMatchesExpected(item, expectedItem))) {
      matched.add(expectedItem);
    }
  }

  return matched.size;
}

function expectedEvidenceText(args: ScoreArgs) {
  return [
    args.userScope.facilityType ?? "",
    ...args.mapFeatureProfile.primaryFeatures,
    ...args.mapFeatureProfile.spatialRelationships,
    ...args.mapFeatureProfile.viewpointConstraints,
    ...args.clues.sceneFeatures,
    ...args.clues.spatialRelationships
  ].join(" ");
}

function candidatePositivePhysicalText(candidate: Candidate) {
  return [
    ...(candidate.matchedFeatures ?? []),
    ...candidate.matchingEvidence.filter((item) => !describesNegatedFeatureEvidence(item)),
    ...(candidate.featureMatches ?? [])
      .filter((match) => match.status === "matched" || match.status === "partial")
      .flatMap((match) => [match.imageFeature, match.mapFeature, match.verification])
  ].join(" ");
}

function candidateFullPhysicalText(candidate: Candidate) {
  return [
    candidate.name ?? "",
    ...(candidate.matchedFeatures ?? []),
    ...candidate.matchingEvidence,
    ...(candidate.missingOrUnverifiedFeatures ?? []),
    ...candidate.uncertainty,
    ...(candidate.viewpointNotes ?? []),
    ...candidate.mapPreview.notes,
    ...(candidate.featureMatches ?? [])
      .flatMap((match) => [match.imageFeature, match.mapFeature, match.verification, match.imageAnnotation ?? "", match.mapAnnotation ?? ""]),
    ...candidate.sources.map((source) => `${source.title} ${source.note}`)
  ].join(" ");
}

function hasBuiltFacilityRequirement(args: ScoreArgs) {
  return /(?:\bstations?\b|\bplatforms?\b|\bbuildings?\b|\broofs?\b|\broads?\b|\bstreets?\b|\btracks?\b|\brails?\b|\brailways?\b|\bwalls?\b|\bfences?\b|\bgates?\b|\bcompounds?\b|\bfacilit(?:y|ies)\b|\bdepots?\b|\btowers?\b|\bbridges?\b|\bintersections?\b|\brunways?\b|\bhangars?\b|\bwarehouses?\b|\bparking\b|\bcourtyards?\b|\bstadiums?\b)|(?:车站|站台|建筑|楼房|楼|房屋|屋顶|道路|公路|路口|轨道|铁路|围墙|墙体|围栏|大门|门岗|院落|设施|营区|基地|仓库|厂房|塔|桥|机场|跑道|机库|停车场|操场|训练场|港口|码头)/i.test(
    expectedEvidenceText(args)
  );
}

function hasTerrainOnlyMismatch(candidate: Candidate, args: ScoreArgs) {
  if (!hasBuiltFacilityRequirement(args)) {
    return false;
  }

  const positiveText = candidatePositivePhysicalText(candidate);
  const fullText = candidateFullPhysicalText(candidate);
  const hasPositiveBuiltEvidence =
    /(?:\bstations?\b|\bplatforms?\b|\bbuildings?\b|\broofs?\b|\broads?\b|\bstreets?\b|\btracks?\b|\brails?\b|\brailways?\b|\bwalls?\b|\bfences?\b|\bgates?\b|\bcompounds?\b|\bfacilit(?:y|ies)\b|\bdepots?\b|\btowers?\b|\bbridges?\b|\bintersections?\b|\brunways?\b|\bhangars?\b|\bwarehouses?\b|\bparking\b|\bcourtyards?\b|\bstadiums?\b)|(?:车站|站台|建筑|楼房|楼|房屋|屋顶|道路|公路|路口|轨道|铁路|围墙|墙体|围栏|大门|门岗|院落|设施|营区|基地|仓库|厂房|塔|桥|机场|跑道|机库|停车场|操场|训练场|港口|码头)/i.test(
      positiveText
    );
  if (hasPositiveBuiltEvidence) {
    return false;
  }

  const hasTerrainEvidence =
    /(?:\bfields?\b|\bfarmland\b|\bcropland\b|\bagricultural\b|\bforests?\b|\bwoods?\b|\bwoodland\b|\btrees?\b|\bmountains?\b|\bhillsides?\b|\bslopes?\b|\bridges?\b|\bvalleys?\b|\bgrasslands?\b|\bopen land\b)|(?:田地|农田|耕地|树林|森林|树木|山林|山上|山坡|山体|山脊|山谷|草地|草原|荒地)/i.test(
      fullText
    );
  return hasTerrainEvidence || describesNegatedFeatureEvidence(fullText);
}

function parsePolygonCoordinates(value: string | undefined): PolygonPoint[] {
  if (!value) {
    return [];
  }

  const points: PolygonPoint[] = [];
  const pairPattern = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = pairPattern.exec(value))) {
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      points.push({ lat, lon });
    }
  }

  return points;
}

function normalizeScopePoint(point: PolygonPoint, args: ScoreArgs): PolygonPoint {
  const normalized = normalizeCoordinateToWgs84(
    { latitude: point.lat, longitude: point.lon },
    args.coordinateSystem ?? "WGS84 (EPSG:4326)"
  );
  return {
    lat: normalized.latitude,
    lon: normalized.longitude
  };
}

function normalizeScopePolygon(points: PolygonPoint[], args: ScoreArgs) {
  return points.map((point) => normalizeScopePoint(point, args));
}

function pointOnSegment(point: PolygonPoint, start: PolygonPoint, end: PolygonPoint) {
  const cross = (point.lon - start.lon) * (end.lat - start.lat) - (point.lat - start.lat) * (end.lon - start.lon);
  if (Math.abs(cross) > 1e-9) {
    return false;
  }

  return (
    point.lon >= Math.min(start.lon, end.lon) - 1e-9 &&
    point.lon <= Math.max(start.lon, end.lon) + 1e-9 &&
    point.lat >= Math.min(start.lat, end.lat) - 1e-9 &&
    point.lat <= Math.max(start.lat, end.lat) + 1e-9
  );
}

function pointInPolygon(point: PolygonPoint, polygon: PolygonPoint[]) {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (pointOnSegment(point, previousPoint, currentPoint)) {
      return true;
    }

    const intersects =
      currentPoint.lat > point.lat !== previousPoint.lat > point.lat &&
      point.lon <
        ((previousPoint.lon - currentPoint.lon) * (point.lat - currentPoint.lat)) / (previousPoint.lat - currentPoint.lat) +
          currentPoint.lon;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function customBoundaryScopeStatus(candidate: Candidate, args: ScoreArgs): BoundaryScopeStatus | undefined {
  const scope = args.userScope;
  if (scope.regionScope !== "custom") {
    return undefined;
  }

  if (scope.boundaryMode === "polygon") {
    const polygon = normalizeScopePolygon(parsePolygonCoordinates(scope.polygonCoordinates), args);
    if (polygon.length < 3) {
      return undefined;
    }

    return {
      status: pointInPolygon({ lat: candidate.latitude, lon: candidate.longitude }, polygon) ? "inside" : "outside",
      positive: "candidate is inside custom polygon boundary",
      penalty: "超出用户自定义多边形范围"
    };
  }

  if (!scope.coordinateBox) {
    return undefined;
  }

  const box = scope.coordinateBox;
  const corners = normalizeScopePolygon(
    [
      { lat: box.minLat, lon: box.minLon },
      { lat: box.minLat, lon: box.maxLon },
      { lat: box.maxLat, lon: box.maxLon },
      { lat: box.maxLat, lon: box.minLon }
    ],
    args
  );
  const minLat = Math.min(...corners.map((corner) => corner.lat));
  const maxLat = Math.max(...corners.map((corner) => corner.lat));
  const minLon = Math.min(...corners.map((corner) => corner.lon));
  const maxLon = Math.max(...corners.map((corner) => corner.lon));
  const inside =
    candidate.latitude >= minLat &&
    candidate.latitude <= maxLat &&
    candidate.longitude >= minLon &&
    candidate.longitude <= maxLon;

  return {
    status: inside ? "inside" : "outside",
    positive: "candidate is inside custom coordinate box",
    penalty: "超出用户自定义坐标范围"
  };
}

function scoreCandidate(candidate: Candidate, args: ScoreArgs): ScoreBreakdown {
  if (isExifCandidate(candidate)) {
    return {
      finalScore: 100,
      positives: ["EXIF GPS metadata is a direct coordinate signal"],
      penalties: []
    };
  }

  const positives: string[] = [];
  const penalties: string[] = [];
  const modelScore = candidate.matchScore ?? 0;
  const featureMatches = countFeatureMatches(candidate, args);
  const sourceOnly = sourceOnlyTerms(args);
  const sourceOnlyWithoutPhysicalEvidence = featureMatches === 0 && candidateContainsSourceOnlyTerm(candidate, sourceOnly);
  const sourceSupported = hasLocationRelevantHttpSource(candidate, sourceOnly) && !sourceOnlyWithoutPhysicalEvidence;
  const terrainOnlyMismatch = hasTerrainOnlyMismatch(candidate, args);
  const viewpointText = (candidate.viewpointNotes ?? []).join(" ");
  const missingText = [
    ...(candidate.missingOrUnverifiedFeatures ?? []),
    ...candidate.uncertainty
  ].join(" ");
  let score = Math.min(25, modelScore * 0.25);

  if (candidate.confidence === "high") {
    score += 8;
    positives.push("model confidence is high");
  } else if (candidate.confidence === "medium") {
    score += 5;
    positives.push("model confidence is medium");
  }

  if (featureMatches > 0) {
    const featureScore = Math.min(34, featureMatches * 8);
    score += featureScore;
    positives.push(`${featureMatches} map-verifiable feature matches`);
  }

  if (sourceOnlyWithoutPhysicalEvidence) {
    score -= 14;
    penalties.push("来源词不能作为地物匹配");
  }

  if (sourceSupported) {
    score += 16;
    positives.push("public source link is attached");
  } else {
    score -= 12;
    penalties.push("来源不足：没有可追溯公开链接");
  }

  if (candidate.matchingEvidence.some(describesPositiveMapEvidence)) {
    score += 8;
    positives.push("map or satellite evidence is explicitly described");
  }

  if (terrainOnlyMismatch) {
    score -= 42;
    penalties.push("地貌/设施错配：候选点像田地、森林或山坡，缺少目标设施地物");
  }

  if (args.userScope.country || args.userScope.region) {
    const scopeTerms = [args.userScope.country, args.userScope.region].flatMap((term) => (term ? [term] : []));
    const candidateScopeText = [candidate.name, ...candidate.matchingEvidence, ...candidate.sources.map((source) => `${source.title} ${source.note}`)]
      .filter(Boolean)
      .join(" ");
    if (includesAnyTerm(candidateScopeText, scopeTerms)) {
      score += 5;
      positives.push("candidate text aligns with user scope");
    }
  }

  const boundaryScopeStatus = customBoundaryScopeStatus(candidate, args);
  if (boundaryScopeStatus?.status === "inside") {
    score += 6;
    positives.push(boundaryScopeStatus.positive);
  } else if (boundaryScopeStatus?.status === "outside") {
    score -= 28;
    penalties.push(boundaryScopeStatus.penalty);
  }

  if ((candidate.viewpointNotes ?? []).some(describesPositiveViewpointGeometry)) {
    score += 10;
    positives.push("viewpoint geometry is described");
  }

  const missingCount = (candidate.missingOrUnverifiedFeatures ?? []).length;
  if (missingCount > 0) {
    const penalty = Math.min(18, missingCount * 5);
    score -= penalty;
    penalties.push(`${missingCount} unresolved or missing feature checks`);
  }

  if (includesAny(missingText, [/opposite|相反|不匹配|缺失|missing|not found|source not found|no public source/i])) {
    score -= 16;
    penalties.push("存在明确矛盾或未找到来源");
  }

  return {
    finalScore: Math.max(0, Math.min(100, Math.round(score))),
    positives,
    penalties
  };
}

function confidenceFromScore(score: number): Candidate["confidence"] {
  if (score >= 78) {
    return "high";
  }
  if (score >= 52) {
    return "medium";
  }
  return "low";
}

function confidenceRank(confidence: Candidate["confidence"]) {
  if (confidence === "high") {
    return 3;
  }
  if (confidence === "medium") {
    return 2;
  }
  return 1;
}

function scoringSummary(breakdown: ScoreBreakdown) {
  const positiveText = breakdown.positives.slice(0, 3).join("；") || "证据较少";
  const penaltyText = breakdown.penalties.length ? `；扣分：${breakdown.penalties.slice(0, 2).join("；")}` : "";
  return `本地证据评分 ${breakdown.finalScore}/100：${positiveText}${penaltyText}`;
}

function withoutPreviousLocalScore(candidate: Candidate): Candidate {
  return {
    ...candidate,
    matchingEvidence: candidate.matchingEvidence.filter((item) => !/^本地证据评分\s+\d+\/100：/.test(item)),
    uncertainty: candidate.uncertainty.filter((item) => !/^本地证据评分扣分项：/.test(item))
  };
}

export function scoreAndRankCandidates(candidates: Candidate[], args: ScoreArgs): Candidate[] {
  return candidates
    .map((candidate) => {
      const cleanCandidate = withoutPreviousLocalScore(candidate);
      const breakdown = scoreCandidate(cleanCandidate, args);
      if (isExifCandidate(cleanCandidate)) {
        return {
          ...cleanCandidate,
          confidence: "high" as const,
          matchScore: 100
        };
      }

      return {
        ...cleanCandidate,
        confidence: confidenceFromScore(breakdown.finalScore),
        matchScore: breakdown.finalScore,
        matchingEvidence: [...cleanCandidate.matchingEvidence, scoringSummary(breakdown)],
        uncertainty: breakdown.penalties.length
          ? [...cleanCandidate.uncertainty, `本地证据评分扣分项：${breakdown.penalties.join("；")}`]
          : cleanCandidate.uncertainty
      };
    })
    .sort((left, right) => {
      const scoreDelta = (right.matchScore ?? 0) - (left.matchScore ?? 0);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      const featureDelta = (right.matchedFeatures?.length ?? 0) - (left.matchedFeatures?.length ?? 0);
      if (featureDelta !== 0) {
        return featureDelta;
      }

      return confidenceRank(right.confidence) - confidenceRank(left.confidence);
    });
}
