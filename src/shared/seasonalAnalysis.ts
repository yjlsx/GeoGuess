import type { Confidence, OutputLanguage, SeasonalAnalysis, UserScope } from "./types";

type Args = {
  userScope: UserScope;
  outputLanguage?: OutputLanguage;
};

function extractMonth(value?: string) {
  if (!value) {
    return undefined;
  }

  const numeric = value.match(/(?:19|20)\d{2}[-/.年\s]*(0?[1-9]|1[0-2])(?:[-/.月\s]|$)/);
  if (numeric) {
    return Number(numeric[1]);
  }

  const monthNames: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12
  };
  const lower = value.toLowerCase();
  const found = Object.entries(monthNames).find(([name]) => lower.includes(name));
  return found?.[1];
}

function northernSeason(month: number, language: OutputLanguage) {
  const zh = language === "zh-CN";
  if ([3, 4, 5].includes(month)) return zh ? "春季" : "spring";
  if ([6, 7, 8].includes(month)) return zh ? "夏季" : "summer";
  if ([9, 10, 11].includes(month)) return zh ? "秋季" : "autumn";
  return zh ? "冬季" : "winter";
}

function text(language: OutputLanguage, zh: string, en: string) {
  return language === "zh-CN" ? zh : en;
}

export function buildSeasonalAnalysis({ userScope, outputLanguage = "zh-CN" }: Args): SeasonalAnalysis {
  const captureDateHint = userScope.dateOrTimeHint?.trim() ?? "";
  const month = extractMonth(captureDateHint);
  const confidence: Confidence = month ? "medium" : "low";

  if (!month) {
    return {
      captureDateHint,
      inferredSeason: text(outputLanguage, "日期不足，无法可靠判断季节", "insufficient date detail"),
      confidence,
      reasoning: [
        text(
          outputLanguage,
          captureDateHint
            ? `时间提示“${captureDateHint}”没有明确月份，不能只凭年份可靠判断季节。`
            : "没有提供拍摄日期或月份，季节判断只能作为待核验项。",
          captureDateHint
            ? `The date hint "${captureDateHint}" does not include a clear month, so season cannot be inferred reliably.`
            : "No capture date or month was provided, so season remains a verification item."
        )
      ],
      mapComparisonNotes: [
        text(
          outputLanguage,
          "在 Google Earth 中打开历史影像后，优先找与视频发布时间或截图出处最接近的月份。",
          "Open historical imagery in Google Earth and start with imagery closest to the video publication or source date."
        )
      ]
    };
  }

  const season = northernSeason(month, outputLanguage);
  return {
    captureDateHint,
    inferredSeason: season,
    confidence,
    reasoning: [
      text(
        outputLanguage,
        `日期提示 ${captureDateHint} 对应北半球${season}，候选地植被颜色、裸地范围和积雪情况应按这一季节核验。`,
        `The date hint ${captureDateHint} maps to northern hemisphere ${season}; vegetation color, bare ground, and snow cover should be checked against that season.`
      )
    ],
    mapComparisonNotes: [
      text(
        outputLanguage,
        `在 Google Earth 历史影像中优先对比${season}或相邻月份的影像，不要只用最新卫星图下结论。`,
        `In Google Earth historical imagery, prioritize ${season} or adjacent-month imagery instead of relying only on the latest satellite view.`
      )
    ]
  };
}
