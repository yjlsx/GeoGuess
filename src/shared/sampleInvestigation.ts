import { buildGoogleEarthHint, buildGoogleEarthWebUrl, buildGoogleMapsEmbedUrl, buildGoogleMapsLink } from "./mapLinks";
import type { ReportInput } from "./types";

export const sampleInvestigationInput: ReportInput = {
  outputLanguage: "zh-CN",
  userScope: {
    country: "Mongolia",
    region: "Dornogovi",
    facilityType: "铁路车站",
    source: "CCTV 7",
    notes: "中蒙联合训练"
  },
  extractedClues: {
    ocrText: ["中蒙 草原伙伴 2026 陆军联合训练"],
    visibleLabels: ["CCTV 7"],
    languages: ["中文"],
    sceneFeatures: ["铁路", "车站建筑", "草原", "通信塔"],
    spatialRelationships: ["铁路在画面前景横向延伸", "车站建筑位于铁轨后方"],
    inferredSearchTerms: ["中蒙联合训练 铁路车站"]
  },
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
      id: "candidate-1",
      name: "训练区域附近铁路车站",
      latitude: 42.25967,
      longitude: 112.75623,
      confidence: "high",
      mapLinks: {
        googleMaps: buildGoogleMapsLink(42.25967, 112.75623),
        googleEarthHint: buildGoogleEarthHint(42.25967, 112.75623)
      },
      mapPreview: {
        googleMapsEmbedUrl: buildGoogleMapsEmbedUrl(42.25967, 112.75623),
        googleEarthWebUrl: buildGoogleEarthWebUrl(42.25967, 112.75623),
        screenshotStatus: "当前为 Google Maps 嵌入预览；Google Earth 历史影像需要打开后按日期核验。",
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
    }
  ]
};
