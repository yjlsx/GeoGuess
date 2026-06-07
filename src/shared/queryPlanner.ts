import { cleanClueText, hasMapVerifiableWord, isKnownMediaSource, isMediaOverlayOnly } from "./clueClassification";
import type { ExtractedClues, SearchQuery, UserScope } from "./types";

function compact(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim().replace(/\s+/g, " ")).filter((part): part is string => Boolean(part));
}

function pushUnique(queries: SearchQuery[], seen: Set<string>, item: SearchQuery) {
  const key = item.query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (!seen.has(key)) {
    seen.add(key);
    queries.push(item);
  }
}

function sourceTerms(scope: UserScope, clues: ExtractedClues) {
  return new Set(
    compact([scope.source, ...clues.visibleLabels])
      .map((item) => cleanClueText(item).replace(/\.[a-z]+$/i, "").toLocaleLowerCase())
      .filter(Boolean)
  );
}

function isSourceOnly(text: string, sources: Set<string>) {
  const normalized = cleanClueText(text).replace(/\.[a-z]+$/i, "").toLocaleLowerCase();
  return !normalized || sources.has(normalized) || isKnownMediaSource(text) || isMediaOverlayOnly(text);
}

function sourceLookupTerms(scope: UserScope, clues: ExtractedClues) {
  return [...new Set(compact([
    scope.source,
    ...clues.visibleLabels.filter((text) => !isMediaOverlayOnly(text)),
    ...clues.ocrText.filter(
      (text) => !isMediaOverlayOnly(text) && /cctv|央视|国防|军事|报道|新闻|20\d{2}|年度|训练|演习|拉开大幕/i.test(text)
    )
  ]))].slice(0, 10);
}

function quotedIfUseful(text: string) {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > 36) {
    return cleaned;
  }
  return /[一-龿]|\s/.test(cleaned) ? `"${cleaned}"` : cleaned;
}

function visualSignatureTerms(visualFeatures: string[], spatialFeatures: string[]) {
  return compact([...visualFeatures.slice(0, 5), ...spatialFeatures.slice(0, 3)]);
}

function physicalFeatureBundles(visualFeatures: string[], spatialFeatures: string[]) {
  const bundles: string[][] = [];
  const visual = visualFeatures.slice(0, 8);
  const spatial = spatialFeatures.slice(0, 5);

  if (visual.length >= 2) {
    bundles.push(visual.slice(0, 4));
    bundles.push(visual.slice(2, 6));
  }
  if (spatial.length > 0) {
    bundles.push([...visual.slice(0, 3), ...spatial.slice(0, 2)]);
  }
  if (visual.length >= 1) {
    bundles.push([visual[0], ...spatial.slice(0, 3)]);
  }

  return bundles.map((bundle) => compact(bundle)).filter((bundle) => bundle.length >= 2);
}

function mapImageryTerms(visualFeatures: string[]) {
  const terms = visualFeatures.filter(hasMapVerifiableWord);
  return terms.length > 0 ? terms.slice(0, 5) : visualFeatures.slice(0, 4);
}

function viewpointGeometryTerms(spatialFeatures: string[]) {
  const terms = spatialFeatures.filter((feature) =>
    /(camera|view|looking|facing|foreground|background|behind|beside|left|right|north|south|east|west|horizontal|parallel|perpendicular|视角|镜头|前景|背景|后方|旁边|左|右|朝|向|平行|垂直)/i.test(
      feature
    )
  );
  return terms.length > 0 ? terms.slice(0, 4) : spatialFeatures.slice(0, 3);
}

