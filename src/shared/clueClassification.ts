export function cleanClueText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function mediaSourceLabel(value: string) {
  const text = cleanClueText(value);
  const lower = text.toLocaleLowerCase();

  const cctvNumber = lower.match(/\bcctv\s*[-]?\s*(\d+)\b/);
  if (cctvNumber) {
    return `CCTV ${cctvNumber[1]}`;
  }
  if (/\bcctv\.com\b/i.test(text)) {
    return "CCTV.com";
  }
  if (/^cctv$/i.test(text)) {
    return "CCTV";
  }
  if (text.includes("央视")) {
    return "央视";
  }
  if (text.includes("国防军事")) {
    return "国防军事";
  }

  return undefined;
}

export function isKnownMediaSource(value: string) {
  return Boolean(mediaSourceLabel(value));
}

export function hasMapVerifiableWord(value: string) {
  const english =
    /\b(?:buildings?|roofs?|walls?|fences?|gates?|flowerbeds?|flowers?|beds?|poles?|utility|utilities|platforms?|stations?|roads?|tracks?|rails?|railways?|yards?|depots?|towers?|fields?|grounds?|grass|grasslands?|trees?|waters?|rivers?|mountains?|shadows?|bridges?|intersections?|runways?|hangars?|warehouses?|parking|courtyards?|harbou?rs?|ports?|coasts?|shores?|canals?|chimneys?|smokestacks?|stadiums?|sports|solar|greenhouses?|slopes?|ridges?|valleys?)\b/i;
  const chinese =
    /(屋顶|围墙|墙|门岗|大门|花坛|电线杆|灯杆|站台|道路|路口|轨道|铁路|建筑|操场|训练场|停车场|仓库|塔|烟囱|桥|机场|跑道|机库|港口|码头|海岸|河道|水体|河|山|山坡|山脊|树林|农田|草原|草地|阴影|朝向)/;
  return english.test(value) || chinese.test(value);
}

export function isMediaOverlayOnly(value: string) {
  const text = cleanClueText(value);
  const hasOverlayWord =
    /(watermark|channel bug|broadcast bug|logo bug|news ticker|ticker|subtitle|caption bar|timecode|timestamp|date stamp|screen graphic|on-screen graphic|overlay)/i.test(
      text
    ) || /(台标|水印|频道标识|角标|字幕条|新闻条|时间戳|日期戳|画面叠字|屏幕图形|贴片)/.test(text);
  if (!hasOverlayWord) {
    return false;
  }

  const hasOverlayPositionOrGraphicWord =
    /(corner|lower|upper|top|bottom|left|right|screen|overlay|bug|ticker|subtitle|caption|timestamp|timecode|角|左上|右上|左下|右下|屏幕|画面|字幕|水印|台标|时间戳)/i.test(
      text
    );

  return !hasMapVerifiableWord(text) || hasOverlayPositionOrGraphicWord;
}

export function sourceOnlyLabel(value: string) {
  return mediaSourceLabel(value) ?? (isMediaOverlayOnly(value) ? cleanClueText(value) : undefined);
}

export function isSourceOnlyClue(value: string) {
  const media = mediaSourceLabel(value);
  if (media) {
    return !hasMapVerifiableWord(value);
  }

  return isMediaOverlayOnly(value);
}
