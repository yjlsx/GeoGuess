import {
  buildGoogleEarthHint,
  buildGoogleEarthWebUrl,
  buildGoogleMapsEmbedUrl,
  buildGoogleMapsLink
} from "../../src/shared/mapLinks";
import type { Candidate, Confidence, SourceEvidence, VisionModelConfig } from "../../src/shared/types";
import type { SearchProvider } from "./types";

type FetchLike = (url: string, init: RequestInit) => Promise<{
  ok: boolean;
  status?: number;
  statusText?: string;
  json(): Promise<unknown>;
  text?: () => Promise<string>;
}>;

type OpenAISearchProviderOptions = VisionModelConfig & {
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

type CandidateResponse = {
  candidates?: unknown[];
};

type SearchMode = "strict" | "broad";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(cleanString).filter(Boolean);
}

function cleanConfidence(value: unknown): Confidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cleanScore(value: unknown) {
  const score = cleanNumber(value);
  if (score === undefined) {
    return undefined;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function cleanSources(value: unknown): SourceEvidence[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const source = item as Partial<SourceEvidence>;
    const title = cleanString(source.title);
    const url = cleanString(source.url);
    const note = cleanString(source.note);
    if (!title || !url) {
      return [];
    }
    return [{ title, url, note }];
  });
}

function extractOutputText(response: unknown): string {
  if (!response || typeof response !== "object") {
    return "";
  }

  const body = response as {
    output_text?: unknown;
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: unknown;
      }>;
    }>;
  };

  if (typeof body.output_text === "string") {
    return body.output_text;
  }

  return (
    body.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => (typeof content.text === "string" ? content.text : ""))
      .filter(Boolean)
      .join("\n") ?? ""
  );
}

function parseCandidateResponse(response: unknown): CandidateResponse {
  const outputText = extractOutputText(response);
  if (!outputText) {
    return { candidates: [] };
  }

  try {
    return JSON.parse(outputText) as CandidateResponse;
  } catch (error) {
    throw new Error("联网候选搜索返回的结构化坐标不是有效 JSON。", { cause: error });
  }
}

