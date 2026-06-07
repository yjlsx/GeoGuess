import {
  buildGoogleEarthHint,
  buildGoogleEarthWebUrl,
  buildGoogleMapsEmbedUrl,
  buildGoogleMapsLink
} from "../../src/shared/mapLinks";
import { hasMapVerifiableWord } from "../../src/shared/clueClassification";
import { normalizeCoordinateToWgs84 } from "../../src/shared/coordinateSystems";
import { scoreAndRankCandidates } from "../../src/shared/candidateScoring";
import type { Candidate, Confidence, FeatureMatch, SourceEvidence, VisionModelConfig } from "../../src/shared/types";
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
  retryDelayMs?: number;
};

type CandidateResponse = {
  candidates?: unknown[];
};

type SearchMode = "strict" | "broad";
type SearchRequestOptions = {
  webSearchEnabled: boolean;
  attempts?: number;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

const transientHttpStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const defaultRetryAttempts = 3;
const defaultRetryDelayMs = 700;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function wait(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseUpstreamErrorMessage(text: string) {
  const jsonStart = text.indexOf("{");
  if (jsonStart >= 0) {
    const jsonEnd = text.indexOf("}event:", jsonStart);
    const jsonText = jsonEnd >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text.slice(jsonStart);
    try {
      const parsed = JSON.parse(jsonText) as { error?: { message?: unknown; type?: unknown } };
      const message = typeof parsed.error?.message === "string" ? parsed.error.message.trim() : "";
      const type = typeof parsed.error?.type === "string" ? parsed.error.type.trim() : "";
      if (message || type) {
        return [message, type].filter(Boolean).join(" / ");
      }
    } catch {
      // Fall through to compact text below.
    }
  }

  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

function isTransientSearchFailure(status: number | undefined, text: string) {
  return (
    (typeof status === "number" && transientHttpStatuses.has(status)) ||
    /upstream_error|response\.failed|temporarily unavailable|timeout|timed out|rate limit/i.test(text)
  );
}

function buildSearchFailureMessage(args: { status?: number; statusText?: string; text: string; attempts: number; transient: boolean }) {
  const statusLabel = args.status ? `HTTP ${args.status}` : "网络请求异常";
  const upstreamMessage = parseUpstreamErrorMessage(args.text || args.statusText || "");
  if (args.transient) {
    const upstreamSummary = upstreamMessage ? `错误摘要：${upstreamMessage}。` : "";
    return [
      `联网候选搜索暂时不可用（${statusLabel}）。`,
      `系统已自动重试 ${args.attempts} 次，仍未收到可用结果。`,
      upstreamSummary,
      "这通常是模型服务或你配置的 Base URL 上游临时失败；可以稍后重试，或在右上角设置里切换模型或 Base URL。"
    ].join("");
  }

  return `联网候选搜索失败（${statusLabel}）：${upstreamMessage || args.statusText || "unknown error"}`;
}

class SearchHttpError extends Error {
  constructor(
    readonly status: number | undefined,
    readonly statusText: string | undefined,
    readonly bodyText: string,
    readonly transient: boolean,
    attempts: number
  ) {
    super(buildSearchFailureMessage({ status, statusText, text: bodyText, attempts, transient }));
    this.name = "SearchHttpError";
  }
}

function shouldAttemptModelOnlyFallback(error: unknown) {
  if (!(error instanceof SearchHttpError) || !error.transient) {
    return false;
  }
  return typeof error.status === "number" || /upstream_error|response\.failed|web[_ -]?search|tool/i.test(error.bodyText);
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

function parseCandidateJson(outputText: string): CandidateResponse {
  if (!outputText) {
    return { candidates: [] };
  }
  const trimmed = outputText.trim();
  const fencedJson = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fencedJson ? fencedJson[1] : trimmed;

  try {
    return JSON.parse(jsonText) as CandidateResponse;
  } catch (error) {
    throw new Error("联网候选搜索返回的结构化坐标不是有效 JSON。", { cause: error });
  }
}

function parseCandidateResponse(response: unknown): CandidateResponse {
  return parseCandidateJson(extractOutputText(response));
}

function extractChatCompletionText(response: unknown): string {
  if (!response || typeof response !== "object") {
    return "";
  }

  const body = response as ChatCompletionResponse;
  return (
    body.choices
      ?.map((choice) => (typeof choice.message?.content === "string" ? choice.message.content : ""))
      .filter(Boolean)
      .join("\n") ?? ""
  );
}

function parseChatCandidateResponse(response: unknown): CandidateResponse {
  return parseCandidateJson(extractChatCompletionText(response));
}

function evidenceSupportLevel(args: { sources: SourceEvidence[]; matchedFeatures: string[]; matchingEvidence: string[] }) {
  const sourceCount = args.sources.filter((source) => /^https?:\/\//i.test(source.url)).length;
  const featureCount = args.matchedFeatures.filter(hasMapVerifiableWord).length;
  const evidenceCount = args.matchingEvidence.length;
  const evidenceText = args.matchingEvidence.join(" ");
  const physicalEvidenceCount = featureCount + args.matchingEvidence.filter(hasMapVerifiableWord).length;
  const hasMapEvidence = /map|satellite|earth|street|imagery|地图|卫星|影像|街景|地球|公开|source|来源/i.test(evidenceText);

  if (sourceCount > 0 && physicalEvidenceCount >= 2 && hasMapEvidence) {
    return "source-supported";
  }
  if (sourceCount > 0 && physicalEvidenceCount >= 1) {
    return "source-linked-review";
  }
  if (physicalEvidenceCount >= 1) {
    return "unsourced-visual-lead";
  }
  return "weak-or-unsupported";
}

function cleanFeatureMatchStatus(value: unknown): FeatureMatch["status"] {
  return value === "matched" || value === "partial" || value === "unverified" || value === "mismatch" ? value : "unverified";
}

function cleanFeatureMatches(value: unknown): FeatureMatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const match = item as Partial<FeatureMatch>;
    const imageFeature = cleanString(match.imageFeature);
    const mapFeature = cleanString(match.mapFeature);
    const verification = cleanString(match.verification);
    if (!imageFeature || !mapFeature) {
      return [];
    }
    return [
      {
        imageFeature,
        mapFeature,
        verification: verification || "在 Google Maps/Earth 中人工对照该地物的形状、方位和相对位置。",
        status: cleanFeatureMatchStatus(match.status)
      }
    ];
  });
}

function buildFallbackFeatureMatches(args: {
  matchedFeatures: string[];
  matchingEvidence: string[];
  viewpointNotes: string[];
  checklist: string[];
}) {
  const sourceItems = args.matchedFeatures.length > 0 ? args.matchedFeatures : args.matchingEvidence;
  return sourceItems.slice(0, 4).map((feature, index): FeatureMatch => ({
    imageFeature: feature,
    mapFeature: args.matchingEvidence[index] ?? feature,
    verification:
      args.checklist[index] ??
      args.viewpointNotes[index] ??
      "在 Google Maps/Earth 中对比该地物的形状、颜色、相对方位和周边道路/建筑关系。",
    status: "unverified"
  }));
}

function normalizeCandidate(value: unknown, index: number, coordinateSystem: NonNullable<VisionModelConfig["coordinateSystem"]>): Candidate | null {
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
  const normalizedCoordinate = normalizeCoordinateToWgs84({ latitude, longitude }, coordinateSystem);
  const coordinateUncertainty = normalizedCoordinate.convertedFrom
    ? `${normalizedCoordinate.convertedFrom} 坐标已转换为 WGS84（EPSG:4326）用于 Google Maps/Earth 核验；请人工复核原始来源坐标口径。`
    : "";

  const name = cleanString(source.name);
  const matchingEvidence = cleanList(source.matchingEvidence);
  const uncertainty = cleanList(source.uncertainty);
  const earthVerificationChecklist = cleanList(source.earthVerificationChecklist);
  const matchedFeatures = cleanList(source.matchedFeatures);
  const missingOrUnverifiedFeatures = cleanList(source.missingOrUnverifiedFeatures);
  const viewpointNotes = cleanList(source.viewpointNotes);
  const sources = cleanSources(source.sources);
  const featureMatches = cleanFeatureMatches(source.featureMatches);
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
  if (coordinateUncertainty) {
    normalizedUncertainty.push(coordinateUncertainty);
  }
  const normalizedFeatureMatches =
    featureMatches.length > 0
      ? featureMatches
      : buildFallbackFeatureMatches({
          matchedFeatures: normalizedMatchedFeatures,
          matchingEvidence: normalizedMatchingEvidence,
          viewpointNotes,
          checklist: earthVerificationChecklist
        });

  return {
    id: `openai-candidate-${index + 1}`,
    name: name || undefined,
    latitude: normalizedCoordinate.latitude,
    longitude: normalizedCoordinate.longitude,
    confidence: supportLevel === "source-supported" ? cleanConfidence(source.confidence) : "low",
    matchScore: cleanScore(source.matchScore),
    matchedFeatures: normalizedMatchedFeatures,
    featureMatches: normalizedFeatureMatches,
    missingOrUnverifiedFeatures,
    viewpointNotes,
    mapLinks: {
      googleMaps: buildGoogleMapsLink(normalizedCoordinate.latitude, normalizedCoordinate.longitude),
      googleEarthHint: buildGoogleEarthHint(normalizedCoordinate.latitude, normalizedCoordinate.longitude)
    },
    mapPreview: {
      googleMapsEmbedUrl: buildGoogleMapsEmbedUrl(normalizedCoordinate.latitude, normalizedCoordinate.longitude),
      googleEarthWebUrl: buildGoogleEarthWebUrl(normalizedCoordinate.latitude, normalizedCoordinate.longitude),
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

function formatBoundaryNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function buildScopeConstraintLines(args: Parameters<SearchProvider["findCandidates"]>[0]) {
  const scope = args.userScope;
  if (scope.regionScope !== "custom") {
    return [];
  }

  const commonRules = [
    "- 搜索和候选生成必须优先落在用户自定义范围内。",
    "- 范围外候选只能作为低置信备选，并且必须在 uncertainty 中说明为什么越界仍值得人工复核。"
  ];

  if (scope.boundaryMode === "polygon" && scope.polygonCoordinates?.trim()) {
    return [
      "用户自定义多边形范围约束：",
      `多边形顶点（每行纬度, 经度）：${scope.polygonCoordinates.trim()}`,
      ...commonRules
    ];
  }

  if (scope.coordinateBox) {
    const box = scope.coordinateBox;
    const south = Math.min(box.minLat, box.maxLat);
    const north = Math.max(box.minLat, box.maxLat);
    const west = Math.min(box.minLon, box.maxLon);
    const east = Math.max(box.minLon, box.maxLon);
    return [
      "用户自定义矩形范围约束：",
      `南 ${formatBoundaryNumber(south)}，北 ${formatBoundaryNumber(north)}，西 ${formatBoundaryNumber(west)}，东 ${formatBoundaryNumber(east)}。`,
      ...commonRules
    ];
  }

  return [];
}

function buildPrompt(
  args: Parameters<SearchProvider["findCandidates"]>[0],
  mode: SearchMode,
  coordinateSystem: NonNullable<VisionModelConfig["coordinateSystem"]>,
  options?: { webSearchEnabled?: boolean }
) {
  const webSearchEnabled = options?.webSearchEnabled ?? true;
  const promptClues = {
    sceneFeatures: args.mapFeatureProfile.primaryFeatures,
    spatialRelationships: args.mapFeatureProfile.spatialRelationships,
    viewpointConstraints: args.mapFeatureProfile.viewpointConstraints,
    auxiliaryTextClues: args.mapFeatureProfile.auxiliaryTextClues,
    sourceOnlyClues: args.mapFeatureProfile.excludedSourceOnlyClues
  };
  const broadDiscovery =
    mode === "broad"
      ? [
          "",
          webSearchEnabled ? "扩大候选发现模式：" : "无联网工具候选生成模式：",
          webSearchEnabled
            ? "- 上一轮严格候选搜索没有返回坐标。现在请扩大搜索范围和关键词组合，寻找 3-5 个可人工复核的 low/medium 置信候选。"
            : "- 联网搜索工具或 Base URL 上游不可用。请仅基于已提取线索、用户范围和地图可核验特征，给出 1-5 个低/中置信人工复核候选。",
          webSearchEnabled
            ? "- 可以组合地物特征、空间关系、设施类型、地区范围和辅助文字线索进行多轮网络搜索。"
            : "- 这些候选不是已确认定位，必须标为需要人工地图核验；不要声称有公开来源支持。",
          "- 仍然不能把媒体来源词当作主要证据；候选必须至少有一个可在地图或来源中核验的物理特征。",
          webSearchEnabled ? "- 如果仍然没有任何可来源支撑的候选，才返回空 candidates。" : "- 如果线索不足以形成可人工检查的候选区域，才返回空 candidates。"
        ]
      : ["", "严格候选搜索模式：优先返回来源和地图特征共同支撑的候选坐标。"];

  return [
    webSearchEnabled
      ? "你是严谨的影像地理定位助手。请使用联网搜索寻找图片拍摄位置的候选经纬度。你的目标不是猜测坐标，而是建立可人工复核的公开来源证据链。"
      : "你是严谨的影像地理定位助手。当前没有联网搜索工具可用，请基于已提取线索和用户范围生成可人工地图复核的候选经纬度。你的目标不是确认坐标，而是给出审慎的复核起点。",
    "",
    "工作流要求：",
    "1. 先用 OCR、标题、节目水印、来源、日期和报道文字做来源反查，寻找原始新闻、转发稿、视频页或同标题材料。",
    "2. 再从来源线索中提取可能地点、单位、训练场、城市/地区或设施类型。",
    "3. 最后才生成候选坐标，并且候选必须绑定来源、物理特征、未确认点和人工地图核验清单。",
    "",
    "核心要求：",
    "- 主要依据可在地图/卫星图/街景/公开视频中核验的物理特征集合：建筑形状和颜色、围墙、花坛、电线杆、站台、道路或轨道、开阔地、山体/水体、阴影、相机视角和相对方位。",
    "- OCR、CCTV7、CCTV.com、媒体台标、节目来源只作为辅助线索，不能作为候选坐标的主要证据。",
    "- 如果原图/线索要求站台、建筑、道路、围墙、院落、营区、机场、仓库等人工设施，而候选卫星图只显示田地、农田、树林、森林、山坡、山体或空旷自然地貌，不要把它当作匹配候选；若作为低置信复核点保留，必须在 missingOrUnverifiedFeatures 和 uncertainty 中明确写出设施缺失/地貌错配。",
    "- 不要把坐标落在随机田地、山林或树木中间来替代缺失的设施；候选点应落在可见目标设施或其可解释的边界/入口/道路上。",
    "- 如果证据不足以给出坐标，返回空 candidates 数组，不要编造。",
    webSearchEnabled
      ? "- 如果有足够的地物组合但无法唯一确定，请返回 3-5 个 low/medium 低/中置信候选坐标，而不是只返回一个候选；每个候选必须可被来源或明确地图物理特征支撑。"
      : "- 如果有足够的地物组合但无法唯一确定，请返回 1-5 个 low/medium 低/中置信候选坐标，而不是空白；每个候选必须明确说明它只是人工复核线索。",
    "- 每个候选必须说明匹配了哪些物理特征、哪些地方不确定，以及 Google Earth/Maps 需要人工核验什么。",
    "- 为每个候选给出 matchScore 0-100、matchedFeatures、missingOrUnverifiedFeatures、viewpointNotes，用于候选排序和人工复核。",
    "- 为每个候选给出 featureMatches 数组，逐项描述“原图可见特征”与“地图/Earth 对应地物”的关系；这应类似训练图里的圈线标注，但用文字表达。",
    "- 只返回 JSON，不要 Markdown。",
    ...broadDiscovery,
    "",
    `用户已知范围：${JSON.stringify(args.userScope)}`,
    `候选坐标系统：${coordinateSystem}。请按该坐标系统返回 latitude/longitude；系统会在生成 Google Maps/Earth 链接前统一归一化为 WGS84。`,
    ...buildScopeConstraintLines(args),
    `视觉特征（已清洗，仅含地图可核验地物）：${JSON.stringify(promptClues.sceneFeatures)}`,
    `空间关系（已清洗，仅含地图可核验几何）：${JSON.stringify(promptClues.spatialRelationships)}`,
    `视角约束：${JSON.stringify(promptClues.viewpointConstraints)}`,
    `辅助文字线索（不能单独作为坐标证据）：${JSON.stringify(promptClues.auxiliaryTextClues)}`,
    `地图核验特征档案：${JSON.stringify(args.mapFeatureProfile)}`,
    `核心特征搜索指令：${args.mapFeatureProfile.searchInstruction}`,
    `排除为主要证据的来源/叠层词：${JSON.stringify(promptClues.sourceOnlyClues)}`,
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
          featureMatches: [
            {
              imageFeature: "feature visible in the original image",
              mapFeature: "corresponding map or Google Earth object",
              verification: "specific comparison action for Maps/Earth",
              status: "matched | partial | unverified | mismatch"
            }
          ],
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
  const coordinateSystem = options.coordinateSystem ?? "WGS84 (EPSG:4326)";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const retryDelayMs = options.retryDelayMs ?? defaultRetryDelayMs;
  if (!fetchImpl) {
    throw new Error("当前运行环境不支持 fetch，无法执行联网候选搜索。");
  }

  return {
    async findCandidates(args) {
      function normalizeAndRank(parsed: CandidateResponse) {
        const thresholdScore = Math.round((options.matchingThreshold ?? 0) * 100);
        const normalizedCandidates = (parsed.candidates ?? [])
          .map((candidate, index) => normalizeCandidate(candidate, index, coordinateSystem))
          .filter((candidate): candidate is Candidate => Boolean(candidate));
        const scoredCandidates = scoreAndRankCandidates(normalizedCandidates, {
          clues: args.clues,
          mapFeatureProfile: args.mapFeatureProfile,
          userScope: args.userScope,
          coordinateSystem
        });
        return keepThresholdMatchesOrReviewFallback(scoredCandidates, thresholdScore).slice(0, options.maxCandidates ?? 10);
      }

      async function requestResponses(mode: SearchMode, requestOptions: SearchRequestOptions) {
        let lastError: SearchHttpError | null = null;
        const maxAttempts = requestOptions.attempts ?? defaultRetryAttempts;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          let response: Awaited<ReturnType<FetchLike>>;
          try {
            const body = {
              model,
              ...(requestOptions.webSearchEnabled ? { tools: [{ type: "web_search_preview" }] } : {}),
              input: buildPrompt(args, mode, coordinateSystem, requestOptions)
            };
            response = await fetchImpl(`${baseUrl}/responses`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify(body)
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            lastError = new SearchHttpError(undefined, undefined, message, true, maxAttempts);
            if (attempt === maxAttempts) {
              throw lastError;
            }
            await wait(retryDelayMs * attempt);
            continue;
          }

          if (response.ok) {
            return response;
          }

          const text = response.text ? await response.text() : "";
          const transient = isTransientSearchFailure(response.status, text);
          lastError = new SearchHttpError(response.status, response.statusText, text, transient, maxAttempts);
          if (!transient || attempt === maxAttempts) {
            throw lastError;
          }
          await wait(retryDelayMs * attempt);
        }

        throw lastError ?? new Error("联网候选搜索失败：没有收到模型服务响应。");
      }

      async function fetchCandidates(mode: SearchMode, requestOptions: SearchRequestOptions = { webSearchEnabled: true }) {
        const response = await requestResponses(mode, requestOptions);
        return normalizeAndRank(parseCandidateResponse(await response.json()));
      }

      async function fetchChatFallbackCandidates() {
        const prompt = buildPrompt(args, "broad", coordinateSystem, { webSearchEnabled: false });
        let response: Awaited<ReturnType<FetchLike>>;
        try {
          response = await fetchImpl(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model,
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "system",
                  content:
                    "You are a conservative geolocation candidate generator. Return only JSON. Generate low-confidence manual review candidates only when map-verifiable physical clues support them."
                },
                {
                  role: "user",
                  content: prompt
                }
              ]
            })
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new SearchHttpError(undefined, undefined, message, true, 1);
        }

        if (!response.ok) {
          const text = response.text ? await response.text() : "";
          throw new SearchHttpError(response.status, response.statusText, text, isTransientSearchFailure(response.status, text), 1);
        }

        return normalizeAndRank(parseChatCandidateResponse(await response.json()));
      }

      try {
        const strictCandidates = await fetchCandidates("strict");
        if (strictCandidates.length > 0) {
          return strictCandidates;
        }

        return await fetchCandidates("broad");
      } catch (error) {
        if (shouldAttemptModelOnlyFallback(error)) {
          try {
            return await fetchCandidates("broad", { webSearchEnabled: false, attempts: 1 });
          } catch (fallbackError) {
            if (shouldAttemptModelOnlyFallback(fallbackError)) {
              try {
                return await fetchChatFallbackCandidates();
              } catch {
                throw error;
              }
            }
            throw error;
          }
        }
        throw error;
      }
    }
  };
}
