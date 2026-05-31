import { formatCoordinate } from "./mapLinks";
import type { CoordinateBox, OutputLanguage, ReportInput, UserScope } from "./types";

function t(language: OutputLanguage, zh: string, en: string) {
  return language === "zh-CN" ? zh : en;
}

function confidenceLabel(confidence: string, language: OutputLanguage) {
  const labels: Record<OutputLanguage, Record<string, string>> = {
    "zh-CN": {
      high: "高置信",
      medium: "中置信",
      low: "低置信"
    },
    "en-US": {
      high: "High confidence",
      medium: "Medium confidence",
      low: "Low confidence"
    }
  };

  return labels[language][confidence] ?? confidence;
}

function list(items: string[]) {
  if (items.length === 0) {
    return "- 未提供";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function formatCoordinateBox(coordinateBox: CoordinateBox) {
  return `${formatCoordinate(coordinateBox.minLat, coordinateBox.minLon)} 到 ${formatCoordinate(
    coordinateBox.maxLat,
    coordinateBox.maxLon
  )}`;
}

function scopeLabel(key: string, language: OutputLanguage) {
  const labels: Record<OutputLanguage, Record<string, string>> = {
    "zh-CN": {
      country: "国家",
      region: "地区",
      coordinateBox: "坐标范围",
      facilityType: "设施类型",
      source: "来源",
      dateOrTimeHint: "时间提示",
      notes: "备注"
    },
    "en-US": {
      country: "Country",
      region: "Region",
      coordinateBox: "Coordinate box",
      facilityType: "Facility type",
      source: "Source",
      dateOrTimeHint: "Date/time hint",
      notes: "Notes"
    }
  };

  return labels[language][key] ?? key;
}

function formatScope(userScope: UserScope, language: OutputLanguage) {
  return Object.entries(userScope)
    .flatMap(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return [];
      }

      if (key === "coordinateBox") {
        return [`${scopeLabel(key, language)}：${formatCoordinateBox(value as CoordinateBox)}`];
      }

      return [`${scopeLabel(key, language)}：${value}`];
    });
}

function queryPurposeLabel(purpose: string, language: OutputLanguage) {
  const labels: Record<OutputLanguage, Record<string, string>> = {
    "zh-CN": {
      "scope-source-facility": "范围/来源/设施",
      "ocr-scope": "OCR/范围",
      "inferred-term": "推断搜索词"
    },
    "en-US": {
      "scope-source-facility": "scope/source/facility",
      "ocr-scope": "OCR/scope",
      "inferred-term": "inferred term"
    }
  };

  return labels[language][purpose] ?? purpose;
}

export function buildReports(input: ReportInput) {
  const language = input.outputLanguage ?? "zh-CN";
  const summaryMarkdown = input.candidates
    .map((candidate, index) => {
      return [
        `### ${t(language, "候选", "Candidate")} ${index + 1}：${confidenceLabel(candidate.confidence, language)}`,
        `${formatCoordinate(candidate.latitude, candidate.longitude)}`,
        candidate.mapLinks.googleMaps,
        "",
        t(language, "关键证据：", "Key evidence:"),
        list(candidate.matchingEvidence.slice(0, 3)),
        "",
        t(language, "主要不确定点：", "Main uncertainty:"),
        list(candidate.uncertainty.slice(0, 2))
      ].join("\n");
    })
    .join("\n\n");

  const fullMarkdown = [
    t(language, "# 图片定位报告", "# Image Geolocation Evidence Report"),
    "",
    t(language, "## 用户提供的范围", "## User Scope"),
    list(formatScope(input.userScope, language)),
    "",
    t(language, "## 自动识别线索", "## Automatic Recognition Clues"),
    list(input.imageAnalysis?.observations ?? []),
    t(language, "能力边界：", "Limitations:"),
    list(input.imageAnalysis?.limitations ?? []),
    "",
    t(language, "## 提取到的线索", "## Extracted Clues"),
    t(language, "OCR 文字：", "OCR:"),
    list(input.extractedClues.ocrText),
    t(language, "地物特征：", "Scene features:"),
    list(input.extractedClues.sceneFeatures),
    t(language, "空间关系：", "Spatial relationships:"),
    list(input.extractedClues.spatialRelationships),
    "",
    t(language, "## 搜索过程", "## Search Process"),
    list((input.searchProcess ?? []).map((step) => `${step.title}${step.query ? `：${step.query}` : ""}\n  - ${step.rationale}`)),
    "",
    t(language, "## 搜索语句", "## Search Queries"),
    list(input.searchQueries.map((query) => `${query.query}（${queryPurposeLabel(query.purpose, language)}）`)),
    "",
    t(language, "## 季节与历史影像核验", "## Season and Historical Imagery Check"),
    list([
      `${t(language, "判断结果", "Inferred season")}：${input.seasonalAnalysis?.inferredSeason ?? t(language, "未提供", "not provided")}`,
      ...(input.seasonalAnalysis?.reasoning ?? []),
      ...(input.seasonalAnalysis?.mapComparisonNotes ?? [])
    ]),
    "",
    t(language, "## 候选地点", "## Candidates"),
    ...input.candidates.map((candidate, index) =>
      [
        `### ${t(language, "候选", "Candidate")} ${index + 1}：${candidate.name ?? t(language, "未命名地点", "Unnamed location")}`,
        `${t(language, "坐标", "Coordinates")}：${formatCoordinate(candidate.latitude, candidate.longitude)}`,
        `${t(language, "置信度", "Confidence")}：${confidenceLabel(candidate.confidence, language)}`,
        `${t(language, "地图链接", "Maps")}：${candidate.mapLinks.googleMaps}`,
        candidate.mapLinks.googleEarthHint ?? "",
        `${t(language, "Google Maps 卫星图像预览", "Google Maps satellite imagery preview")}：${candidate.mapPreview.googleMapsEmbedUrl}`,
        `${t(language, "Google Earth 历史影像入口", "Google Earth historical imagery entry")}：${candidate.mapPreview.googleEarthWebUrl}`,
        `${t(language, "截图状态", "Screenshot status")}：${candidate.mapPreview.screenshotStatus}`,
        "",
        t(language, "匹配证据：", "Matching evidence:"),
        list(candidate.matchingEvidence),
        t(language, "不确定点：", "Uncertainty:"),
        list(candidate.uncertainty),
        t(language, "卫星图像预览备注：", "Satellite imagery preview notes:"),
        list(candidate.mapPreview.notes),
        t(language, "来源：", "Sources:"),
        list(candidate.sources.map((source) => `${source.title} - ${source.url} - ${source.note}`)),
        t(language, "Google Earth 核验清单：", "Google Earth verification checklist:"),
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
