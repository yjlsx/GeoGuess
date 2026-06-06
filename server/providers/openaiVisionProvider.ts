import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import OpenAI from "openai";
import type { ExtractedClues, UserScope, VisionModelConfig } from "../../src/shared/types";
import type { VisionProvider } from "./types";

type OpenAIClientOptions = {
  apiKey: string;
  baseURL?: string;
};

type OpenAICompatibleClient = {
  chat: {
    completions: {
      create: (input: unknown) => Promise<{
        choices?: Array<{
          message?: {
            content?: string | null;
          };
        }>;
      }>;
    };
  };
};

type CreateOpenAIVisionProviderOptions = VisionModelConfig & {
  baseUrl?: string;
  clientFactory?: (options: OpenAIClientOptions) => OpenAICompatibleClient;
};

const emptyClues: ExtractedClues = {
  ocrText: [],
  visibleLabels: [],
  languages: [],
  sceneFeatures: [],
  spatialRelationships: [],
  inferredSearchTerms: []
};

const clueSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ocrText: { type: "array", items: { type: "string" } },
    visibleLabels: { type: "array", items: { type: "string" } },
    languages: { type: "array", items: { type: "string" } },
    sceneFeatures: { type: "array", items: { type: "string" } },
    spatialRelationships: { type: "array", items: { type: "string" } },
    inferredSearchTerms: { type: "array", items: { type: "string" } }
  },
  required: ["ocrText", "visibleLabels", "languages", "sceneFeatures", "spatialRelationships", "inferredSearchTerms"]
};

function mimeTypeForPath(imagePath: string) {
  const extension = extname(imagePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function dedupeAndLimit(items: string[], limit: number) {
  return [...new Set(items.map((item) => item.trim().replace(/\s+/g, " ")).filter(Boolean))].slice(0, limit);
}

function normalizeClues(value: unknown): ExtractedClues {
  const source = value && typeof value === "object" ? (value as Partial<Record<keyof ExtractedClues, unknown>>) : {};
  return {
    ocrText: dedupeAndLimit(cleanList(source.ocrText), 16),
    visibleLabels: dedupeAndLimit(cleanList(source.visibleLabels), 12),
    languages: dedupeAndLimit(cleanList(source.languages), 6),
    sceneFeatures: dedupeAndLimit(cleanList(source.sceneFeatures), 18),
    spatialRelationships: dedupeAndLimit(cleanList(source.spatialRelationships), 16),
    inferredSearchTerms: dedupeAndLimit(cleanList(source.inferredSearchTerms), 14)
  };
}

function mergeLists(first: string[], second: string[]) {
  return [...new Set([...first, ...second].map((item) => item.trim()).filter(Boolean))];
}

function mergeClues(modelClues: ExtractedClues, manualClues?: ExtractedClues): ExtractedClues {
  if (!manualClues) {
    return modelClues;
  }

  return {
    ocrText: mergeLists(modelClues.ocrText, manualClues.ocrText),
    visibleLabels: mergeLists(modelClues.visibleLabels, manualClues.visibleLabels),
    languages: mergeLists(modelClues.languages, manualClues.languages),
    sceneFeatures: mergeLists(modelClues.sceneFeatures, manualClues.sceneFeatures),
    spatialRelationships: mergeLists(modelClues.spatialRelationships, manualClues.spatialRelationships),
    inferredSearchTerms: mergeLists(modelClues.inferredSearchTerms, manualClues.inferredSearchTerms)
  };
}

function buildScopeText(userScope: UserScope) {
  const entries = Object.entries(userScope)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([key, value]) => `${key}: ${value}`);
  return entries.length ? entries.join("\n") : "No user scope provided.";
}

function parseModelContent(content: string | null | undefined): ExtractedClues {
  if (!content) {
    return emptyClues;
  }

  try {
    return normalizeClues(JSON.parse(content));
  } catch (error) {
    throw new Error("视觉模型返回的结构化线索不是有效 JSON。", { cause: error });
  }
}

function buildPrompt(scopeText: string) {
  return [
    "请从图片中提取可用于地图定位的线索。输出必须是 JSON schema 对应字段，不要输出 Markdown。",
    "",
    "目标：提高候选坐标搜索的准确度。请把画面拆成可在地图、卫星图、街景或公开视频中核验的证据，而不是泛泛描述。",
    "",
    "请优先提取：",
    "1. 固定物理特征：建筑体量/层数/屋顶颜色/屋顶形状、围墙、门岗、花坛、操场、跑道、停车场、仓库、塔、烟囱、桥、河道、山体、水体、海岸线、农田、树林。",
    "2. 交通与设施：道路宽度、交叉口形态、铁路/站台/轨道、机场跑道、港口、码头、输电塔、电线杆、路灯、摄像头杆、标志牌。",
    "3. 空间关系：左/右/前/后/远/近、道路与建筑夹角、轨道与站台方向、山/水/建筑在画面中的相对位置、阴影方向、相机视角。",
    "4. OCR 与文字：完整抄录可见文字；如果文字可能是台标、节目名、来源网站或水印，请仍放入 ocrText/visibleLabels，但不要把它当作主定位证据。",
    "5. 搜索词：inferredSearchTerms 要组合 地点范围 + 设施类型 + 物理特征 + 文字线索。避免只输出 CCTV、央视、新闻、视频来源这类词。",
    "",
    "严格限制：",
    "- 不要凭感觉猜测国家、城市、单位名称或坐标。只有画面直接显示或由用户范围约束明确支持时才写。",
    "- 军事、交通、政府或企业设施只能用通用描述，除非画面文字明确给出名称。",
    "- 如果某项不确定，用保守描述，例如 'possible rail platform'、'疑似训练场开阔地'。",
    "- sceneFeatures 写具体可核验物体；spatialRelationships 写相对位置和视角；inferredSearchTerms 写适合联网搜索的组合词。",
    "",
    "用户已知范围：",
    scopeText
  ].join("\n");
}

export function createOpenAIVisionProvider(options: CreateOpenAIVisionProviderOptions): VisionProvider {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error("视觉模型 API Key 不能为空。");
  }

  const clientFactory =
    options.clientFactory ??
    ((clientOptions: OpenAIClientOptions) => new OpenAI(clientOptions) as unknown as OpenAICompatibleClient);
  const client = clientFactory({
    apiKey,
    baseURL: options.baseUrl?.trim() || process.env.OPENAI_BASE_URL?.trim() || undefined
  });
  const model = options.model?.trim() || "gpt-4o";

  return {
    async extractClues(request) {
      const imageBytes = await readFile(request.imagePath);
      const imageUrl = `data:${mimeTypeForPath(request.imagePath)};base64,${imageBytes.toString("base64")}`;
      const response = await client.chat.completions.create({
        model,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "image_geo_clues",
            strict: true,
            schema: clueSchema
          }
        },
        messages: [
          {
            role: "system",
            content:
              "You are a conservative image geolocation evidence extractor. Extract only visible or strongly image-supported clues. Prioritize map-verifiable physical features, spatial geometry, OCR, and source-traceback clues. Never invent coordinates, names, units, identities, or places. Separate media/source artifacts from true location evidence."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildPrompt(buildScopeText(request.userScope))
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "high"
                }
              }
            ]
          }
        ]
      });
      const modelClues = parseModelContent(response.choices?.[0]?.message?.content);
      return mergeClues(modelClues, request.manualClues);
    }
  };
}
