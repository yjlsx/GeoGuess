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

function normalizeClues(value: unknown): ExtractedClues {
  const source = value && typeof value === "object" ? (value as Partial<Record<keyof ExtractedClues, unknown>>) : {};
  return {
    ocrText: cleanList(source.ocrText),
    visibleLabels: cleanList(source.visibleLabels),
    languages: cleanList(source.languages),
    sceneFeatures: cleanList(source.sceneFeatures),
    spatialRelationships: cleanList(source.spatialRelationships),
    inferredSearchTerms: cleanList(source.inferredSearchTerms)
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
    baseURL: options.baseUrl?.trim() || undefined
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
              "You extract geolocation evidence from images. Prioritize map-verifiable physical features and spatial relationships over media logos or source text. Return only visible or reasonably inferred clues. Do not invent coordinates, place names, or identities. Describe military and transport facilities generically unless a visible label proves the name."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `请从图片中提取可用于地图定位的线索。请优先描述可在卫星图、地图、街景或公开视频中核验的物理特征集合：建筑外形和屋顶颜色、围墙、花坛、电线杆/灯杆、站台、道路或轨道、开阔地、山体/水体、阴影方向、相机视角、各地物的左右/前后/远近关系。OCR、CCTV7、CCTV.com、媒体台标或节目来源只能作为辅助线索，不要把它们当作主要定位证据。inferredSearchTerms 应尽量组合物理特征和空间关系，而不是只输出媒体来源词。\n\n用户已知范围：\n${buildScopeText(request.userScope)}`
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
