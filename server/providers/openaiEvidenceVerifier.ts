import OpenAI from "openai";
import type { Confidence, FeatureMatchAiVerification, VisionModelConfig } from "../../src/shared/types";

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

export type EvidenceVerificationRequest = {
  candidateName?: string;
  coordinates?: string;
  imageFeature: string;
  mapFeature: string;
  verification: string;
  imageAnnotation?: string;
  mapAnnotation?: string;
  evidenceLink?: string;
  earthImageDate?: string;
  originalImageDataUrl?: string;
  mapImageDataUrl?: string;
};

type CreateOpenAIEvidenceVerifierOptions = VisionModelConfig & {
  baseUrl?: string;
  clientFactory?: (options: OpenAIClientOptions) => OpenAICompatibleClient;
};

const verificationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["supports", "contradicts", "inconclusive"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    rationale: { type: "string" }
  },
  required: ["status", "confidence", "rationale"]
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value: unknown): FeatureMatchAiVerification["status"] {
  return value === "supports" || value === "contradicts" || value === "inconclusive" ? value : "inconclusive";
}

function normalizeConfidence(value: unknown): Confidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function parseVerification(content: string | null | undefined, model: string): FeatureMatchAiVerification {
  if (!content) {
    return {
      status: "inconclusive",
      confidence: "low",
      rationale: "模型没有给出可用的证据核验理由。",
      model
    };
  }

  try {
    const parsed = JSON.parse(content) as Partial<FeatureMatchAiVerification>;
    return {
      status: normalizeStatus(parsed.status),
      confidence: normalizeConfidence(parsed.confidence),
      rationale: cleanString(parsed.rationale) || "模型没有给出可用的证据核验理由。",
      model
    };
  } catch (error) {
    throw new Error("AI 证据核验返回的结构化结果不是有效 JSON。", { cause: error });
  }
}

function buildPrompt(request: EvidenceVerificationRequest) {
  return [
    "请核验一条图像地理定位证据对应关系。只返回 JSON，不要输出 Markdown。",
    "",
    "判断标准：",
    "- supports：地图/Google Earth 截图或文字证据清楚支持原图特征与候选地物的形状、颜色、方位或相对位置关系。",
    "- contradicts：候选地物与原图特征出现明显冲突，例如方向、相邻关系、形状、道路/建筑位置关系不一致。",
    "- inconclusive：截图缺失、可见信息不足、只有坐标/链接/泛泛描述，或需要人工进一步核验。",
    "",
    "严格限制：",
    "- 不要利用训练图下半部分、标注答案或任何外部答案来反推坐标。",
    "- 不要从坐标本身推断真假；坐标只用于理解候选点上下文。",
    "- 不要把台标、水印、字幕条或来源文字当作地图物理匹配证据。",
    "- 只有当原图与地图/Earth 的对应地物在可见证据中能对上时，才给 supports。",
    "",
    "候选信息：",
    `候选名称：${request.candidateName?.trim() || "未提供"}`,
    `候选坐标：${request.coordinates?.trim() || "未提供"}`,
    `证据链接：${request.evidenceLink?.trim() || "未提供"}`,
    `Earth/地图影像日期：${request.earthImageDate?.trim() || "未提供"}`,
    "",
    "待核验对应关系：",
    `原图特征：${request.imageFeature}`,
    `地图/Earth 对应地物：${request.mapFeature}`,
    `核验动作：${request.verification}`,
    `原图标注说明：${request.imageAnnotation?.trim() || "未提供"}`,
    `地图标注说明：${request.mapAnnotation?.trim() || "未提供"}`
  ].join("\n");
}

export function createOpenAIEvidenceVerifier(options: CreateOpenAIEvidenceVerifierOptions) {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error("AI 证据核验 API Key 不能为空。");
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
    async verify(request: EvidenceVerificationRequest): Promise<FeatureMatchAiVerification> {
      const content: Array<
        | {
            type: "text";
            text: string;
          }
        | {
            type: "image_url";
            image_url: {
              url: string;
              detail: "high";
            };
          }
      > = [{ type: "text", text: buildPrompt(request) }];

      if (request.originalImageDataUrl?.trim()) {
        content.push({
          type: "image_url",
          image_url: {
            url: request.originalImageDataUrl.trim(),
            detail: "high"
          }
        });
      }

      if (request.mapImageDataUrl?.trim()) {
        content.push({
          type: "image_url",
          image_url: {
            url: request.mapImageDataUrl.trim(),
            detail: "high"
          }
        });
      }

      const response = await client.chat.completions.create({
        model,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "geo_evidence_verification",
            strict: true,
            schema: verificationSchema
          }
        },
        messages: [
          {
            role: "system",
            content:
              "You are a conservative geolocation evidence verifier. Compare only the provided original image, map/Earth screenshot, and written evidence. Do not discover or infer coordinates. Return JSON only."
          },
          {
            role: "user",
            content
          }
        ]
      });

      return parseVerification(response.choices?.[0]?.message?.content, model);
    }
  };
}
