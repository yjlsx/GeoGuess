import { randomUUID } from "node:crypto";
import { buildSearchQueries } from "../src/shared/queryPlanner";
import { buildReports } from "../src/shared/reportGenerator";
import { buildSeasonalAnalysis } from "../src/shared/seasonalAnalysis";
import type { CropMode, ExtractedClues, Investigation, OutputLanguage, SearchProcessStep, UserScope } from "../src/shared/types";
import { analyzeImageForInvestigation } from "./imageAnalysis";
import { manualVisionProvider } from "./providers/manualVisionProvider";
import { mockSearchProvider } from "./providers/mockSearchProvider";
import type { SearchProvider, VisionProvider } from "./providers/types";

export type RunInvestigationInput = {
  id?: string;
  image: {
    originalPath: string;
    cropPath?: string;
    cropMode: CropMode;
  };
  outputLanguage?: OutputLanguage;
  userScope: UserScope;
  manualClues?: ExtractedClues;
  providers?: {
    vision?: VisionProvider;
    search?: SearchProvider;
  };
};

function buildSearchProcess(
  queries: ReturnType<typeof buildSearchQueries>,
  language: OutputLanguage
): SearchProcessStep[] {
  const zh = language === "zh-CN";
  return [
    ...queries.slice(0, 6).map((query, index) => ({
      title: zh ? `步骤 ${index + 1}：生成搜索语句` : `Step ${index + 1}: Build search query`,
      query: query.query,
      rationale: zh
        ? `根据 ${query.purpose} 线索生成，用于缩小候选区域。`
        : `Generated from ${query.purpose} clues to narrow candidate areas.`,
      status: "planned" as const
    })),
    {
      title: zh ? "地图核验：候选坐标预览" : "Map check: candidate coordinate preview",
      rationale: zh
        ? "把候选坐标放入 Google Maps 嵌入预览，对比道路、轨道、建筑和开阔地的空间关系。"
        : "Place candidate coordinates into a Google Maps embed to compare roads, tracks, buildings, and open ground.",
      status: "previewed" as const
    },
    {
      title: zh ? "历史影像核验：Google Earth" : "Historical imagery check: Google Earth",
      rationale: zh
        ? "Google Earth 历史影像没有稳定的无密钥截图 API，本地版提供入口和核验清单，避免伪造截图结论。"
        : "Google Earth historical imagery has no stable keyless screenshot API, so the local version provides an entry point and checklist instead of fabricated screenshots.",
      status: "needs-earth-check" as const
    }
  ];
}

export async function runInvestigation(input: RunInvestigationInput): Promise<Investigation> {
  const outputLanguage = input.outputLanguage ?? "zh-CN";
  const vision = input.providers?.vision ?? manualVisionProvider;
  const search = input.providers?.search ?? mockSearchProvider;
  const imagePath = input.image.cropPath ?? input.image.originalPath;
  const extractedClues = await vision.extractClues({
    imagePath,
    userScope: input.userScope,
    manualClues: input.manualClues
  });
  const searchQueries = buildSearchQueries(input.userScope, extractedClues);
  const searchProcess = buildSearchProcess(searchQueries, outputLanguage);
  const imageAnalysis = await analyzeImageForInvestigation({ imagePath, outputLanguage });
  const seasonalAnalysis = buildSeasonalAnalysis({ userScope: input.userScope, outputLanguage });
  const candidates = await search.findCandidates({
    userScope: input.userScope,
    clues: extractedClues,
    queries: searchQueries
  });
  const report = buildReports({
    outputLanguage,
    userScope: input.userScope,
    extractedClues,
    searchQueries,
    searchProcess,
    imageAnalysis,
    seasonalAnalysis,
    candidates
  });

  return {
    id: input.id ?? randomUUID(),
    outputLanguage,
    image: input.image,
    userScope: input.userScope,
    extractedClues,
    searchQueries,
    searchProcess,
    imageAnalysis,
    seasonalAnalysis,
    candidates,
    report
  };
}
