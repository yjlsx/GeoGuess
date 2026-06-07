import { formatCoordinate } from "./mapLinks";
import { searchPurposeLabel } from "./searchPurposeLabels";
import type { CandidateManualVerdict, CoordinateBox, FeatureMatch, OutputLanguage, ReportInput, UserScope } from "./types";

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

function featureMatchStatusLabel(status: FeatureMatch["status"], language: OutputLanguage) {
  const labels: Record<OutputLanguage, Record<FeatureMatch["status"], string>> = {
    "zh-CN": {
      matched: "已匹配",
      partial: "部分匹配",
      unverified: "待核验",
      mismatch: "明显不匹配"
    },
    "en-US": {
      matched: "Matched",
      partial: "Partial match",
      unverified: "Unverified",
      mismatch: "Mismatch"
    }
  };

  return labels[language][status] ?? status;
}

function aiVerificationStatusLabel(status: NonNullable<FeatureMatch["aiVerification"]>["status"], language: OutputLanguage) {
  const labels: Record<OutputLanguage, Record<NonNullable<FeatureMatch["aiVerification"]>["status"], string>> = {
    "zh-CN": {
      supports: "支持",
      contradicts: "矛盾",
      inconclusive: "证据不足"
    },
    "en-US": {
      supports: "Supports",
      contradicts: "Contradicts",
      inconclusive: "Inconclusive"
    }
  };

  return labels[language][status] ?? status;
}

function manualVerdictLabel(status: CandidateManualVerdict["status"] | undefined, language: OutputLanguage) {
  const labels: Record<OutputLanguage, Record<CandidateManualVerdict["status"], string>> = {
    "zh-CN": {
      unreviewed: "未人工判定",
      confirmed: "已确认",
      kept: "保留核验",
      excluded: "已排除"
    },
    "en-US": {
      unreviewed: "Not manually reviewed",
      confirmed: "Confirmed",
      kept: "Kept for review",
      excluded: "Excluded"
    }
  };

  return labels[language][status ?? "unreviewed"];
}

function featureMatchList(matches: FeatureMatch[] | undefined, language: OutputLanguage) {
  if (!matches || matches.length === 0) {
    return "- 未提供";
  }

  return matches
    .map((match, index) => {
      const aiVerification = match.aiVerification;
      const sourceDetails = [
        match.imageAnnotation ? `  - ${t(language, "原图标注说明", "Original image annotation")}：${match.imageAnnotation}` : "",
        match.mapAnnotation ? `  - ${t(language, "地图/Earth 标注说明", "Map/Earth annotation")}：${match.mapAnnotation}` : "",
        match.evidenceLink ? `  - ${t(language, "核验链接", "Evidence link")}：${match.evidenceLink}` : "",
        match.mapScreenshotUrl ? `  - ${t(language, "地图/Earth 截图", "Map/Earth screenshot")}：${match.mapScreenshotUrl}` : "",
        match.mapScreenshotAttachment
          ? `  - ${t(language, "地图/Earth 截图附件", "Map/Earth screenshot attachment")}：${match.mapScreenshotAttachment.name}`
          : "",
        match.earthImageDate ? `  - ${t(language, "地图/Earth 影像日期", "Map/Earth imagery date")}：${match.earthImageDate}` : "",
        aiVerification ? `  - ${t(language, "AI 核验", "AI verification")}：${aiVerificationStatusLabel(aiVerification.status, language)}` : "",
        aiVerification ? `  - ${t(language, "AI 核验置信度", "AI verification confidence")}：${confidenceLabel(aiVerification.confidence, language)}` : "",
        aiVerification?.rationale ? `  - ${t(language, "AI 核验理由", "AI verification rationale")}：${aiVerification.rationale}` : "",
        aiVerification?.model ? `  - ${t(language, "AI 核验模型", "AI verification model")}：${aiVerification.model}` : "",
        aiVerification?.checkedAt ? `  - ${t(language, "AI 核验时间", "AI verification time")}：${aiVerification.checkedAt}` : ""
      ].filter(Boolean);

      return [
        `- ${t(language, "对应", "Match")} ${index + 1}：${featureMatchStatusLabel(match.status, language)}`,
        `  - ${t(language, "原图特征", "Image feature")}：${match.imageFeature}`,
        `  - ${t(language, "地图/Earth 对应", "Map/Earth counterpart")}：${match.mapFeature}`,
        `  - ${t(language, "核验动作", "Verification action")}：${match.verification}`,
        ...sourceDetails
      ].join("\n");
    })
    .join("\n");
}

