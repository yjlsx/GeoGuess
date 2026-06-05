import sharp from "sharp";
import type { ImageAnalysis, OutputLanguage } from "../src/shared/types";

type AnalyzeImageArgs = {
  imagePath: string;
  imageBuffer?: Buffer;
  outputLanguage?: OutputLanguage;
  recognitionMode?: ImageAnalysis["recognitionMode"];
  visionModelName?: string;
};

function text(language: OutputLanguage, zh: string, en: string) {
  return language === "zh-CN" ? zh : en;
}

export async function analyzeImageForInvestigation({
  imagePath,
  imageBuffer,
  outputLanguage = "zh-CN",
  recognitionMode = "local-metadata",
  visionModelName
}: AnalyzeImageArgs): Promise<ImageAnalysis> {
  const modelObservation = text(
    outputLanguage,
    `视觉模型已启用：${visionModelName?.trim() || "自定义模型"}，用于 OCR、地物语义和军事/交通设施识别。`,
    `Vision model enabled: ${visionModelName?.trim() || "custom model"} for OCR, semantic landmarks, and facility recognition.`
  );
  const localOnlyObservation = text(
    outputLanguage,
    "本地版已把图片结构作为自动识别证据；OCR、地物语义和军事/交通设施识别需要视觉模型增强。",
    "The local version records image structure as automatic evidence; OCR, semantic landmarks, and facility recognition need a vision model."
  );
  const limitations =
    recognitionMode === "vision-model"
      ? [
          text(
            outputLanguage,
            "视觉模型输出仍需用 Google Maps/Earth 卫星图像和历史影像逐项核验，不能直接当作最终坐标证明。",
            "Vision model outputs still need item-by-item verification in Google Maps/Earth satellite and historical imagery; they are not final coordinate proof."
          )
        ]
      : [
          text(
            outputLanguage,
            "未配置视觉模型时，系统不会伪造 OCR 或地物结论，会把这部分标为待模型识别或人工补充。",
            "Without a configured vision model, the system will not invent OCR or landmark conclusions; those remain model or manual inputs."
          )
        ];

  try {
    const metadata = await sharp(imageBuffer ?? imagePath).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const orientation =
      width && height
        ? width > height
          ? text(outputLanguage, "横向画面", "landscape frame")
          : width < height
            ? text(outputLanguage, "纵向画面", "portrait frame")
            : text(outputLanguage, "方形画面", "square frame")
        : text(outputLanguage, "未知画幅", "unknown frame shape");

    return {
      recognitionMode,
      observations: [
        text(outputLanguage, `自动读取图片尺寸：${width} x ${height}，${orientation}。`, `Image size: ${width} x ${height}, ${orientation}.`),
        recognitionMode === "vision-model" ? modelObservation : localOnlyObservation
      ],
      limitations
    };
  } catch {
    return {
      recognitionMode,
      observations: [
        text(outputLanguage, `已接收图片：${imagePath}`, `Received image: ${imagePath}`),
        recognitionMode === "vision-model" ? modelObservation : localOnlyObservation
      ],
      limitations
    };
  }
}
