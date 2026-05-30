import type { ExtractedClues, SearchQuery, UserScope } from "./types";

function compact(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
}

function pushUnique(queries: SearchQuery[], seen: Set<string>, item: SearchQuery) {
  const key = `${item.language ?? ""}:${item.query}`;
  if (!seen.has(key)) {
    seen.add(key);
    queries.push(item);
  }
}

export function buildSearchQueries(scope: UserScope, clues: ExtractedClues): SearchQuery[] {
  const queries: SearchQuery[] = [];
  const seen = new Set<string>();
  const place = compact([scope.country, scope.region]).join(" ");
  const facility = scope.facilityType ?? clues.sceneFeatures.find((feature) => feature.includes("station"));

  pushUnique(queries, seen, {
    query: compact([place, facility, scope.source, scope.notes]).join(" "),
    language: "en",
    purpose: "scope-source-facility"
  });

  for (const text of clues.ocrText.slice(0, 3)) {
    pushUnique(queries, seen, {
      query: compact([text, scope.country, facility]).join(" "),
      language: clues.languages.includes("Chinese") ? "zh" : undefined,
      purpose: "ocr-scope"
    });
  }

  for (const term of clues.inferredSearchTerms.slice(0, 6)) {
    pushUnique(queries, seen, {
      query: compact([scope.country, scope.region, term]).join(" "),
      language: "en",
      purpose: "inferred-term"
    });
  }

  return queries.filter((item) => item.query.length > 0);
}
