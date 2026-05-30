import sharp from "sharp";
import type { ImageAnalysis, OutputLanguage } from "../src/shared/types";

type AnalyzeImageArgs = {
  imagePath: string;
  imageBuffer?: Buffer;
  outputLanguage?: OutputLanguage;
};

function text(language: OutputLanguage, zh: string, en: string) {
  return language === "zh-CN" ? zh : en;
}

export async function analyzeImageForInvestigation({
  imagePath,
  imageBuffer,
  outputLanguage = "zh-CN"
}: AnalyzeImageArgs): Promise<ImageAnalysis> {
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
      recognitionMode: "local-metadata",
      observations: [
        text(outputLanguage, `自动读取图片尺寸：${width} x ${height}，${orientation}。`, `Image size: ${width} x ${height}, ${orientation}.`),
        text(
          outputLanguage,
          "本地版已把图片结构作为自动识别证据；OCR、地物语义和军事/交通设施识别需要视觉模型增强。",
          "The local version records image structure as automatic evidence; OCR, semantic landmarks, and facility recognition need a vision model."
        )
      ],
      limitations: [
        text(
          outputLanguage,
          "未配置视觉模型时，系统不会伪造 OCR 或地物结论，会把这部分标为待模型识别或人工补充。",
          "Without a configured vision model, the system will not invent OCR or landmark conclusions; those remain model or manual inputs."
        )
      ]
    };
  } catch {
    return {
      recognitionMode: "local-metadata",
      observations: [
        text(outputLanguage, `已接收图片：${imagePath}`, `Received image: ${imagePath}`)
      ],
      limitations: [
        text(
          outputLanguage,
          "无法读取图片元数据；仍可基于用户范围和手动线索生成候选与核验清单。",
          "Image metadata could not be read; candidates and verification checks can still be generated from scope and manual clues."
        )
      ]
    };
  }
}
