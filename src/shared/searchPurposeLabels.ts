import type { OutputLanguage } from "./types";

const labels: Record<OutputLanguage, Record<string, string>> = {
  "zh-CN": {
    "source-traceback": "来源反查",
    "source-visual-crosscheck": "来源/视觉交叉核验",
    "visual-feature-bundle": "视觉特征集合",
    "map-imagery-verification": "地图影像核验",
    "viewpoint-geometry": "视角几何核验",
    "physical-feature-combination": "物理特征组合",
    "visual-inferred-term": "视觉推断词",
    "ocr-visual-context": "OCR/视觉上下文",
    "scope-source-facility": "范围/来源/设施",
    "ocr-scope": "OCR/范围",
    "inferred-term": "推断搜索词"
  },
  "en-US": {
    "source-traceback": "source traceback",
    "source-visual-crosscheck": "source/visual cross-check",
    "visual-feature-bundle": "visual feature bundle",
    "map-imagery-verification": "map imagery verification",
    "viewpoint-geometry": "viewpoint geometry verification",
    "physical-feature-combination": "physical feature combination",
    "visual-inferred-term": "visual inferred term",
    "ocr-visual-context": "OCR with visual context",
    "scope-source-facility": "scope/source/facility",
    "ocr-scope": "OCR/scope",
    "inferred-term": "inferred term"
  }
};

export function searchPurposeLabel(purpose: string, language: OutputLanguage) {
  return labels[language][purpose] ?? purpose;
}
