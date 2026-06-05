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
      .map((item) => item.replace(/\.[a-z]+$/i, "").trim().toLocaleLowerCase())
      .filter(Boolean)
  );
}

function isKnownMediaSource(text: string) {
  return /^(cctv|cctv\s*\d+|cctv\.com|央视|央视网|国防军事)$/i.test(text.trim());
}

function isSourceOnly(text: string, sources: Set<string>) {
  const normalized = text.replace(/\.[a-z]+$/i, "").trim().toLocaleLowerCase();
  return !normalized || sources.has(normalized) || isKnownMediaSource(text);
}

function sourceLookupTerms(scope: UserScope, clues: ExtractedClues) {
  return [...new Set(compact([
    scope.source,
    ...clues.visibleLabels,
    ...clues.ocrText.filter((text) => /cctv|央视|国防|军事|报道|新闻|20\d{2}|年度|训练|演习|拉开大幕/i.test(text))
  ]))].slice(0, 8);
}

export function buildSearchQueries(scope: UserScope, clues: ExtractedClues): SearchQuery[] {
  const queries: SearchQuery[] = [];
  const seen = new Set<string>();
  const place = compact([scope.country, scope.region]).join(" ");
  const sources = sourceTerms(scope, clues);
  const facility =
    scope.facilityType ??
    clues.sceneFeatures.find((feature) => feature.toLocaleLowerCase().includes("station")) ??
    (scope.source && !isKnownMediaSource(scope.source) ? scope.source : undefined);
  const facilityKey = facility?.trim().toLocaleLowerCase();
  const visualFeatures = clues.sceneFeatures
    .filter((feature) => !isSourceOnly(feature, sources))
    .filter((feature) => feature.trim().toLocaleLowerCase() !== facilityKey)
    .slice(0, 6);
  const spatialFeatures = clues.spatialRelationships.filter((feature) => !isSourceOnly(feature, sources)).slice(0, 4);
  const sourceTermsForLookup = sourceLookupTerms(scope, clues);
  const ocrHeadlineTerms = clues.ocrText.filter((item) => !isSourceOnly(item, sources)).slice(0, 4);

  pushUnique(queries, seen, {
    query: compact([place, facility, ...visualFeatures, ...spatialFeatures]).join(" "),
    language: "en",
    purpose: "visual-feature-bundle"
  });

  if (sourceTermsForLookup.length > 0 || ocrHeadlineTerms.length > 0) {
    pushUnique(queries, seen, {
      query: compact([...sourceTermsForLookup, ...ocrHeadlineTerms, scope.country, scope.region, scope.dateOrTimeHint]).join(" "),
      language: sourceTermsForLookup.concat(ocrHeadlineTerms).some((term) => /[一-龿]/.test(term)) ? "zh" : undefined,
      purpose: "source-traceback"
    });
  }

  for (const term of clues.inferredSearchTerms.filter((item) => !isSourceOnly(item, sources)).slice(0, 6)) {
    pushUnique(queries, seen, {
      query: compact([scope.country, scope.region, term, ...visualFeatures.slice(0, 3)]).join(" "),
      language: "en",
      purpose: "visual-inferred-term"
    });
  }

  for (const text of clues.ocrText.filter((item) => !isSourceOnly(item, sources)).slice(0, 3)) {
    pushUnique(queries, seen, {
      query: compact([text, scope.country, facility, ...visualFeatures.slice(0, 2)]).join(" "),
      language: clues.languages.includes("Chinese") ? "zh" : undefined,
      purpose: "ocr-visual-context"
    });
  }

  return queries.filter((item) => item.query.length > 0);
}
