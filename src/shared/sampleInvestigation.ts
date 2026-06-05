import { buildGoogleEarthHint, buildGoogleEarthWebUrl, buildGoogleMapsEmbedUrl, buildGoogleMapsLink } from "./mapLinks";
import { buildMapFeatureProfile } from "./mapFeatureProfile";
import { buildCandidateOsintLinks } from "./osintLinks";
import type { Candidate, ReportInput } from "./types";

const sampleScope = {
  country: "Mongolia",
  region: "Dornogovi",
  facilityType: "铁路车站",
  source: "CCTV 7",
  notes: "中蒙联合训练"
};

const sampleClues = {
  ocrText: ["中蒙 草原伙伴 2026 陆军联合训练"],
  visibleLabels: ["CCTV 7"],
  languages: ["中文"],
  sceneFeatures: ["铁路", "车站建筑", "草原", "通信塔"],
  spatialRelationships: ["铁路在画面前景横向延伸", "车站建筑位于铁轨后方"],
  inferredSearchTerms: ["中蒙联合训练 铁路车站"]
};

function buildSampleCandidateBase(latitude: number, longitude: number): Pick<
  Candidate,
  "mapLinks" | "mapPreview" | "matchingEvidence" | "uncertainty" | "sources" | "earthVerificationChecklist"
> {
  return {
  mapLinks: {
    googleMaps: buildGoogleMapsLink(latitude, longitude),
    googleEarthHint: buildGoogleEarthHint(latitude, longitude)
  },
  mapPreview: {
    googleMapsEmbedUrl: buildGoogleMapsEmbedUrl(latitude, longitude),
    googleEarthWebUrl: buildGoogleEarthWebUrl(latitude, longitude),
    screenshotStatus: "当前为 Google Maps 卫星图像预览；Google Earth 历史影像需要打开后按日期核验。",
    notes: ["优先对比铁路走向、站房位置、通信塔和道路交叉点。"]
  },
  matchingEvidence: [
    "画面中的铁路走向与候选地点一致",
    "车站建筑位于铁轨后方",
    "周边开阔草原/荒漠地貌与截图相符"
  ],
  uncertainty: ["卫星影像日期可能与视频日期不同"],
  sources: [
    {
      title: "用户提供的图片上下文",
      url: "local://uploaded-image",
      note: "离线 MVP 的手动/示例证据"
    }
  ],
  earthVerificationChecklist: [
    "确认铁路走向和可见轨道数量",
    "检查车站建筑是否位于铁轨北侧",
    "对比通信塔和道路位置",
    "使用历史影像检查建筑变化"
  ]
  };
}