function evidenceSupportLevel(args: { sources: SourceEvidence[]; matchedFeatures: string[]; matchingEvidence: string[] }) {
  const sourceCount = args.sources.filter((source) => /^https?:\/\//i.test(source.url)).length;
  const featureCount = args.matchedFeatures.length;
  const evidenceCount = args.matchingEvidence.length;
  const evidenceText = args.matchingEvidence.join(" ");
  const hasMapEvidence = /map|satellite|earth|street|imagery|地图|卫星|影像|街景|地球|公开|source|来源/i.test(evidenceText);

  if (sourceCount > 0 && featureCount >= 2 && hasMapEvidence) {
    return "source-supported";
  }
  if (sourceCount > 0 && (featureCount >= 1 || evidenceCount >= 1)) {
    return "source-linked-review";
  }
  if (featureCount >= 1 || evidenceCount >= 1) {
    return "unsourced-visual-lead";
  }
  return "weak-or-unsupported";
}

function normalizeCandidate(value: unknown, index: number): Candidate | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const latitude = cleanNumber(source.latitude);
  const longitude = cleanNumber(source.longitude);
  if (latitude === undefined || longitude === undefined) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  const name = cleanString(source.name);
  const matchingEvidence = cleanList(source.matchingEvidence);
  const uncertainty = cleanList(source.uncertainty);
  const earthVerificationChecklist = cleanList(source.earthVerificationChecklist);
  const matchedFeatures = cleanList(source.matchedFeatures);
  const missingOrUnverifiedFeatures = cleanList(source.missingOrUnverifiedFeatures);
  const viewpointNotes = cleanList(source.viewpointNotes);
  const sources = cleanSources(source.sources);
  const normalizedMatchedFeatures =
    matchedFeatures.length > 0 ? matchedFeatures : matchingEvidence.length > 0 ? matchingEvidence.slice(0, 3) : [];
  const normalizedMatchingEvidence =
    matchingEvidence.length > 0
      ? matchingEvidence
      : matchedFeatures.length > 0
        ? matchedFeatures.map((feature) => `待人工核验：${feature}`)
        : [];

  const supportLevel = evidenceSupportLevel({
    sources,
    matchedFeatures: normalizedMatchedFeatures,
    matchingEvidence: normalizedMatchingEvidence
  });

  const normalizedUncertainty = [...uncertainty];
  if (supportLevel === "weak-or-unsupported") {
    return null;
  }

  if (supportLevel === "unsourced-visual-lead") {
    normalizedUncertainty.push(
      "模型返回了候选坐标和物理特征，但未附可追溯来源链接；该点只能作为低置信视觉线索，必须先完成来源反查和地图人工核验。"
    );
  }
  if (supportLevel === "source-linked-review") {
    normalizedUncertainty.push("候选有来源或报道线索支撑，但地图/卫星图物理特征仍未完成自动核验，请按清单人工确认。");
  }

  return {
    id: `openai-candidate-${index + 1}`,
    name: name || undefined,
    latitude,
    longitude,
    confidence: supportLevel === "source-supported" ? cleanConfidence(source.confidence) : "low",
    matchScore: cleanScore(source.matchScore),
    matchedFeatures: normalizedMatchedFeatures,
    missingOrUnverifiedFeatures,
    viewpointNotes,
    mapLinks: {
      googleMaps: buildGoogleMapsLink(latitude, longitude),
      googleEarthHint: buildGoogleEarthHint(latitude, longitude)
    },
    mapPreview: {
      googleMapsEmbedUrl: buildGoogleMapsEmbedUrl(latitude, longitude),
      googleEarthWebUrl: buildGoogleEarthWebUrl(latitude, longitude),
      screenshotStatus:
        supportLevel === "source-supported"
          ? "候选坐标有来源和物理特征支撑；仍需人工对照卫星图、地物相对位置和历史影像后才能确认。"
          : "候选坐标尚未确认；当前仅生成地图入口和人工核验清单，不能视为已完成地理定位。",
      notes: [
        "优先核验建筑形状、屋顶颜色、围墙/花坛/电线杆/站台/道路或轨道的相对关系。",
        "媒体来源或台标只能作为辅助线索，不能单独证明坐标。"
      ]
    },
    matchingEvidence: normalizedMatchingEvidence,
    uncertainty: normalizedUncertainty,
    sources,
    earthVerificationChecklist
  };
}

function keepThresholdMatchesOrReviewFallback(candidates: Candidate[], thresholdScore: number) {
  if (thresholdScore <= 0) {
    return candidates;
  }

  const passingCandidates = candidates.filter((candidate) => (candidate.matchScore ?? 0) >= thresholdScore);
  return passingCandidates.length > 0 ? passingCandidates : candidates;
}

