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
});
