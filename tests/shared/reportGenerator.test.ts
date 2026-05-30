import { describe, expect, it } from "vitest";
import { sampleInvestigationInput } from "../../src/shared/sampleInvestigation";
import { buildReports } from "../../src/shared/reportGenerator";

describe("buildReports", () => {
  it("creates a concise report with coordinates and uncertainty", () => {
    const report = buildReports(sampleInvestigationInput);
    expect(report.summaryMarkdown).toContain("42.25967, 112.75623");
    expect(report.summaryMarkdown).toContain("High confidence");
    expect(report.summaryMarkdown).toContain("satellite imagery date may differ");
  });

  it("creates a full report with queries, sources, and Google Earth checklist", () => {
    const report = buildReports(sampleInvestigationInput);
    expect(report.fullMarkdown).toContain("## Extracted Clues");
    expect(report.fullMarkdown).toContain("railway runs horizontally");
    expect(report.fullMarkdown).toContain("Copy into Google Earth search");
  });

  it("formats scope coordinate boxes and empty lists readably", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      userScope: {
        ...sampleInvestigationInput.userScope,
        coordinateBox: {
          minLat: 42,
          minLon: 112,
          maxLat: 43,
          maxLon: 113
        },
        dateOrTimeHint: ""
      },
      extractedClues: {
        ...sampleInvestigationInput.extractedClues,
        ocrText: []
      }
    });

    expect(report.fullMarkdown).toContain("coordinateBox: 42.00000, 112.00000 to 43.00000, 113.00000");
    expect(report.fullMarkdown).not.toContain("[object Object]");
    expect(report.fullMarkdown).not.toContain("dateOrTimeHint:");
    expect(report.fullMarkdown).toContain("- None provided");
  });
});