function buildPrompt(args: Parameters<SearchProvider["findCandidates"]>[0], mode: SearchMode) {
  const broadDiscovery =
    mode === "broad"
      ? [
          "",
          "扩大候选发现模式：",
          "- 上一轮严格候选搜索没有返回坐标。现在请扩大搜索范围和关键词组合，寻找 3-5 个可人工复核的 low/medium 置信候选。",
          "- 可以组合地物特征、空间关系、设施类型、地区范围和辅助文字线索进行多轮网络搜索。",
          "- 仍然不能把媒体来源词当作主要证据；候选必须至少有一个可在地图或来源中核验的物理特征。",
          "- 如果仍然没有任何可来源支撑的候选，才返回空 candidates。"
        ]
      : ["", "严格候选搜索模式：优先返回来源和地图特征共同支撑的候选坐标。"];

  return [
    "你是严谨的影像地理定位助手。请使用联网搜索寻找图片拍摄位置的候选经纬度。你的目标不是猜测坐标，而是建立可人工复核的公开来源证据链。",
    "",
    "工作流要求：",
    "1. 先用 OCR、标题、节目水印、来源、日期和报道文字做来源反查，寻找原始新闻、转发稿、视频页或同标题材料。",
    "2. 再从来源线索中提取可能地点、单位、训练场、城市/地区或设施类型。",
    "3. 最后才生成候选坐标，并且候选必须绑定来源、物理特征、未确认点和人工地图核验清单。",
    "",
    "核心要求：",
    "- 主要依据可在地图/卫星图/街景/公开视频中核验的物理特征集合：建筑形状和颜色、围墙、花坛、电线杆、站台、道路或轨道、开阔地、山体/水体、阴影、相机视角和相对方位。",
    "- OCR、CCTV7、CCTV.com、媒体台标、节目来源只作为辅助线索，不能作为候选坐标的主要证据。",
    "- 如果证据不足以给出坐标，返回空 candidates 数组，不要编造。",
    "- 如果有足够的地物组合但无法唯一确定，请返回 3-5 个 low/medium 低/中置信候选坐标，而不是只返回一个候选；每个候选必须可被来源或明确地图物理特征支撑。",
    "- 每个候选必须说明匹配了哪些物理特征、哪些地方不确定，以及 Google Earth/Maps 需要人工核验什么。",
    "- 为每个候选给出 matchScore 0-100、matchedFeatures、missingOrUnverifiedFeatures、viewpointNotes，用于候选排序和人工复核。",
    "- 只返回 JSON，不要 Markdown。",
    ...broadDiscovery,
    "",
    `用户已知范围：${JSON.stringify(args.userScope)}`,
    `视觉特征：${JSON.stringify(args.clues.sceneFeatures)}`,
    `空间关系：${JSON.stringify(args.clues.spatialRelationships)}`,
    `地图核验特征档案：${JSON.stringify(args.mapFeatureProfile)}`,
    `核心特征搜索指令：${args.mapFeatureProfile.searchInstruction}`,
    `排除为主要证据的来源词：${JSON.stringify(args.mapFeatureProfile.excludedSourceOnlyClues)}`,
    `OCR/标识辅助：${JSON.stringify({
      ocrText: args.clues.ocrText,
      visibleLabels: args.clues.visibleLabels,
      languages: args.clues.languages
    })}`,
    `计划查询：${JSON.stringify(args.queries.map((query) => ({ query: query.query, purpose: query.purpose })))}`,
    "",
    "返回格式：",
    JSON.stringify({
      candidates: [
        {
          name: "place name or short description",
          latitude: 0,
          longitude: 0,
          confidence: "high | medium | low",
          matchScore: 0,
          matchedFeatures: ["feature visibly matched on map/satellite imagery"],
          missingOrUnverifiedFeatures: ["feature not found or still unclear"],
          viewpointNotes: ["camera direction and relative geometry notes"],
          matchingEvidence: ["map-verifiable physical feature match"],
          uncertainty: ["what does not yet match or must be checked"],
          sources: [{ title: "source title", url: "https://...", note: "why this source matters" }],
          earthVerificationChecklist: ["specific Google Earth/Maps check"]
        }
      ]
    })
  ].join("\n");
}

export function createOpenAISearchProvider(options: OpenAISearchProviderOptions): SearchProvider {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error("联网候选搜索 API Key 不能为空。");
  }

  const baseUrl = (options.baseUrl?.trim() || process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = options.model?.trim() || "gpt-4o";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("当前运行环境不支持 fetch，无法执行联网候选搜索。");
  }

  return {
    async findCandidates(args) {
      async function fetchCandidates(mode: SearchMode) {
        const response = await fetchImpl(`${baseUrl}/responses`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            tools: [{ type: "web_search_preview" }],
            input: buildPrompt(args, mode)
          })
        });

        if (!response.ok) {
          const text = response.text ? await response.text() : "";
          throw new Error(
            `联网候选搜索失败（HTTP ${response.status ?? "unknown"}）：${text || response.statusText || "unknown error"}`
          );
        }

        const parsed = parseCandidateResponse(await response.json());
        const thresholdScore = Math.round((options.matchingThreshold ?? 0) * 100);
        const normalizedCandidates = (parsed.candidates ?? [])
          .map((candidate, index) => normalizeCandidate(candidate, index))
          .filter((candidate): candidate is Candidate => Boolean(candidate))
          .slice(0, options.maxCandidates ?? 10);
        return keepThresholdMatchesOrReviewFallback(normalizedCandidates, thresholdScore);
      }

      const strictCandidates = await fetchCandidates("strict");
      if (strictCandidates.length > 0) {
        return strictCandidates;
      }

      return fetchCandidates("broad");
    }
  };
}