export function buildSearchQueries(scope: UserScope, clues: ExtractedClues): SearchQuery[] {
  const queries: SearchQuery[] = [];
  const seen = new Set<string>();
  const place = compact([scope.country, scope.region]).join(" ");
  const sources = sourceTerms(scope, clues);
  const facility =
    scope.facilityType ??
    clues.sceneFeatures.find((feature) => /station|rail|airport|runway|training|base|depot|warehouse|port|harbor|站|铁路|机场|跑道|训练|基地|仓库|港口|码头/i.test(feature)) ??
    (scope.source && !isKnownMediaSource(scope.source) ? scope.source : undefined);
  const facilityKey = facility?.trim().toLocaleLowerCase();
  const visualFeatures = clues.sceneFeatures
    .filter((feature) => !isSourceOnly(feature, sources))
    .filter((feature) => feature.trim().toLocaleLowerCase() !== facilityKey)
    .slice(0, 8);
  const spatialFeatures = clues.spatialRelationships.filter((feature) => !isSourceOnly(feature, sources)).slice(0, 6);
  const sourceTermsForLookup = sourceLookupTerms(scope, clues);
  const ocrHeadlineTerms = clues.ocrText.filter((item) => !isSourceOnly(item, sources)).slice(0, 5);
  const signatureTerms = visualSignatureTerms(visualFeatures, spatialFeatures);

  pushUnique(queries, seen, {
    query: compact([place, facility, ...signatureTerms]).join(" "),
    language: "en",
    purpose: "visual-feature-bundle"
  });

  const imageryTerms = mapImageryTerms(visualFeatures);
  if (imageryTerms.length >= 2) {
    pushUnique(queries, seen, {
      query: compact([place, facility, "satellite map", ...imageryTerms]).join(" "),
      language: "en",
      purpose: "map-imagery-verification"
    });
  }

  const geometryTerms = viewpointGeometryTerms(spatialFeatures);
  if (geometryTerms.length >= 1) {
    pushUnique(queries, seen, {
      query: compact([place, facility, "camera viewpoint", ...geometryTerms, ...visualFeatures.slice(0, 2)]).join(" "),
      language: geometryTerms.some((term) => /[一-龿]/.test(term)) ? "zh" : "en",
      purpose: "viewpoint-geometry"
    });
  }

  if (sourceTermsForLookup.length > 0 || ocrHeadlineTerms.length > 0) {
    pushUnique(queries, seen, {
      query: compact([...sourceTermsForLookup.map(quotedIfUseful), ...ocrHeadlineTerms.map(quotedIfUseful), scope.country, scope.region, scope.dateOrTimeHint]).join(" "),
      language: sourceTermsForLookup.concat(ocrHeadlineTerms).some((term) => /[一-龿]/.test(term)) ? "zh" : undefined,
      purpose: "source-traceback"
    });
  }

  if (sourceTermsForLookup.length > 0 && signatureTerms.length > 0) {
    pushUnique(queries, seen, {
      query: compact([scope.country, scope.region, sourceTermsForLookup[0], ...signatureTerms.slice(0, 4)]).join(" "),
      language: /[一-龿]/.test(sourceTermsForLookup[0]) ? "zh" : undefined,
      purpose: "source-visual-crosscheck"
    });
  }

  for (const bundle of physicalFeatureBundles(visualFeatures, spatialFeatures).slice(0, 4)) {
    pushUnique(queries, seen, {
      query: compact([place, facility, ...bundle]).join(" "),
      language: bundle.some((term) => /[一-龿]/.test(term)) ? "zh" : "en",
      purpose: "physical-feature-combination"
    });
  }

  for (const term of clues.inferredSearchTerms.filter((item) => !isSourceOnly(item, sources)).slice(0, 6)) {
    pushUnique(queries, seen, {
      query: compact([scope.country, scope.region, term, ...visualFeatures.slice(0, 3)]).join(" "),
      language: /[一-龿]/.test(term) ? "zh" : "en",
      purpose: "visual-inferred-term"
    });
  }

  for (const text of clues.ocrText.filter((item) => !isSourceOnly(item, sources)).slice(0, 4)) {
    pushUnique(queries, seen, {
      query: compact([quotedIfUseful(text), scope.country, facility, ...visualFeatures.slice(0, 2)]).join(" "),
      language: clues.languages.includes("Chinese") || /[一-龿]/.test(text) ? "zh" : undefined,
      purpose: "ocr-visual-context"
    });
  }

  return queries.filter((item) => item.query.length > 0).slice(0, 14);
}
