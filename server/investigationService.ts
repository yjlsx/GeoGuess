import { randomUUID } from "node:crypto";
import { buildMapFeatureProfile } from "../src/shared/mapFeatureProfile";
import { buildCandidateOsintLinks } from "../src/shared/osintLinks";
import { buildSearchQueries } from "../src/shared/queryPlanner";
import { buildReports } from "../src/shared/reportGenerator";
import { buildSeasonalAnalysis } from "../src/shared/seasonalAnalysis";
import type {
  CropMode,
  ExtractedClues,
  Investigation,
  OutputLanguage,
  SearchProcessStep,
  UserScope,
  VisionModelConfig
} from "../src/shared/types";
import { analyzeImageForInvestigation } from "./imageAnalysis";
import { exifMetadataProvider } from "./providers/metadataProvider";
import { manualVisionProvider } from "./providers/manualVisionProvider";
import { mockSearchProvider } from "./providers/mockSearchProvider";
import { createOpenAISearchProvider } from "./providers/openaiSearchProvider";
import { createOpenAIVisionProvider } from "./providers/openaiVisionProvider";
import type { MetadataProvider, SearchProvider, VisionProvider } from "./providers/types";

export type RunInvestigationInput = {
  id?: string;
  image: {
    originalPath: string;
    cropPath?: string;
    cropMode: CropMode;
    sourcePaths?: string[];
    evidencePaths?: string[];
  };
  outputLanguage?: OutputLanguage;
  userScope: UserScope;
  manualClues?: ExtractedClues;
  visionConfig?: VisionModelConfig;
  providers?: {
    vision?: VisionProvider;
    metadata?: MetadataProvider;
    search?: SearchProvider;
  };
};

function mergeLists(first: string[], second: string[]) {
  return [...new Set([...first, ...second].map((item) => item.trim()).filter(Boolean))];
}

function mergeClues(first: ExtractedClues, second: ExtractedClues): ExtractedClues {
  return {
    ocrText: mergeLists(first.ocrText, second.ocrText),
    visibleLabels: mergeLists(first.visibleLabels, second.visibleLabels),
    languages: mergeLists(first.languages, second.languages),
    sceneFeatures: mergeLists(first.sceneFeatures, second.sceneFeatures),
    spatialRelationships: mergeLists(first.spatialRelationships, second.spatialRelationships),
    inferredSearchTerms: mergeLists(first.inferredSearchTerms, second.inferredSearchTerms)
  };
}

async function extractCluesFromEvidencePaths(args: {
  vision: VisionProvider;
  imagePaths: string[];
  userScope: UserScope;
  manualClues?: ExtractedClues;
  visionConfig?: VisionModelConfig;
}) {
  const [firstPath, ...remainingPaths] = args.imagePaths;
  const firstClues = await args.vision.extractClues({
    imagePath: firstPath,
    userScope: args.userScope,
    manualClues: args.manualClues,
    visionConfig: args.visionConfig
  });

  let merged = firstClues;
  for (const imagePath of remainingPaths) {
    const nextClues = await args.vision.extractClues({
      imagePath,
      userScope: args.userScope,
      visionConfig: args.visionConfig
    });
    merged = mergeClues(merged, nextClues);
  }
  return merged;
}

function withStageMessage(error: unknown, stage: string) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return new Error(`${stage}失败：${message}`, { cause: error });
}

