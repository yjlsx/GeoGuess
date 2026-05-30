import { buildGoogleEarthHint, buildGoogleMapsLink } from "./mapLinks";
import type { ReportInput } from "./types";

export const sampleInvestigationInput: ReportInput = {
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