function list(items: string[]) {
  if (items.length === 0) {
    return "- 未提供";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function prioritizedSummaryItems(items: string[], maxItems: number, preferredPattern: RegExp) {
  if (items.length <= maxItems) {
    return items;
  }

  const preferred = items.find((item) => preferredPattern.test(item));
  if (!preferred) {
    return items.slice(0, maxItems);
  }

  return [...items.filter((item) => item !== preferred).slice(0, maxItems - 1), preferred];
}

function formatCoordinateBox(coordinateBox: CoordinateBox) {
  const south = Math.min(coordinateBox.minLat, coordinateBox.maxLat);
  const north = Math.max(coordinateBox.minLat, coordinateBox.maxLat);
  const west = Math.min(coordinateBox.minLon, coordinateBox.maxLon);
  const east = Math.max(coordinateBox.minLon, coordinateBox.maxLon);
  return `${formatCoordinate(south, west)} 到 ${formatCoordinate(north, east)}`;
}

function scopeValueLabel(key: string, value: string, language: OutputLanguage) {
  const labels: Record<OutputLanguage, Record<string, Record<string, string>>> = {
    "zh-CN": {
      regionScope: {
        custom: "用户自定义范围",
        global: "全球范围",
        country: "国家/地区范围"
      },
      boundaryMode: {
        rectangle: "矩形坐标框",
        polygon: "多边形边界"
      }
    },
    "en-US": {
      regionScope: {
        custom: "custom user boundary",
        global: "global search",
        country: "country/region scope"
      },
      boundaryMode: {
        rectangle: "coordinate rectangle",
        polygon: "polygon boundary"
      }
    }
  };

  return labels[language][key]?.[value] ?? value;
}

function formatPolygonCoordinates(value: string, language: OutputLanguage) {
  const rows = value
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);
  if (rows.length === 0) {
    return value;
  }

  const prefix = language === "zh-CN" ? "顶点" : "vertex";
  return rows.map((row, index) => `${prefix} ${index + 1}: ${row}`).join("；");
}

function scopeLabel(key: string, language: OutputLanguage) {
  const labels: Record<OutputLanguage, Record<string, string>> = {
    "zh-CN": {
      regionScope: "区域范围",
      boundaryMode: "范围类型",
      country: "国家",
      region: "地区",
      coordinateBox: "坐标范围",
      polygonCoordinates: "多边形坐标",
      facilityType: "设施类型",
      source: "来源",
      dateOrTimeHint: "时间提示",
      notes: "备注"
    },
    "en-US": {
      regionScope: "Region scope",
      boundaryMode: "Boundary mode",
      country: "Country",
      region: "Region",
      coordinateBox: "Coordinate box",
      polygonCoordinates: "Polygon coordinates",
      facilityType: "Facility type",
      source: "Source",
      dateOrTimeHint: "Date/time hint",
      notes: "Notes"
    }
  };

  return labels[language][key] ?? key;
}

function formatScope(userScope: UserScope, language: OutputLanguage) {
  return Object.entries(userScope).flatMap(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return [];
    }

    if (key === "coordinateBox") {
      return [`${scopeLabel(key, language)}：${formatCoordinateBox(value as CoordinateBox)}`];
    }

    if (key === "polygonCoordinates") {
      return [`${scopeLabel(key, language)}：${formatPolygonCoordinates(String(value), language)}`];
    }

    return [`${scopeLabel(key, language)}：${scopeValueLabel(key, String(value), language)}`];
  });
}