function buildSearchProcess(
  queries: ReturnType<typeof buildSearchQueries>,
  language: OutputLanguage
): SearchProcessStep[] {
  const zh = language === "zh-CN";
  const purposeLabels: Record<string, { zh: string; en: string }> = {
    "visual-feature-bundle": {
      zh: "视觉特征集合",
      en: "visual feature bundle"
    },
    "visual-inferred-term": {
      zh: "视觉推断词",
      en: "visual inferred term"
    },
    "ocr-visual-context": {
      zh: "OCR 辅助线索",
      en: "OCR with visual context"
    }
  };

  return [
    ...queries.slice(0, 6).map((query, index) => ({
      title: zh ? `步骤 ${index + 1}：生成搜索语句` : `Step ${index + 1}: Build search query`,
      query: query.query,
      rationale: zh
        ? `根据 ${purposeLabels[query.purpose]?.zh ?? query.purpose} 生成，用于寻找可在地图上核验的候选区域。`
        : `Generated from ${purposeLabels[query.purpose]?.en ?? query.purpose} to find map-verifiable candidate areas.`,
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

function buildMetadataCandidates(
  metadataEvidence: Awaited<ReturnType<MetadataProvider["extractMetadata"]>>
): Investigation["candidates"] {
  return metadataEvidence.flatMap((metadata, index) => {
    if (!metadata.gps) {
      return [];
    }

    return [
      {
        id: `metadata-candidate-${index + 1}`,
        name: "EXIF GPS metadata",
        latitude: metadata.gps.latitude,
        longitude: metadata.gps.longitude,
        confidence: "high" as const,
        matchScore: 100,
        matchedFeatures: ["EXIF GPS coordinates found in original media"],
        missingOrUnverifiedFeatures: [],
        viewpointNotes: metadata.capturedAt ? [`Capture time from metadata: ${metadata.capturedAt}`] : [],
        mapLinks: {
          googleMaps: `https://www.google.com/maps/search/?api=1&query=${metadata.gps.latitude.toFixed(5)}%2C${metadata.gps.longitude.toFixed(5)}`,
          googleEarthHint: `Copy ${metadata.gps.latitude.toFixed(5)}, ${metadata.gps.longitude.toFixed(5)} into Google Earth and compare the uploaded image.`
        },
        mapPreview: {
          googleMapsEmbedUrl: `https://maps.google.com/maps?q=${metadata.gps.latitude.toFixed(5)},${metadata.gps.longitude.toFixed(5)}&t=k&z=17&output=embed`,
          googleEarthWebUrl: `https://earth.google.com/web/search/${metadata.gps.latitude.toFixed(5)},${metadata.gps.longitude.toFixed(5)}`,
          screenshotStatus: "坐标来自原始媒体 EXIF GPS；仍需确认图片内容与地图位置一致。",
          notes: ["EXIF GPS 是强证据，但可能被编辑、转发或平台改写，仍需地图核验。"]
        },
        matchingEvidence: [
          "Original media contains EXIF GPS coordinates.",
          ...(metadata.capturedAt ? [`Capture time: ${metadata.capturedAt}`] : []),
          ...(metadata.camera ? [`Camera: ${metadata.camera}`] : [])
        ],
        uncertainty: ["EXIF metadata can be stripped, edited, or inherited from a copied file."],
        sources: [
          {
            title: "Original media metadata",
            url: metadata.sourcePath,
            note: "EXIF GPS extracted from the uploaded original media file."
          }
        ],
        earthVerificationChecklist: [
          "Open the EXIF GPS coordinate in Google Maps/Earth.",
          "Compare roads, buildings, vegetation, and camera direction against the uploaded image.",
          "Check whether the file may have been edited or reposted with stale metadata."
        ]
      }
    ];
  });
}

function attachOsintLinks(candidates: Investigation["candidates"]): Investigation["candidates"] {
  return candidates.map((candidate) => ({
    ...candidate,
    osintLinks: [
      ...(candidate.osintLinks ?? []),
      ...buildCandidateOsintLinks({
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        label: candidate.name
      })
    ]
  }));
}

export async function runInvestigation(input: RunInvestigationInput): Promise<Investigation> {
  const outputLanguage = input.outputLanguage ?? "zh-CN";
  const vision =
    input.providers?.vision ??
    (input.visionConfig?.apiKey ? createOpenAIVisionProvider(input.visionConfig) : manualVisionProvider);
  const search =
    input.providers?.search ??
    (input.visionConfig?.apiKey ? createOpenAISearchProvider(input.visionConfig) : mockSearchProvider);
  const metadataProvider = input.providers?.metadata ?? exifMetadataProvider;
  const metadataPaths = input.image.sourcePaths?.length ? input.image.sourcePaths : [input.image.originalPath];
  const metadataEvidence = await metadataProvider
    .extractMetadata({ mediaPaths: metadataPaths })
    .catch((error) => {
      throw withStageMessage(error, "原图元数据检查");
    });
  const evidencePaths = input.image.evidencePaths?.length
    ? input.image.evidencePaths
    : [input.image.cropPath ?? input.image.originalPath];
  const imagePath = evidencePaths[0];
  const extractedClues = await extractCluesFromEvidencePaths({
    vision,
    imagePaths: evidencePaths,
    userScope: input.userScope,
    manualClues: input.manualClues,
    visionConfig: input.visionConfig
  }).catch((error) => {
    throw withStageMessage(error, "视觉模型识别");
  });
  const mapFeatureProfile = buildMapFeatureProfile(input.userScope, extractedClues);
  const searchQueries = buildSearchQueries(input.userScope, extractedClues);
  const searchProcess = buildSearchProcess(searchQueries, outputLanguage);
  const imageAnalysis = await analyzeImageForInvestigation({
    imagePath,
    outputLanguage,
    recognitionMode: input.visionConfig?.apiKey ? "vision-model" : "local-metadata",
    visionModelName: input.visionConfig?.model
  }).catch((error) => {
    throw withStageMessage(error, "分析摘要生成");
  });
  const seasonalAnalysis = buildSeasonalAnalysis({ userScope: input.userScope, outputLanguage });
  const searchCandidates = await search.findCandidates({
    userScope: input.userScope,
    clues: extractedClues,
    mapFeatureProfile,
    queries: searchQueries
  }).catch((error) => {
    throw withStageMessage(error, "候选坐标搜索");
  });
  const candidates = attachOsintLinks([...buildMetadataCandidates(metadataEvidence), ...searchCandidates]);
  const report = buildReports({
    outputLanguage,
    userScope: input.userScope,
    extractedClues,
    mapFeatureProfile,
    metadataEvidence,
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
    mapFeatureProfile,
    metadataEvidence,
    searchQueries,
    searchProcess,
    imageAnalysis,
    seasonalAnalysis,
    candidates,
    report
  };
}
