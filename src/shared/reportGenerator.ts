import { formatCoordinate } from "./mapLinks";
import type { ReportInput } from "./sampleInvestigation";

function confidenceLabel(confidence: string) {
  return `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence`;
}

function list(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

export function buildReports(input: ReportInput) {
  const summaryMarkdown = input.candidates
    .map((candidate, index) => {
      return [
        `### Candidate ${index + 1}: ${confidenceLabel(candidate.confidence)}`,
        `${formatCoordinate(candidate.latitude, candidate.longitude)}`,
        candidate.mapLinks.googleMaps,
        "",
        "Key evidence:",
        list(candidate.matchingEvidence.slice(0, 3)),
        "",
        "Main uncertainty:",
        list(candidate.uncertainty.slice(0, 2))
      ].join("\n");
    })
    .join("\n\n");

  const fullMarkdown = [
    "# Image Geolocation Report",
    "",
    "## User Scope",
    list(Object.entries(input.userScope).map(([key, value]) => `${key}: ${value}`)),
    "",
    "## Extracted Clues",
    "OCR:",
    list(input.extractedClues.ocrText),
    "Scene features:",
    list(input.extractedClues.sceneFeatures),
    "Spatial relationships:",
    list(input.extractedClues.spatialRelationships),
    "",
    "## Search Queries",
    list(input.searchQueries.map((query) => `${query.query} (${query.purpose})`)),
    "",
    "## Candidates",
    ...input.candidates.map((candidate, index) =>
      [
        `### Candidate ${index + 1}: ${candidate.name ?? "Unnamed location"}`,
        `Coordinates: ${formatCoordinate(candidate.latitude, candidate.longitude)}`,
        `Confidence: ${confidenceLabel(candidate.confidence)}`,
        `Maps: ${candidate.mapLinks.googleMaps}`,
        candidate.mapLinks.googleEarthHint ?? "",
        "",
        "Matching evidence:",
        list(candidate.matchingEvidence),
        "Uncertainty:",
        list(candidate.uncertainty),
        "Sources:",
        list(candidate.sources.map((source) => `${source.title} - ${source.url} - ${source.note}`)),
        "Google Earth verification checklist:",
        list(candidate.earthVerificationChecklist)
      ].join("\n")
    )
  ].join("\n");

  return {
    summaryMarkdown,
    fullMarkdown,
    createdAt: new Date().toISOString()
  };
}