export function buildReports(input: ReportInput) {
  const language = input.outputLanguage ?? "zh-CN";
  const noCandidatesMessage = t(language, "尚未生成候选坐标。", "No candidate coordinates have been generated yet.");
  const summaryMarkdown =
    input.candidates.length === 0
      ? noCandidatesMessage
      : input.candidates
          .map((candidate, index) => {
            return [
              `### ${t(language, "候选", "Candidate")} ${index + 1}：${confidenceLabel(candidate.confidence, language)}`,
              `${formatCoordinate(candidate.latitude, candidate.longitude)}`,
              candidate.mapLinks.googleMaps,
              "",
              t(language, "关键证据：", "Key evidence:"),
              list(prioritizedSummaryItems(candidate.matchingEvidence, 3, /本地证据评分|local evidence score/i)),
              candidate.manualVerdict?.status && candidate.manualVerdict.status !== "unreviewed"
                ? `${t(language, "人工结论", "Manual verdict")}：${manualVerdictLabel(candidate.manualVerdict.status, language)}`
                : "",
              "",
              t(language, "主要不确定点：", "Main uncertainty:"),
              list(prioritizedSummaryItems(candidate.uncertainty, 2, /本地证据评分扣分项|local evidence score/i))
            ].join("\n");
          })
          .join("\n\n");

  const fullMarkdown = [
    t(language, "# 图片定位候选报告", "# Image Geolocation Candidate Report"),
    "",
    t(
      language,
      "说明：本报告生成的是待人工核验的候选地点。除非人工已逐项核验来源、卫星图/地图特征和历史影像，否则不要把候选坐标视为已确认地理位置。",
      "Note: this report generates candidates for manual verification. Do not treat coordinates as confirmed unless sources, satellite/map features, and historical imagery have been checked."
    ),
    "",
    t(language, "## 用户提供的范围", "## User Scope"),
    list(formatScope(input.userScope, language)),
    "",
    t(language, "## 自动识别线索", "## Automatic Recognition Clues"),
    list(input.imageAnalysis?.observations ?? []),
    t(language, "能力边界：", "Limitations:"),
    list(input.imageAnalysis?.limitations ?? []),
    "",
    t(language, "## EXIF / 元数据", "## EXIF / Metadata"),
    ...(input.metadataEvidence?.length
      ? input.metadataEvidence.map((metadata) =>
          [
            `${t(language, "文件", "File")}：${metadata.sourcePath}`,
            metadata.gps
              ? `${t(language, "GPS 坐标", "GPS coordinates")}：${formatCoordinate(metadata.gps.latitude, metadata.gps.longitude)}`
              : `${t(language, "GPS 坐标", "GPS coordinates")}：${t(language, "未提供", "not provided")}`,
            metadata.capturedAt ? `${t(language, "拍摄时间", "Capture time")}：${metadata.capturedAt}` : "",
            metadata.camera ? `${t(language, "相机", "Camera")}：${metadata.camera}` : "",
            list(metadata.notes)
          ]
            .filter(Boolean)
            .join("\n")
        )
      : [t(language, "未提取到可用元数据。", "No usable metadata extracted.")]),
    "",
    t(language, "## 提取到的线索", "## Extracted Clues"),
    t(language, "OCR 文字：", "OCR:"),
    list(input.extractedClues.ocrText),
    t(language, "地物特征：", "Scene features:"),
    list(input.extractedClues.sceneFeatures),
    t(language, "空间关系：", "Spatial relationships:"),
    list(input.extractedClues.spatialRelationships),
    "",
    t(language, "## 地图核验特征集合", "## Map Verification Feature Profile"),
    t(language, "主要物理特征：", "Primary physical features:"),
    list(input.mapFeatureProfile?.primaryFeatures ?? []),
    t(language, "空间关系：", "Spatial relationships:"),
    list(input.mapFeatureProfile?.spatialRelationships ?? []),
    t(language, "视角/方位约束：", "Viewpoint and direction constraints:"),
    list(input.mapFeatureProfile?.viewpointConstraints ?? []),
    t(language, "辅助文字线索：", "Auxiliary text clues:"),
    list(input.mapFeatureProfile?.auxiliaryTextClues ?? []),
    t(language, "不作为主要证据的来源词：", "Source-only terms excluded as primary evidence:"),
    list(input.mapFeatureProfile?.excludedSourceOnlyClues ?? []),
    input.mapFeatureProfile?.searchInstruction
      ? `${t(language, "搜索指令", "Search instruction")}：${input.mapFeatureProfile.searchInstruction}`
      : "",
    "",
    t(language, "## 搜索过程", "## Search Process"),
    list((input.searchProcess ?? []).map((step) => `${step.title}${step.query ? `：${step.query}` : ""}\n  - ${step.rationale}`)),
    "",
    t(language, "## 搜索语句", "## Search Queries"),
    list(input.searchQueries.map((query) => `${query.query}（${searchPurposeLabel(query.purpose, language)}）`)),
    "",
    t(language, "## 季节与历史影像核验", "## Season and Historical Imagery Check"),
    list([
      `${t(language, "判断结果", "Inferred season")}：${input.seasonalAnalysis?.inferredSeason ?? t(language, "未提供", "not provided")}`,
      ...(input.seasonalAnalysis?.reasoning ?? []),
      ...(input.seasonalAnalysis?.mapComparisonNotes ?? [])
    ]),
    "",
    t(language, "## 候选地点", "## Candidates"),
    ...(input.candidates.length === 0 ? [noCandidatesMessage] : []),
    ...input.candidates.map((candidate, index) =>
      [
        `### ${t(language, "候选", "Candidate")} ${index + 1}：${candidate.name ?? t(language, "未命名地点", "Unnamed location")}`,
        `${t(language, "坐标", "Coordinates")}：${formatCoordinate(candidate.latitude, candidate.longitude)}`,
        `${t(language, "置信度", "Confidence")}：${confidenceLabel(candidate.confidence, language)}`,
        typeof candidate.matchScore === "number" ? `${t(language, "匹配评分", "Match score")}：${candidate.matchScore}/100` : "",
        `${t(language, "地图链接", "Maps")}：${candidate.mapLinks.googleMaps}`,
        candidate.mapLinks.googleEarthHint ?? "",
        `${t(language, "Google Maps 卫星图像预览", "Google Maps satellite imagery preview")}：${candidate.mapPreview.googleMapsEmbedUrl}`,
        `${t(language, "Google Earth 历史影像入口", "Google Earth historical imagery entry")}：${candidate.mapPreview.googleEarthWebUrl}`,
        `${t(language, "截图状态", "Screenshot status")}：${candidate.mapPreview.screenshotStatus}`,
        `${t(language, "人工结论", "Manual verdict")}：${manualVerdictLabel(candidate.manualVerdict?.status, language)}`,
        candidate.manualVerdict?.rationale ? `${t(language, "人工结论理由", "Manual verdict rationale")}：${candidate.manualVerdict.rationale}` : "",
        "",
        t(language, "已匹配物理特征：", "Matched physical features:"),
        list(candidate.matchedFeatures ?? []),
        t(language, "证据对照：", "Feature match evidence:"),
        featureMatchList(candidate.featureMatches, language),
        t(language, "待核验或不匹配特征：", "Missing or unverified features:"),
        list(candidate.missingOrUnverifiedFeatures ?? []),
        t(language, "视角说明：", "Viewpoint notes:"),
        list(candidate.viewpointNotes ?? []),
        "",
        t(language, "匹配证据：", "Matching evidence:"),
        list(candidate.matchingEvidence),
        t(language, "不确定点：", "Uncertainty:"),
        list(candidate.uncertainty),
        t(language, "卫星图像预览备注：", "Satellite imagery preview notes:"),
        list(candidate.mapPreview.notes),
        t(language, "外部 OSINT 核验入口：", "External OSINT verification links:"),
        list((candidate.osintLinks ?? []).map((link) => `${link.title} - ${link.url} - ${link.note}`)),
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