export const sampleInvestigationInput: ReportInput = {
  outputLanguage: "zh-CN",
  userScope: sampleScope,
  extractedClues: sampleClues,
  mapFeatureProfile: buildMapFeatureProfile(sampleScope, sampleClues),
  metadataEvidence: [],
  searchQueries: [
    {
      query: "Mongolia Dornogovi railway station CCTV 7 China Mongolia joint training",
      language: "en",
      purpose: "scope-source-facility"
    }
  ],
  searchProcess: [
    {
      title: "步骤 1：范围/来源/设施搜索",
      query: "Mongolia Dornogovi railway station CCTV 7 China Mongolia joint training",
      rationale: "把用户提供的国家、地区、设施类型和来源组合成第一组候选搜索。",
      status: "planned"
    },
    {
      title: "步骤 2：地图核验",
      rationale: "打开候选坐标，对比铁路方向、站房位置、道路和通信塔。",
      status: "previewed"
    }
  ],
  imageAnalysis: {
    recognitionMode: "local-metadata",
    observations: ["自动读取图片尺寸和画幅，并将 OCR/地物线索作为待视觉模型确认项。"],
    limitations: ["离线示例不会伪造 Google Earth 历史截图。"]
  },
  seasonalAnalysis: {
    captureDateHint: "2026",
    inferredSeason: "日期不足，无法可靠判断季节",
    confidence: "low",
    reasoning: ["截图文字只有年份，没有明确月份，季节判断需要结合视频发布日期或来源信息。"],
    mapComparisonNotes: ["在 Google Earth 中优先检查 2026 年附近的历史影像，再对比植被和裸地颜色。"]
  },
  candidates: [
    {
      ...buildSampleCandidateBase(42.25967, 112.75623),
      id: "candidate-1",
      name: "训练区域附近铁路车站",
      latitude: 42.25967,
      longitude: 112.75623,
      confidence: "high",
      matchScore: 86,
      matchedFeatures: ["铁路走向", "站房位置", "开阔地貌"],
      missingOrUnverifiedFeatures: ["影像日期"],
      viewpointNotes: ["镜头位于铁轨南侧，向北观察站房。"],
      osintLinks: buildCandidateOsintLinks({
        latitude: 42.25967,
        longitude: 112.75623,
        label: "训练区域附近铁路车站"
      })
    },
    {
      ...buildSampleCandidateBase(42.30188, 112.74865),
      id: "candidate-2",
      name: "铁路沿线候选点 A",
      latitude: 42.30188,
      longitude: 112.74865,
      confidence: "medium",
      matchScore: 72,
      matchedFeatures: ["铁路走向", "开阔地貌"],
      missingOrUnverifiedFeatures: ["站房位置"],
      viewpointNotes: ["道路与轨道角度部分一致。"],
      osintLinks: []
    },
    {
      ...buildSampleCandidateBase(42.29543, 112.71876),
      id: "candidate-3",
      name: "铁路沿线候选点 B",
      latitude: 42.29543,
      longitude: 112.71876,
      confidence: "medium",
      matchScore: 59,
      matchedFeatures: ["荒漠地貌", "线性交通廊道"],
      missingOrUnverifiedFeatures: ["通信塔"],
      viewpointNotes: ["远景开阔度相似。"],
      osintLinks: []
    },
    {
      ...buildSampleCandidateBase(42.31012, 112.72568),
      id: "candidate-4",
      name: "城郊铁路设施候选",
      latitude: 42.31012,
      longitude: 112.72568,
      confidence: "low",
      matchScore: 46,
      matchedFeatures: ["铁路设施"],
      missingOrUnverifiedFeatures: ["站房", "道路交叉点"],
      viewpointNotes: ["建筑密度高于原图。"],
      osintLinks: []
    },
    {
      ...buildSampleCandidateBase(42.28765, 112.70543),
      id: "candidate-5",
      name: "开阔地带候选点",
      latitude: 42.28765,
      longitude: 112.70543,
      confidence: "low",
      matchScore: 38,
      matchedFeatures: ["开阔地貌"],
      missingOrUnverifiedFeatures: ["铁路站台"],
      viewpointNotes: ["地貌相似但设施证据不足。"],
      osintLinks: []
    },
    {
      ...buildSampleCandidateBase(42.32211, 112.71543),
      id: "candidate-6",
      name: "道路相似候选点",
      latitude: 42.32211,
      longitude: 112.71543,
      confidence: "low",
      matchScore: 31,
      matchedFeatures: ["道路走向"],
      missingOrUnverifiedFeatures: ["铁路", "站房"],
      viewpointNotes: ["道路关系相似，核心设施缺失。"],
      osintLinks: []
    },
    {
      ...buildSampleCandidateBase(42.27543, 112.69877),
      id: "candidate-7",
      name: "低置信候选点",
      latitude: 42.27543,
      longitude: 112.69877,
      confidence: "low",
      matchScore: 28,
      matchedFeatures: ["地形颜色"],
      missingOrUnverifiedFeatures: ["铁路", "通信塔", "站房"],
      viewpointNotes: ["仅作为排除项保留。"],
      osintLinks: []
    }
  ]
};
