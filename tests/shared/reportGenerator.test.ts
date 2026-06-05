import { describe, expect, it } from "vitest";
import { sampleInvestigationInput } from "../../src/shared/sampleInvestigation";
import { buildReports } from "../../src/shared/reportGenerator";

describe("buildReports", () => {
  it("creates a concise report with coordinates and uncertainty", () => {
    const report = buildReports(sampleInvestigationInput);
    expect(report.summaryMarkdown).toContain("42.25967, 112.75623");
    expect(report.summaryMarkdown).toContain("高置信");
    expect(report.summaryMarkdown).toContain("卫星影像日期可能与视频日期不同");
    expect(report.summaryMarkdown).toContain("关键证据：");
    expect(report.summaryMarkdown).not.toContain("High confidence");
    expect(report.summaryMarkdown).not.toContain("Key evidence:");
  });

  it("creates a full report with queries, sources, and Google Earth checklist", () => {
    const report = buildReports(sampleInvestigationInput);
    expect(report.fullMarkdown).toContain("# 图片定位候选报告");
    expect(report.fullMarkdown).toContain("不要把候选坐标视为已确认地理位置");
    expect(report.fullMarkdown).toContain("## 提取到的线索");
    expect(report.fullMarkdown).toContain("## 搜索过程");
    expect(report.fullMarkdown).toContain("## 季节与历史影像核验");
    expect(report.fullMarkdown).toContain("Google Maps 卫星图像预览");
    expect(report.fullMarkdown).toContain("铁路在画面前景横向延伸");
    expect(report.fullMarkdown).toContain("复制到 Google Earth 搜索");
    expect(report.fullMarkdown).not.toContain("## Extracted Clues");
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

    expect(report.fullMarkdown).toContain("坐标范围：42.00000, 112.00000 到 43.00000, 113.00000");
    expect(report.fullMarkdown).not.toContain("[object Object]");
    expect(report.fullMarkdown).not.toContain("dateOrTimeHint:");
    expect(report.fullMarkdown).toContain("- 未提供");
  });

  it("can generate an English evidence-chain report when requested", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      outputLanguage: "en-US"
    });

    expect(report.fullMarkdown).toContain("# Image Geolocation Candidate Report");
    expect(report.fullMarkdown).toContain("Do not treat coordinates as confirmed");
    expect(report.fullMarkdown).toContain("## Search Process");
    expect(report.fullMarkdown).toContain("## Season and Historical Imagery Check");
    expect(report.summaryMarkdown).toContain("High confidence");
  });

  it("includes external OSINT verification links when candidates provide them", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      candidates: [
        {
          ...sampleInvestigationInput.candidates[0],
          osintLinks: [
            {
              title: "OpenRailwayMap nearby",
              url: "https://www.openrailwaymap.org/?style=standard&lat=42.25967&lon=112.75623&zoom=16",
              note: "Check railway infrastructure."
            }
          ]
        }
      ]
    });

    expect(report.fullMarkdown).toContain("外部 OSINT 核验入口");
    expect(report.fullMarkdown).toContain("OpenRailwayMap nearby");
    expect(report.fullMarkdown).toContain("https://www.openrailwaymap.org/");
  });
});
