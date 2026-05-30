import { formatCoordinate } from "./mapLinks";
import type { CoordinateBox, ReportInput, UserScope } from "./types";

function confidenceLabel(confidence: string) {
  const labels: Record<string, string> = {
    high: "高置信",
    medium: "中置信",
    low: "低置信"
  };

  return labels[confidence] ?? confidence;
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

function scopeLabel(key: string) {
  const labels: Record<string, string> = {
    country: "国家",
    region: "地区",
    coordinateBox: "坐标范围",
    facilityType: "设施类型",
    source: "来源",
    dateOrTimeHint: "时间提示",
    notes: "备注"
  };

  return labels[key] ?? key;
}

function formatScope(userScope: UserScope) {
  return Object.entries(userScope)
    .flatMap(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return [];
      }

      if (key === "coordinateBox") {
        return [`${scopeLabel(key)}：${formatCoordinateBox(value as CoordinateBox)}`];
      }

      return [`${scopeLabel(key)}：${value}`];
    });
}

function queryPurposeLabel(purpose: string) {
  const labels: Record<string, string> = {
    "scope-source-facility": "范围/来源/设施",
    "ocr-scope": "OCR/范围",
    "inferred-term": "推断搜索词"
  };

  return labels[purpose] ?? purpose;
}

export function buildReports(input: ReportInput) {
  const summaryMarkdown = input.candidates
    .map((candidate, index) => {
      return [
        `### 候选 ${index + 1}：${confidenceLabel(candidate.confidence)}`,
        `${formatCoordinate(candidate.latitude, candidate.longitude)}`,
        candidate.mapLinks.googleMaps,
        "",
        "关键证据：",
        list(candidate.matchingEvidence.slice(0, 3)),
        "",
        "主要不确定点：",
        list(candidate.uncertainty.slice(0, 2))
      ].join("\n");
    })
    .join("\n\n");

  const fullMarkdown = [
    "# 图片定位报告",
    "",
    "## 用户提供的范围",
    list(formatScope(input.userScope)),
    "",
    "## 提取到的线索",
    "OCR 文字：",
    list(input.extractedClues.ocrText),
    "地物特征：",
    list(input.extractedClues.sceneFeatures),
    "空间关系：",
    list(input.extractedClues.spatialRelationships),
    "",
    "## 搜索语句",
    list(input.searchQueries.map((query) => `${query.query}（${queryPurposeLabel(query.purpose)}）`)),
    "",
    "## 候选地点",
    ...input.candidates.map((candidate, index) =>
      [
        `### 候选 ${index + 1}：${candidate.name ?? "未命名地点"}`,
        `坐标：${formatCoordinate(candidate.latitude, candidate.longitude)}`,
        `置信度：${confidenceLabel(candidate.confidence)}`,
        `地图链接：${candidate.mapLinks.googleMaps}`,
        candidate.mapLinks.googleEarthHint ?? "",
        "",
        "匹配证据：",
        list(candidate.matchingEvidence),
        "不确定点：",
        list(candidate.uncertainty),
        "来源：",
        list(candidate.sources.map((source) => `${source.title} - ${source.url} - ${source.note}`)),
        "Google Earth 核验清单：",
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
