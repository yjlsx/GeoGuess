import { buildGoogleEarthHint, buildGoogleMapsLink } from "../../src/shared/mapLinks";
import type { SearchProvider } from "./types";

export const mockSearchProvider: SearchProvider = {
  async findCandidates(args) {
    return [
      {
        id: "mock-candidate-1",
        name: "离线模拟铁路候选点",
        latitude: 42.25967,
        longitude: 112.75623,
        confidence: "low",
        mapLinks: {
          googleMaps: buildGoogleMapsLink(42.25967, 112.75623),
          googleEarthHint: buildGoogleEarthHint(42.25967, 112.75623)
        },
        matchingEvidence: [
          "离线模拟候选用于在没有外部 API 时测试完整报告流程",
          ...args.clues.spatialRelationships.slice(0, 2),
          ...args.clues.sceneFeatures.slice(0, 3).map((feature) => `可见特征：${feature}`)
        ],
        uncertainty: ["当前为离线模拟候选，不代表真实定位结论"],
        sources: [
          {
            title: "离线模拟搜索",
            url: "local://mock-search",
            note: `根据 ${args.queries.length} 条计划搜索语句生成`
          }
        ],
        earthVerificationChecklist: [
          "确认铁路走向和轨道数量",
          "对比车站建筑与铁轨的相对位置",
          "检查道路、开阔地、通信塔和屋顶颜色",
          "使用历史影像确认地物是否发生变化"
        ]
      }
    ];
  }
};
