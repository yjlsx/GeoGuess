import { useEffect, useMemo, useState } from "react";
import type { Investigation } from "../shared/types";
import { formatCoordinate } from "../shared/mapLinks";

type Props = {
  assetMediaType?: string | null;
  assetName?: string | null;
  assetPreviewUrl?: string | null;
  exportStatus?: string | null;
  investigation: Investigation | null;
  loading: boolean;
  error: string | null;
  hasImage?: boolean;
  hasVisionKey?: boolean;
  analysisProgress?: number;
  analysisStartedAt?: number | null;
  analysisFinishedAt?: number | null;
  matchingThreshold?: number;
  modelName?: string | null;
  now?: number;
  onCopyReport?: () => void;
  onDownloadHtml?: () => void;
  onDownloadMarkdown?: () => void;
  onPrintReport?: () => void;
  onShowSample?: () => void;
};

type Candidate = Investigation["candidates"][number];
type CandidateReviewStatus = "pending" | "keep" | "excluded" | "confirmed";
type EvidenceTab = "canvas" | "ocr" | "visual" | "metadata" | "reasoning" | "map";
type CandidateFilterMode = "all" | "high" | "above-threshold" | "pending" | "keep" | "confirmed" | "excluded";
type ProcessStep = {
  title: string;
  detail: string;
  status?: "done" | "active" | "pending";
};

const reviewStatusLabels: Record<CandidateReviewStatus, string> = {
  pending: "待核验",
  keep: "已保留",
  excluded: "已排除",
  confirmed: "人工已确认"
};

const candidateFilterLabels: Record<CandidateFilterMode, string> = {
  all: "全部候选",
  high: "高置信",
  "above-threshold": "高于阈值",
  pending: "待核验",
  keep: "已保留",
  confirmed: "已确认",
  excluded: "已排除"
};

const candidateFilterModes: CandidateFilterMode[] = ["all", "high", "above-threshold", "pending", "keep", "confirmed", "excluded"];

function buildLoadingAnalysisSteps(progress: number) {
  const stages = [
    {
      title: "上传原图与素材",
      detail: "保存原始图片/视频，保留 EXIF 元数据，并生成用于视觉识别的分析图。",
      threshold: 12
    },
    {
      title: "原图元数据检查",
      detail: "读取 EXIF GPS、拍摄时间和相机信息；有 GPS 时直接加入候选。",
      threshold: 25
    },
    {
      title: "视觉模型识别",
      detail: "提取 OCR、建筑、屋顶、围墙、花坛、电线杆、站台、道路/轨道和视角关系。",
      threshold: 45
    },
    {
      title: "来源反查与候选搜索",
      detail: "先用 OCR/标题/来源线索查找公开材料，再生成带来源和地图核验清单的候选坐标。",
      threshold: 65
    },
    {
      title: "地图与 Earth 核验准备",
      detail: "为候选生成 Google Maps 卫星预览、Google Earth 入口和人工核验清单。",
      threshold: 80
    },
    {
      title: "等待模型返回与结果整理",
      detail: "模型请求完成前会停在此阶段；完成后才会进入 100% 并展示候选表或空结果原因。",
      threshold: 86
    }
  ];

  return stages.map((stage, index) => {
    const previousThreshold = stages[index - 1]?.threshold ?? 0;
    const status: ProcessStep["status"] = progress >= stage.threshold ? "done" : progress >= previousThreshold ? "active" : "pending";
    return {
      title: stage.title,
      detail: stage.detail,
      status
    };
  });
}

function confidenceWeight(confidence: Candidate["confidence"]) {
  if (confidence === "high") {
    return 3;
  }
  if (confidence === "medium") {
    return 2;
  }
  return 1;
}

function confidenceLabel(confidence: Investigation["candidates"][number]["confidence"]) {
  const labels = {
    high: "高置信",
    medium: "中置信",
    low: "低置信"
  };

  return labels[confidence] ?? confidence;
}

function candidateScoreLabel(candidate: Candidate | null | undefined) {
  if (!candidate) {
    return "--";
  }
  return typeof candidate.matchScore === "number" ? `${candidate.matchScore.toFixed(1)}%` : confidenceLabel(candidate.confidence);
}

function candidateScoreWidth(candidate: Candidate) {
  return `${Math.max(8, Math.min(100, candidate.matchScore ?? confidenceWeight(candidate.confidence) * 28))}%`;
}

function formatStatusDate(timestamp: number | null | undefined) {
  if (!timestamp) {
    return "--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(timestamp));
}

function formatElapsed(startedAt: number | null | undefined, finishedAt: number | null | undefined, now: number) {
  if (!startedAt) {
    return "--";
  }
  const elapsedSeconds = Math.max(0, Math.floor(((finishedAt ?? now) - startedAt) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function candidateMatchesFilter(
  candidate: Candidate,
  filterMode: CandidateFilterMode,
  reviewStatus: CandidateReviewStatus,
  thresholdScore: number
) {
  if (filterMode === "all") {
    return true;
  }
  if (filterMode === "high") {
    return candidate.confidence === "high" || (candidate.matchScore ?? 0) >= 80;
  }
  if (filterMode === "above-threshold") {
    return typeof candidate.matchScore === "number" ? candidate.matchScore >= thresholdScore : false;
  }
  return reviewStatus === filterMode;
}

function buildClueChips(investigation: Investigation | null, selectedCandidate: Candidate | undefined) {
  const candidateClues = selectedCandidate
    ? [
        ...(selectedCandidate.matchedFeatures ?? []),
        ...(selectedCandidate.viewpointNotes ?? [])
      ]
    : [];
  const investigationClues = investigation
    ? [
        ...investigation.extractedClues.ocrText.map((item) => `OCR：${item}`),
        ...investigation.extractedClues.visibleLabels.map((item) => `标识：${item}`),
        ...investigation.extractedClues.sceneFeatures,
        ...investigation.extractedClues.spatialRelationships
      ]
    : [];

  return uniqueItems([...candidateClues, ...investigationClues]).slice(0, 5);
}

function buildMetadataRows(investigation: Investigation | null, selectedCandidate: Candidate | undefined, assetName: string | null | undefined) {
  const metadata = investigation?.metadataEvidence?.[0];
  return [
    { label: "素材", value: assetName || (investigation ? investigation.image.originalPath.split(/[\\/]/).pop() : null) || "未上传" },
    { label: "时间", value: metadata?.capturedAt || investigation?.report.createdAt?.slice(0, 19).replace("T", " ") || "--" },
    { label: "相机", value: metadata?.camera || "待识别" },
    { label: "坐标", value: selectedCandidate ? formatCoordinate(selectedCandidate.latitude, selectedCandidate.longitude) : metadata?.gps ? formatCoordinate(metadata.gps.latitude, metadata.gps.longitude) : "--" },
    { label: "方向", value: selectedCandidate?.viewpointNotes?.[0] || "待核验" }
  ];
}

function buildColorSwatches(investigation: Investigation | null) {
  const features = investigation
    ? [
        ...investigation.extractedClues.sceneFeatures,
        ...investigation.mapFeatureProfile.primaryFeatures,
        ...investigation.mapFeatureProfile.spatialRelationships
      ].join(" ")
    : "";

  if (/草原|荒漠|裸地|铁路/.test(features)) {
    return ["#24335c", "#405f7c", "#9c8f7b", "#c8b99f", "#697e54", "#27382c", "#c75b35"];
  }
  if (/城市|楼|道路|站台|tower|urban/i.test(features)) {
    return ["#1c355f", "#2d5f8e", "#6d7d83", "#c9c2b6", "#7b8790", "#242b32", "#d85d35"];
  }
  return ["#17345d", "#244c82", "#54606b", "#d5c8b7", "#9c8a72", "#223328", "#5c7c55"];
}

const clueMarkerPositions = [
  { left: "36%", top: "28%" },
  { left: "48%", top: "42%" },
  { left: "57%", top: "61%" },
  { left: "18%", top: "58%" },
  { left: "78%", top: "55%" }
];

function renderList(items: string[], empty = "未提供") {
  if (items.length === 0) {
    return <p className="muted">{empty}</p>;
  }

  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function countSummary(count: number, unit: string) {
  return `${count} ${unit}`;
}

function distanceInKm(left: Candidate, right: Candidate) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const latitude1 = toRadians(left.latitude);
  const latitude2 = toRadians(right.latitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

function formatDistanceFromBest(candidate: Candidate, bestCandidate: Candidate | undefined) {
  if (!bestCandidate || candidate.id === bestCandidate.id) {
    return "—";
  }

  const distanceKm = distanceInKm(candidate, bestCandidate);
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(2)} km`;
}

function consistencyFromCandidate(candidate: Candidate, axis: "direction" | "terrain") {
  const combined = [
    ...(candidate.matchedFeatures ?? []),
    ...(candidate.missingOrUnverifiedFeatures ?? []),
    ...(candidate.viewpointNotes ?? [])
  ].join(" ");
  const score = candidate.matchScore ?? 0;

  if (/不匹配|排除|相反|conflict/i.test(combined) || score < 35) {
    return { label: "不一致", tone: "bad" };
  }
  if (/待核验|部分|遮挡|uncertain|hidden/i.test(combined) || (axis === "terrain" && score < 65)) {
    return { label: "部分一致", tone: "warn" };
  }

  return { label: "一致", tone: "good" };
}

function checklistTone(item: string, index: number) {
  if (/不匹配|相反|排除|缺失/.test(item)) {
    return "bad";
  }
  if (/待核验|不确定|遮挡|部分/.test(item) || index === 4) {
    return "warn";
  }
  if (index > 6) {
    return "muted";
  }
  return "good";
}

const DISTRIBUTION_MAP_WIDTH = 640;
const DISTRIBUTION_MAP_HEIGHT = 240;
const MAP_TILE_SIZE = 256;

function clampLatitude(latitude: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, latitude));
}

function projectToWorldPixel(latitude: number, longitude: number, zoom: number) {
  const scale = MAP_TILE_SIZE * 2 ** zoom;
  const sinLatitude = Math.sin((clampLatitude(latitude) * Math.PI) / 180);

  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale
  };
}

function chooseDistributionZoom(candidates: Candidate[]) {
  if (candidates.length <= 1) {
    return 14;
  }

  for (let zoom = 17; zoom >= 1; zoom -= 1) {
    const points = candidates.map((candidate) => projectToWorldPixel(candidate.latitude, candidate.longitude, zoom));
    const width = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
    const height = Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));

    if (width <= DISTRIBUTION_MAP_WIDTH * 0.7 && height <= DISTRIBUTION_MAP_HEIGHT * 0.62) {
      return zoom;
    }
  }

  return 1;
}

function buildDistributionMap(candidates: Candidate[]) {
  if (candidates.length === 0) {
    return null;
  }

  const zoom = chooseDistributionZoom(candidates);
  const points = candidates.map((candidate) => projectToWorldPixel(candidate.latitude, candidate.longitude, zoom));
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const topLeftX = centerX - DISTRIBUTION_MAP_WIDTH / 2;
  const topLeftY = centerY - DISTRIBUTION_MAP_HEIGHT / 2;
  const tileCount = 2 ** zoom;
  const firstTileX = Math.floor(topLeftX / MAP_TILE_SIZE);
  const lastTileX = Math.floor((topLeftX + DISTRIBUTION_MAP_WIDTH) / MAP_TILE_SIZE);
  const firstTileY = Math.max(0, Math.floor(topLeftY / MAP_TILE_SIZE));
  const lastTileY = Math.min(tileCount - 1, Math.floor((topLeftY + DISTRIBUTION_MAP_HEIGHT) / MAP_TILE_SIZE));
  const tiles = [];

  for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
    for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
      const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
      tiles.push({
        key: `${zoom}-${tileX}-${tileY}`,
        src: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`,
        left: ((tileX * MAP_TILE_SIZE - topLeftX) / DISTRIBUTION_MAP_WIDTH) * 100,
        top: ((tileY * MAP_TILE_SIZE - topLeftY) / DISTRIBUTION_MAP_HEIGHT) * 100,
        width: (MAP_TILE_SIZE / DISTRIBUTION_MAP_WIDTH) * 100,
        height: (MAP_TILE_SIZE / DISTRIBUTION_MAP_HEIGHT) * 100
      });
    }
  }

  return {
    tiles,
    markers: points.map((point) => ({
      left: ((point.x - topLeftX) / DISTRIBUTION_MAP_WIDTH) * 100,
      top: ((point.y - topLeftY) / DISTRIBUTION_MAP_HEIGHT) * 100
    }))
  };
}

function CandidateDistributionMap({
  ariaLabel = "候选位置分布地图",
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  getCandidateLabel
}: {
  ariaLabel?: string;
  candidates: Candidate[];
  selectedCandidateId: string | null;
  onSelectCandidate: (candidateId: string) => void;
  getCandidateLabel: (candidate: Candidate) => string;
}) {
  const map = useMemo(() => buildDistributionMap(candidates), [candidates]);

  if (!map) {
    return <div className="map-placeholder">无候选坐标</div>;
  }

  return (
    <div className="candidate-distribution-map" aria-label={ariaLabel} role="group">
      <div className="distribution-map-tiles" aria-hidden="true">
        {map.tiles.map((tile) => (
          <img
            alt=""
            key={tile.key}
            loading="lazy"
            src={tile.src}
            style={{ height: `${tile.height}%`, left: `${tile.left}%`, top: `${tile.top}%`, width: `${tile.width}%` }}
          />
        ))}
      </div>
      <div className="distribution-map-grid" aria-hidden="true" />
      {candidates.map((candidate, index) => {
        const marker = map.markers[index];
        const selected = selectedCandidateId === candidate.id;

        return (
          <button
            aria-label={`查看候选 ${index + 1} ${getCandidateLabel(candidate)}`}
            className={`candidate-map-marker${selected ? " selected" : ""}`}
            key={candidate.id}
            onClick={() => onSelectCandidate(candidate.id)}
            style={{ left: `${marker.left}%`, top: `${marker.top}%` }}
            title={`候选 ${index + 1}: ${getCandidateLabel(candidate)}`}
            type="button"
          >
            {index + 1}
          </button>
        );
      })}
      <span className="distribution-map-attribution">OpenStreetMap</span>
    </div>
  );
}

function ProcessList({ items }: { items: ProcessStep[] }) {
  return (
    <ol className="analysis-log">
      {items.map((item) => (
        <li className={`process-${item.status ?? "done"}`} key={item.title}>
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
        </li>
      ))}
    </ol>
  );
}

function uniqueItems(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function EvidenceTraceStrip({ investigation }: { investigation: Investigation | null }) {
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);

  async function copySearchQuery(query: string) {
    await navigator.clipboard?.writeText(query);
    setCopiedQuery(query);
  }

  if (!investigation) {
    return (
      <section className="trace-strip" aria-label="来源反查线索">
        <div className="trace-strip-heading">
          <h3>来源反查 / OCR 搜索</h3>
          <span>等待分析</span>
        </div>
        <p className="trace-empty">分析后显示可搜索的 OCR / 来源文字、外部搜索入口和地图可核验特征。</p>
      </section>
    );
  }

  const sourceClues = uniqueItems([
    ...investigation.extractedClues.ocrText.map((item) => `OCR: ${item}`),
    ...investigation.extractedClues.visibleLabels.map((item) => `标识: ${item}`),
    ...investigation.mapFeatureProfile.auxiliaryTextClues.map((item) => `辅助文字: ${item}`),
    ...investigation.mapFeatureProfile.excludedSourceOnlyClues.map((item) => `来源词: ${item}`)
  ]).slice(0, 6);
  const mapFeatures = uniqueItems([
    ...investigation.mapFeatureProfile.primaryFeatures,
    ...investigation.mapFeatureProfile.spatialRelationships,
    ...investigation.mapFeatureProfile.viewpointConstraints
  ]).slice(0, 7);
  const sourceQueries = investigation.searchQueries
    .filter((query) => /source|ocr|traceback/i.test(query.purpose))
    .slice(0, 3);
  const fallbackQueries = sourceQueries.length > 0 ? sourceQueries : investigation.searchQueries.slice(0, 3);

  return (
    <section className="trace-strip" aria-label="来源反查线索">
      <div className="trace-strip-heading">
        <h3>来源反查 / OCR 搜索</h3>
        <span>{fallbackQueries.length} 条查询</span>
      </div>
      <div className="trace-strip-grid">
        <div>
          <strong>媒体文字</strong>
          <div className="trace-chip-row">
            {sourceClues.length > 0 ? sourceClues.map((item) => <span key={item}>{item}</span>) : <em>暂无 OCR / 来源文字</em>}
          </div>
        </div>
        <div>
          <strong>搜索查询</strong>
          <div className="trace-query-row">
            {fallbackQueries.length > 0 ? (
              fallbackQueries.map((query) => (
                <div className="trace-query-card" key={`${query.purpose}-${query.query}`}>
                  <code>{query.query}</code>
                  <button type="button" onClick={() => void copySearchQuery(query.query)} aria-label={`复制查询 ${query.query}`}>
                    {copiedQuery === query.query ? "已复制" : "复制"}
                  </button>
                  <a href={`https://www.google.com/search?q=${encodeURIComponent(query.query)}`} target="_blank" rel="noreferrer" aria-label={`外部搜索 ${query.query}`}>
                    搜索
                  </a>
                </div>
              ))
            ) : (
              <em>尚未生成查询</em>
            )}
          </div>
        </div>
        <div>
          <strong>地图可核验特征</strong>
          <div className="trace-chip-row feature-row">
            {mapFeatures.length > 0 ? mapFeatures.map((item) => <span key={item}>{item}</span>) : <em>物理特征不足</em>}
          </div>
        </div>
      </div>
    </section>
  );
}

export function CandidateResults({
  assetMediaType = null,
  assetName = null,
  assetPreviewUrl = null,
  exportStatus = null,
  investigation,
  loading,
  error,
  hasImage = false,
  hasVisionKey = false,
  analysisProgress = 0,
  analysisStartedAt = null,
  analysisFinishedAt = null,
  matchingThreshold = 0.6,
  modelName = null,
  now = Date.now(),
  onCopyReport,
  onDownloadHtml,
  onDownloadMarkdown,
  onPrintReport,
  onShowSample
}: Props) {
  const [copiedCandidateId, setCopiedCandidateId] = useState<string | null>(null);
  const [candidateReviewStatus, setCandidateReviewStatus] = useState<Record<string, CandidateReviewStatus>>({});
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [activeEvidenceTab, setActiveEvidenceTab] = useState<EvidenceTab>("canvas");
  const [filterOpen, setFilterOpen] = useState(false);
  const [candidateFilterMode, setCandidateFilterMode] = useState<CandidateFilterMode>("all");

  const sortedCandidates = useMemo(() => {
    return [...(investigation?.candidates ?? [])].sort((left, right) => {
      const rightScore = typeof right.matchScore === "number" ? right.matchScore : -1;
      const leftScore = typeof left.matchScore === "number" ? left.matchScore : -1;

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return confidenceWeight(right.confidence) - confidenceWeight(left.confidence);
    });
  }, [investigation?.candidates]);

  const clampedProgress = Math.max(0, Math.min(100, analysisProgress));
  const thresholdScore = Math.round(matchingThreshold * 100);
  const filteredCandidates = useMemo(() => {
    return sortedCandidates.filter((candidate) =>
      candidateMatchesFilter(candidate, candidateFilterMode, candidateReviewStatus[candidate.id] ?? "pending", thresholdScore)
    );
  }, [candidateFilterMode, candidateReviewStatus, sortedCandidates, thresholdScore]);
  const candidateFilterCounts = useMemo(() => {
    return candidateFilterModes.reduce((counts, filterMode) => {
      counts[filterMode] = sortedCandidates.filter((candidate) =>
        candidateMatchesFilter(candidate, filterMode, candidateReviewStatus[candidate.id] ?? "pending", thresholdScore)
      ).length;
      return counts;
    }, {} as Record<CandidateFilterMode, number>);
  }, [candidateReviewStatus, sortedCandidates, thresholdScore]);

  useEffect(() => {
    setCopiedCandidateId(null);
    setCandidateReviewStatus({});
    setSelectedCandidateId(null);
    setCandidateFilterMode("all");
    setFilterOpen(false);
  }, [investigation?.id]);

  useEffect(() => {
    setSelectedCandidateId((currentId) => {
      if (filteredCandidates.length === 0) {
        return null;
      }

      if (currentId && filteredCandidates.some((candidate) => candidate.id === currentId)) {
        return currentId;
      }

      return filteredCandidates[0].id;
    });
  }, [filteredCandidates, investigation?.id]);

  async function copyCoordinate(candidate: Candidate) {
    const coordinate = formatCoordinate(candidate.latitude, candidate.longitude);
    await navigator.clipboard?.writeText(coordinate);
    setCopiedCandidateId(candidate.id);
  }

  function candidateLabel(candidate: Candidate) {
    return candidate.name ?? formatCoordinate(candidate.latitude, candidate.longitude);
  }

  function setReviewStatus(candidateId: string, status: CandidateReviewStatus) {
    setCandidateReviewStatus((current) => ({ ...current, [candidateId]: status }));
  }

  const bestCandidate = filteredCandidates[0] ?? sortedCandidates[0];
  const selectedCandidate = filteredCandidates.find((candidate) => candidate.id === selectedCandidateId) ?? filteredCandidates[0];
  const selectedCandidateIndex = selectedCandidate ? sortedCandidates.findIndex((candidate) => candidate.id === selectedCandidate.id) : -1;
  const selectedFilterLabel = candidateFilterLabels[candidateFilterMode];
  const candidateFilterSummary = candidateFilterMode === "all" ? `${sortedCandidates.length} 个候选` : `${filteredCandidates.length}/${sortedCandidates.length} 个候选`;
  const belowThresholdCount = sortedCandidates.filter((candidate) => typeof candidate.matchScore === "number" && candidate.matchScore < thresholdScore).length;
  const analysisStatus = error
    ? "分析失败"
    : loading
      ? clampedProgress >= 86
        ? `等待模型返回... ${clampedProgress}%`
        : `分析中... ${clampedProgress}%`
      : investigation
        ? "分析完成 100%"
        : hasImage
          ? "待开始"
          : "待命";
  const resultStatusItems: Array<{ label: string; value: string; tone?: string; progress?: number | null; title?: string }> = [
    {
      label: "资产",
      value: assetName ?? (hasImage ? "已上传素材" : "未上传"),
      tone: assetName || hasImage ? "ready" : ""
    },
    {
      label: "模型状态",
      value: hasVisionKey ? `${modelName || "未选择模型"} 已就绪` : "未配置",
      tone: hasVisionKey ? "ready" : ""
    },
    {
      label: "分析状态",
      value: analysisStatus,
      tone: loading ? "in-progress" : investigation ? "ready" : error ? "error" : "",
      progress: loading || investigation ? (investigation ? 100 : clampedProgress) : null,
      title: error ?? undefined
    },
    {
      label: "开始时间",
      value: formatStatusDate(analysisStartedAt),
      tone: analysisStartedAt ? "ready" : ""
    },
    {
      label: "耗时",
      value: formatElapsed(analysisStartedAt, analysisFinishedAt, now),
      tone: analysisStartedAt ? "ready" : ""
    }
  ];
  const topVerificationNotes = selectedCandidate
    ? [
        ...(selectedCandidate.matchedFeatures ?? []).map((item) => `${item} 匹配`),
        ...(selectedCandidate.missingOrUnverifiedFeatures ?? []).map((item) => `${item} 待核验`),
        ...(selectedCandidate.viewpointNotes ?? []),
        ...selectedCandidate.earthVerificationChecklist
      ].slice(0, 8)
    : [];
  const canvasClues = buildClueChips(investigation, selectedCandidate);
  const metadataRows = buildMetadataRows(investigation, selectedCandidate, assetName);
  const colorSwatches = buildColorSwatches(investigation);

  const waitingAnalysisSteps = [
    {
      title: hasImage ? "图片已就绪" : "等待图片",
      detail: hasImage ? "图片/视频已进入待分析队列。" : "上传图片、连续截图或视频后开始视觉识别。",
      status: hasImage ? "done" : "pending"
    },
    {
      title: hasVisionKey ? "视觉模型已配置" : "视觉模型未配置",
      detail: hasVisionKey ? "将自动识别 OCR、地物、设施和空间关系。" : "请在右上角设置里填写 API Key 并选择模型。",
      status: hasVisionKey ? "done" : "pending"
    },
    {
      title: "候选坐标等待生成",
      detail: "开始分析后会在右侧同步显示候选分布、地图预览、Earth 核验位和候选表。",
      status: "pending"
    }
  ] satisfies ProcessStep[];

  const analysisLog = loading
    ? buildLoadingAnalysisSteps(clampedProgress)
    : investigation
    ? [
        {
          title: "视觉线索提取完成",
          detail: `提取到 ${countSummary(investigation.extractedClues.sceneFeatures.length, "个地物特征")}、${countSummary(
            investigation.extractedClues.spatialRelationships.length,
            "个空间关系"
          )}。`
        },
        {
          title: "原图元数据检查完成",
          detail: (investigation.metadataEvidence ?? []).some((metadata) => metadata.gps)
            ? "原始媒体包含 EXIF GPS，已加入候选。"
            : "未发现可直接定位的 EXIF GPS。"
        },
        {
          title: "地图核验特征集合完成",
          detail: investigation.mapFeatureProfile.searchInstruction || "没有足够物理特征生成地图核验集合。"
        },
        {
          title: "候选坐标生成完成",
          detail:
            sortedCandidates.length > 0
              ? `生成 ${countSummary(sortedCandidates.length, "个候选坐标")}，包含低置信人工复核线索；高级详情中保留候选对比、地图入口和报告。`
              : "未生成候选坐标；模型返回为空，或候选缺少坐标。可补充来源、地区、字幕或更多连续截图后重试。"
        }
      ]
    : waitingAnalysisSteps;

  return (
    <section className="panel result-panel verification-workbench command-workbench" aria-live="polite" role={loading ? "status" : error ? "alert" : undefined}>
      {error ? <div className="inline-error">{error}</div> : null}
      <div className="result-toolbar">
        <div className="result-toolbar-title">
          <p className="eyebrow">核验工作台</p>
          <h2>{investigation ? "候选结果" : loading ? "正在分析" : "等待分析"}</h2>
        </div>
        <div className="result-toolbar-status" aria-label="定位核验工作台状态">
          {resultStatusItems.map((item) => (
            <div className={`result-status-item ${item.tone ? `status-${item.tone}` : ""}`} key={item.label} title={item.title}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              {typeof item.progress === "number" ? (
                <div className="result-status-progress" aria-hidden="true">
                  <i style={{ width: `${item.progress}%` }} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <span className={sortedCandidates.length > 0 ? "workbench-count ready" : "workbench-count"}>
          {sortedCandidates.length > 0 ? `${sortedCandidates.length} 个候选` : "暂无候选"}
        </span>
      </div>
      {belowThresholdCount > 0 ? (
        <p className="threshold-review-note">
          已保留 {belowThresholdCount} 个低于 {thresholdScore} 分阈值的低置信候选，作为人工复核线索展示。
        </p>
      ) : null}
      <div className="command-center-board">
        <section className="evidence-console" aria-label="证据画布">
          <div className="evidence-console-tabs" aria-label="证据视图">
            {([
              ["canvas", "证据画布"],
              ["ocr", "OCR 与文字"],
              ["visual", "视觉线索"],
              ["metadata", "EXIF / 元数据"],
              ["reasoning", "AI 推理"],
              ["map", "地图核验"]
            ] satisfies Array<[EvidenceTab, string]>).map(([tab, label]) => (
              <button className={activeEvidenceTab === tab ? "active" : ""} key={tab} type="button" onClick={() => setActiveEvidenceTab(tab)}>
                {label}
              </button>
            ))}
          </div>
          <div className="evidence-canvas-frame">
            {activeEvidenceTab === "map" ? (
              <div className="evidence-map-tab-view" aria-label="地图核验">
                <section className="evidence-map-card">
                  <div className="map-card-heading">
                    <strong>候选分布</strong>
                    <span>{candidateFilterSummary}</span>
                  </div>
                  <CandidateDistributionMap
                    ariaLabel="证据画布候选分布地图"
                    candidates={filteredCandidates}
                    getCandidateLabel={candidateLabel}
                    onSelectCandidate={setSelectedCandidateId}
                    selectedCandidateId={selectedCandidate?.id ?? null}
                  />
                </section>
                <section className="evidence-map-card selected-map-card">
                  <div className="map-card-heading">
                    <strong>当前候选卫星图</strong>
                    {selectedCandidate ? <span>{candidateScoreLabel(selectedCandidate)}</span> : <span>待生成</span>}
                  </div>
                  {selectedCandidate ? (
                    <div className="selected-map-frame">
                      <iframe
                        title="证据画布当前候选卫星地图"
                        src={selectedCandidate.mapPreview.googleMapsEmbedUrl}
                        loading="lazy"
                        allow="fullscreen"
                        allowFullScreen
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                      <div className="selected-map-overlay">
                        <strong>{formatCoordinate(selectedCandidate.latitude, selectedCandidate.longitude)}</strong>
                        <span>{selectedCandidate.name ?? "未命名候选点"}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="map-placeholder">等待候选坐标</div>
                  )}
                </section>
              </div>
            ) : activeEvidenceTab === "ocr" ? (
              <div className="evidence-tab-panel">
                <section>
                  <h3>OCR 文字</h3>
                  {renderList(investigation?.extractedClues.ocrText ?? [], "尚未提取 OCR 文字")}
                </section>
                <section>
                  <h3>可见标识</h3>
                  {renderList(investigation?.extractedClues.visibleLabels ?? [], "尚未识别可见标识")}
                </section>
                <section>
                  <h3>语言线索</h3>
                  {renderList(investigation?.extractedClues.languages ?? [], "尚未识别语言")}
                </section>
              </div>
            ) : activeEvidenceTab === "visual" ? (
              <div className="evidence-tab-panel visual-tab-panel">
                <section>
                  <h3>地物特征</h3>
                  {renderList(investigation?.extractedClues.sceneFeatures ?? [], "尚未提取地物特征")}
                </section>
                <section>
                  <h3>空间关系</h3>
                  {renderList(investigation?.extractedClues.spatialRelationships ?? [], "尚未提取空间关系")}
                </section>
                <section>
                  <h3>地图可核验特征</h3>
                  {renderList(investigation?.mapFeatureProfile.primaryFeatures ?? [], "尚未生成地图核验特征")}
                </section>
              </div>
            ) : activeEvidenceTab === "metadata" ? (
              <div className="evidence-tab-panel metadata-tab-panel">
                {metadataRows.map((row) => (
                  <section key={row.label}>
                    <h3>{row.label}</h3>
                    <p>{row.value}</p>
                  </section>
                ))}
              </div>
            ) : activeEvidenceTab === "reasoning" ? (
              <div className="evidence-tab-panel reasoning-tab-panel">
                <ProcessList items={analysisLog} />
              </div>
            ) : (
              <div className="evidence-media-stage">
                {assetPreviewUrl && assetMediaType?.startsWith("video/") ? (
                  <video className="evidence-main-media" src={assetPreviewUrl} muted controls />
                ) : null}
                {assetPreviewUrl && !assetMediaType?.startsWith("video/") ? (
                  <img className="evidence-main-media" src={assetPreviewUrl} alt={assetName ? `${assetName} 证据预览` : "证据预览"} />
                ) : null}
                {!assetPreviewUrl ? (
                  <div className="evidence-empty-stage">
                    <strong>{investigation ? "历史调查素材未缓存" : hasImage ? "素材预览生成中" : "等待上传证据素材"}</strong>
                    <span>{investigation ? "候选与证据链仍可继续核验。" : "上传图片或视频后，这里会显示主证据画布和线索标记。"}</span>
                  </div>
                ) : null}
                <div className="canvas-marker-layer" aria-hidden="true">
                  {canvasClues.map((clue, index) => (
                    <span
                      className="canvas-marker"
                      key={`${clue}-${index}`}
                      style={clueMarkerPositions[index] ?? clueMarkerPositions[0]}
                      title={clue}
                    >
                      {index + 1}
                    </span>
                  ))}
                </div>
                <div className="canvas-tool-stack" aria-hidden="true">
                  <span>⌕</span>
                  <span>□</span>
                  <span>＋</span>
                  <span>↻</span>
                  <span>☼</span>
                </div>
              </div>
            )}
          </div>
          {activeEvidenceTab === "canvas" || activeEvidenceTab === "visual" ? (
            <div className="focused-region-strip" aria-label="重点线索区域">
              {canvasClues.length > 0 ? (
                canvasClues.map((clue, index) => (
                  <button
                    className={selectedCandidateIndex === index ? "focused-region active" : "focused-region"}
                    key={`${clue}-region`}
                    type="button"
                    onClick={() => selectedCandidate && setSelectedCandidateId(selectedCandidate.id)}
                  >
                    <span>{index + 1}</span>
                    {assetPreviewUrl ? <img src={assetPreviewUrl} alt="" /> : <em>{clue.slice(0, 18)}</em>}
                    <strong>{clue}</strong>
                  </button>
                ))
              ) : (
                <div className="focused-region-empty">等待 OCR、标识、建筑、道路和视角线索</div>
              )}
            </div>
          ) : null}
          <div className="metadata-strip" aria-label="素材元数据">
            {metadataRows.map((row) => (
              <div key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
          <div className="palette-strip" aria-label="图像主色">
            <span>图像主色</span>
            <div>
              {colorSwatches.map((color) => (
                <i key={color} style={{ backgroundColor: color }} />
              ))}
            </div>
          </div>
        </section>
        <aside className="investigation-rail" aria-label="调查面板">
          <section className="rail-card candidate-ranking-card">
            <div className="rail-card-heading">
              <div>
                <span>调查</span>
                <h3>候选位置</h3>
              </div>
              <div className="candidate-filter-control">
                <button
                  aria-expanded={filterOpen}
                  aria-haspopup="menu"
                  className={candidateFilterMode === "all" ? "small-button filter-button" : "small-button filter-button active"}
                  type="button"
                  onClick={() => setFilterOpen((open) => !open)}
                >
                  筛选：{selectedFilterLabel}
                </button>
                {filterOpen ? (
                  <div className="candidate-filter-menu" role="menu">
                    {candidateFilterModes.map((filterMode) => (
                      <button
                        className={candidateFilterMode === filterMode ? "candidate-filter-option active" : "candidate-filter-option"}
                        key={filterMode}
                        role="menuitemradio"
                        aria-checked={candidateFilterMode === filterMode}
                        type="button"
                        onClick={() => {
                          setCandidateFilterMode(filterMode);
                          setFilterOpen(false);
                        }}
                      >
                        <span>{candidateFilterLabels[filterMode]}</span>
                        <strong>{candidateFilterCounts[filterMode] ?? 0}</strong>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <p className="rail-subtitle">按置信度排序 · {candidateFilterSummary}</p>
            <div className="candidate-ranking-list">
              {sortedCandidates.length === 0 ? (
                <div className="candidate-rank-empty">
                  <span>{investigation ? "尚未生成候选坐标" : "开始分析后显示候选排行"}</span>
                  {!investigation && !loading && onShowSample ? (
                    <button className="secondary-button" type="button" onClick={onShowSample}>
                      查看示例证据链
                    </button>
                  ) : null}
                </div>
              ) : null}
              {sortedCandidates.length > 0 && filteredCandidates.length === 0 ? (
                <div className="candidate-rank-empty">
                  <span>没有符合“{selectedFilterLabel}”的候选</span>
                </div>
              ) : null}
              {filteredCandidates.slice(0, 5).map((candidate, index) => {
                const selected = selectedCandidate?.id === candidate.id;
                return (
                  <button
                    aria-label={`查看候选 ${index + 1} ${candidateLabel(candidate)}`}
                    className={selected ? "candidate-rank-card selected" : "candidate-rank-card"}
                    key={candidate.id}
                    type="button"
                    onClick={() => setSelectedCandidateId(candidate.id)}
                  >
                    <span className="candidate-rank-number">{index + 1}</span>
                    <span className="candidate-thumb">
                      {assetPreviewUrl ? <img src={assetPreviewUrl} alt="" /> : <span>{index + 1}</span>}
                    </span>
                    <span className="candidate-rank-main">
                      <strong>{candidate.name ?? formatCoordinate(candidate.latitude, candidate.longitude)}</strong>
                      <small>{formatCoordinate(candidate.latitude, candidate.longitude)}</small>
                      <span className="score-meter" aria-hidden="true">
                        <span style={{ width: candidateScoreWidth(candidate) }} />
                      </span>
                    </span>
                    <span className="candidate-score">{candidateScoreLabel(candidate)}</span>
                  </button>
                );
              })}
            </div>
          </section>
          <div className="rail-split">
            <section className="rail-card verification-mini-card">
              <div className="rail-card-heading compact">
                <h3>核验清单</h3>
                <span>Top Candidate</span>
              </div>
              {topVerificationNotes.length > 0 ? (
                <ul>
                  {topVerificationNotes.slice(0, 6).map((item, index) => (
                    <li className={`check-${checklistTone(item, index)}`} key={`${item}-${index}`}>
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">候选生成后显示逐项核验结果。</p>
              )}
            </section>
            <section className="rail-card mini-map-card">
              <div className="rail-card-heading compact">
                <h3>地图入口</h3>
                <span>地图核验标签</span>
              </div>
              {selectedCandidate ? (
                <div className="mini-map-summary">
                  <strong>{formatCoordinate(selectedCandidate.latitude, selectedCandidate.longitude)}</strong>
                  <span>{selectedCandidate.name ?? "未命名候选点"}</span>
                  <p>完整卫星图与候选分布已移入上方“地图核验”标签。</p>
                </div>
              ) : (
                <div className="map-placeholder">等待候选坐标</div>
              )}
            </section>
          </div>
          {selectedCandidate ? (
            <div className="rail-action-row">
              <a className="inline-action" href={selectedCandidate.mapLinks.googleMaps} target="_blank" rel="noreferrer">
                打开地图
              </a>
              <a className="inline-action" href={selectedCandidate.mapPreview.googleEarthWebUrl} target="_blank" rel="noreferrer">
                打开 Earth
              </a>
            </div>
          ) : null}
          {investigation ? (
            <section className="rail-card report-actions-card">
              <div className="rail-card-heading compact">
                <h3>报告导出</h3>
                <span>{investigation.candidates.length} 个候选</span>
              </div>
              <div className="report-action-grid">
                {onPrintReport ? (
                  <button className="small-button" type="button" onClick={onPrintReport}>
                    打印 / 导出 PDF
                  </button>
                ) : null}
                {onDownloadMarkdown ? (
                  <button className="small-button" type="button" onClick={onDownloadMarkdown}>
                    下载 Markdown
                  </button>
                ) : null}
                {onDownloadHtml ? (
                  <button className="small-button" type="button" onClick={onDownloadHtml}>
                    下载 HTML
                  </button>
                ) : null}
                {onCopyReport ? (
                  <button className="small-button" type="button" onClick={onCopyReport}>
                    复制报告
                  </button>
                ) : null}
              </div>
              {exportStatus ? (
                <span className="save-status" role="status">
                  {exportStatus}
                </span>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>
      <details className="advanced-verification-drawer">
        <summary>
          <span>高级核验详情</span>
          <small>分析过程、候选对比、完整证据链与报告</small>
        </summary>
        <div className="advanced-verification-content">
      <div className="summary-board">
        <article className="evidence-card analysis-log-card">
          <div className="analysis-card-heading">
            <h3>分析过程</h3>
            {loading ? <strong>{clampedProgress}%</strong> : null}
          </div>
          {loading ? (
            <div className="analysis-progress" role="progressbar" aria-label="分析进度" aria-valuenow={clampedProgress} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${clampedProgress}%` }} />
            </div>
          ) : null}
          <ProcessList items={analysisLog} />
        </article>
        <article className="best-candidate-card" aria-label="当前候选">
          <div className="card-title-row">
            <h3>{selectedCandidate ? (selectedCandidateIndex === 0 ? "待核验候选（Top 1）" : `当前候选（排名 ${selectedCandidateIndex + 1}）`) : "当前候选"}</h3>
            {selectedCandidate ? (
              <button className="icon-button" type="button" onClick={() => void copyCoordinate(selectedCandidate)} aria-label="复制坐标">
                {copiedCandidateId === selectedCandidate.id ? "已复制" : "复制坐标"}
              </button>
            ) : null}
          </div>
          {selectedCandidate ? (
            <>
              <p className="coordinate hero-coordinate">{formatCoordinate(selectedCandidate.latitude, selectedCandidate.longitude)}</p>
              <dl className="candidate-metrics">
                <div>
                  <dt>置信度</dt>
                  <dd>{typeof selectedCandidate.matchScore === "number" ? (selectedCandidate.matchScore / 100).toFixed(2) : confidenceLabel(selectedCandidate.confidence)}</dd>
                </div>
                <div>
                  <dt>定位方式</dt>
                  <dd>{selectedCandidateIndex === 0 ? "来源线索 + 待地图核验" : "视觉候选"}</dd>
                </div>
                <div>
                  <dt>地址（参考）</dt>
                  <dd>{selectedCandidate.name ?? "等待人工补充地名"}</dd>
                </div>
                <div>
                  <dt>地理特征</dt>
                  <dd>{(selectedCandidate.matchedFeatures ?? []).slice(0, 3).join("、") || "未提取"}</dd>
                </div>
              </dl>
              <a className="inline-action" href={selectedCandidate.mapLinks.googleMaps} target="_blank" rel="noreferrer">
                在地图中查看
              </a>
              {(selectedCandidate.osintLinks ?? []).length > 0 ? (
                <section className="osint-links-panel osint-links-panel-compact">
                  <h4>外部 OSINT 核验入口</h4>
                  <div className="osint-link-grid">
                    {selectedCandidate.osintLinks?.map((link) => (
                      <a aria-label={link.title} href={link.url} key={link.title} target="_blank" rel="noreferrer">
                        <strong>{link.title}</strong>
                        <span>{link.note}</span>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : (
            <div className={investigation ? "empty-candidate-note" : undefined}>
              <p className="muted">{investigation ? "本次未生成可核验候选坐标。" : "尚未生成候选坐标。"}</p>
              {investigation ? (
                <ul>
                  <li>模型没有返回带坐标、来源和地物匹配证据的地点。</li>
                  <li>候选评分可能低于当前阈值：{thresholdScore} 分。</li>
                  <li>可补充国家/地区、可见文字、设施类型或多张连续截图后重试。</li>
                </ul>
              ) : null}
            </div>
          )}
        </article>
        <article className="distribution-card">
          <div className="card-title-row">
            <h3>候选位置分布</h3>
            <span>{candidateFilterSummary}</span>
          </div>
          <CandidateDistributionMap
            candidates={filteredCandidates}
            getCandidateLabel={candidateLabel}
            onSelectCandidate={setSelectedCandidateId}
            selectedCandidateId={selectedCandidate?.id ?? null}
          />
        </article>
      </div>
      <div className="primary-verification-grid">
        <div className="map-preview">
          <div className="map-preview-header">
            <strong>地图预览（Google Maps 卫星图）</strong>
            {selectedCandidate ? (
              <a href={selectedCandidate.mapLinks.googleMaps} target="_blank" rel="noreferrer">
                打开 Maps
              </a>
            ) : null}
          </div>
          {selectedCandidate ? (
            <iframe
              title="当前候选 Google Maps 卫星图像预览"
              src={selectedCandidate.mapPreview.googleMapsEmbedUrl}
              loading="lazy"
              allow="fullscreen"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="map-placeholder">等待候选坐标</div>
          )}
        </div>
        <div className="earth-screenshot-slot">
          <div className="earth-screenshot-header">
            <strong>Google Earth 核验位</strong>
            {selectedCandidate ? (
              <a href={selectedCandidate.mapPreview.googleEarthWebUrl} target="_blank" rel="noreferrer">
                打开 Google Earth
              </a>
            ) : null}
          </div>
          <div className="earth-placeholder">
            {selectedCandidate ? (
              <>
                <span>当前候选 Earth 入口已生成（待人工核验）</span>
                <p className="earth-coordinate">{formatCoordinate(selectedCandidate.latitude, selectedCandidate.longitude)}</p>
                <p>{selectedCandidate.mapPreview.screenshotStatus}</p>
                {selectedCandidate.mapPreview.notes.length > 0 ? (
                  <ul className="earth-checklist">
                    {selectedCandidate.mapPreview.notes.slice(0, 3).map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <>
                <span>等待 Google Earth 核验位</span>
                <p>候选坐标生成后会显示 Earth 入口和人工截图核验提示。</p>
              </>
            )}
          </div>
        </div>
        <aside className="field-checklist">
          <div className="card-title-row">
            <h3>实地特征核对清单</h3>
            <strong>{topVerificationNotes.length}/8</strong>
          </div>
          {topVerificationNotes.length > 0 ? (
            <ul>
              {topVerificationNotes.map((item, index) => (
                <li className={`check-${checklistTone(item, index)}`} key={item}>
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">等待候选生成后显示可核验特征</p>
          )}
        </aside>
      </div>
      <div className="candidate-workbench">
        <div className="candidate-workbench-heading">
          <h3>候选位置对比</h3>
          <span>{investigation ? `${investigation.searchQueries.length} 条查询线索` : "等待查询线索"}</span>
        </div>
        <EvidenceTraceStrip investigation={investigation} />
        <div className="candidate-table-wrap">
          <table className="candidate-comparison-table">
            <thead>
              <tr>
                <th scope="col">排名</th>
                <th scope="col">坐标（WGS84）</th>
                <th scope="col">置信度</th>
                <th scope="col" aria-label="匹配条" />
                <th scope="col">匹配分数</th>
                <th scope="col">定位方式</th>
                <th scope="col">地理特征摘要</th>
                <th scope="col">与最佳距离</th>
                <th scope="col">方向一致性</th>
                <th scope="col">地形一致性</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    {sortedCandidates.length > 0
                      ? `没有符合“${selectedFilterLabel}”的候选点。`
                      : investigation
                      ? "本次没有可保留、排除或确认的候选点。请降低匹配阈值、补充范围线索，或上传更多连续截图后重新分析。"
                      : "暂无候选坐标，开始分析后这里会显示可保留、排除或确认的候选点。"}
                  </td>
                </tr>
              ) : null}
              {filteredCandidates.map((candidate, index) => {
                const status = candidateReviewStatus[candidate.id] ?? "pending";
                const label = candidateLabel(candidate);
                const rankIndex = sortedCandidates.findIndex((item) => item.id === candidate.id);
                const displayRank = rankIndex >= 0 ? rankIndex + 1 : index + 1;

                return (
                  <tr
                    aria-selected={selectedCandidate?.id === candidate.id}
                    className={`review-${status}${selectedCandidate?.id === candidate.id ? " selected-candidate-row" : ""}`}
                    key={candidate.id}
                    onClick={() => setSelectedCandidateId(candidate.id)}
                  >
                    <td>{displayRank}</td>
                    <th scope="row">
                      <span>{formatCoordinate(candidate.latitude, candidate.longitude)}</span>
                      <small>{candidate.name ?? "未命名候选点"}</small>
                    </th>
                    <td>{typeof candidate.matchScore === "number" ? (candidate.matchScore / 100).toFixed(2) : confidenceLabel(candidate.confidence)}</td>
                    <td>
                      <span className="score-meter">
                        <span style={{ width: `${Math.max(8, Math.min(100, candidate.matchScore ?? 0))}%` }} />
                      </span>
                    </td>
                    <td>
                      {typeof candidate.matchScore === "number" ? candidate.matchScore : "未评分"}
                    </td>
                    <td>{displayRank === 1 ? "来源线索 + 待地图核验" : "视觉候选"}</td>
                    <td>{(candidate.matchedFeatures ?? []).slice(0, 2).join("、") || "未提取"}</td>
                    <td>{formatDistanceFromBest(candidate, bestCandidate)}</td>
                    <td>
                      {(() => {
                        const direction = consistencyFromCandidate(candidate, "direction");
                        return <span className={`consistency-badge consistency-${direction.tone}`}>{direction.label}</span>;
                      })()}
                    </td>
                    <td>
                      {(() => {
                        const terrain = consistencyFromCandidate(candidate, "terrain");
                        return <span className={`consistency-badge consistency-${terrain.tone}`}>{terrain.label}</span>;
                      })()}
                    </td>
                    <td>
                      <div className="review-actions candidate-action-cell">
                        <span className={`review-status review-status-${status}`}>{reviewStatusLabels[status]}</span>
                        <button className="small-button view-candidate-button" type="button" aria-label={`查看 ${label}`} onClick={() => setSelectedCandidateId(candidate.id)}>
                          查看
                        </button>
                        <button className="small-button" type="button" aria-label={`保留 ${label}`} onClick={() => setReviewStatus(candidate.id, "keep")}>
                          保留
                        </button>
                        <button
                          className="small-button"
                          type="button"
                          aria-label={`排除 ${label}`}
                          onClick={() => setReviewStatus(candidate.id, "excluded")}
                        >
                          排除
                        </button>
                        <button
                          className="small-button"
                          type="button"
                          aria-label={`确认 ${label}`}
                          onClick={() => setReviewStatus(candidate.id, "confirmed")}
                        >
                          确认
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {investigation ? (
        <details className="evidence-drawer" open>
          <summary>证据链与搜索过程</summary>
          <div className="evidence-overview">
          <article className="evidence-card">
            <h3>自动识别线索</h3>
            {renderList(investigation.imageAnalysis.observations)}
            <h4>能力边界</h4>
            {renderList(investigation.imageAnalysis.limitations)}
          </article>
          <article className="evidence-card">
            <h3>EXIF / 元数据</h3>
            {renderList(
              (investigation.metadataEvidence ?? []).flatMap((metadata) => [
                metadata.gps ? `GPS：${formatCoordinate(metadata.gps.latitude, metadata.gps.longitude)}` : "",
                metadata.capturedAt ? `拍摄时间：${metadata.capturedAt}` : "",
                metadata.camera ? `相机：${metadata.camera}` : "",
                ...metadata.notes
              ])
            )}
          </article>
          <article className="evidence-card">
            <h3>图片线索</h3>
            <p className="muted">OCR / 标识 / 地物 / 空间关系会合并进入搜索。</p>
            {renderList([
              ...investigation.extractedClues.ocrText.map((item) => `OCR：${item}`),
              ...investigation.extractedClues.visibleLabels.map((item) => `标识：${item}`),
              ...investigation.extractedClues.sceneFeatures.map((item) => `地物：${item}`),
              ...investigation.extractedClues.spatialRelationships.map((item) => `空间：${item}`)
            ])}
          </article>
          <article className="evidence-card">
            <h3>地图核验特征集合</h3>
            <p className="muted">{investigation.mapFeatureProfile.searchInstruction || "未生成地图核验特征集合。"}</p>
            <h4>主要物理特征</h4>
            {renderList(investigation.mapFeatureProfile.primaryFeatures)}
            <h4>视角/方位约束</h4>
            {renderList(investigation.mapFeatureProfile.viewpointConstraints)}
            <h4>不作为主要证据</h4>
            {renderList(investigation.mapFeatureProfile.excludedSourceOnlyClues)}
          </article>
          <article className="evidence-card">
            <h3>搜索过程</h3>
            {renderList(
              investigation.searchProcess.map((step) => [step.title, step.query, step.rationale].filter(Boolean).join(" - "))
            )}
          </article>
          <article className="evidence-card">
            <h3>季节与历史影像</h3>
            <p>
              <strong>{investigation.seasonalAnalysis.inferredSeason}</strong>
            </p>
            {renderList([...investigation.seasonalAnalysis.reasoning, ...investigation.seasonalAnalysis.mapComparisonNotes])}
          </article>
          </div>
        </details>
      ) : null}
      <div className="map-verification-section">
        <h3>地图与 Earth 核验</h3>
        {filteredCandidates.length === 0 ? (
          <div className="map-preview-grid">
            <div className="map-preview map-preview-empty">
              <div className="map-preview-header">
                <strong>Google Maps 卫星图像预览</strong>
              </div>
              <p>{sortedCandidates.length > 0 ? `没有符合“${selectedFilterLabel}”的候选坐标。` : "尚无候选坐标，无法加载 Google Maps 卫星预览。"}</p>
            </div>
            <div className="earth-preview">
              <strong>Google Earth 历史影像核验</strong>
              <p>{sortedCandidates.length > 0 ? "切换筛选条件后可继续查看候选 Earth 入口。" : "尚无候选坐标，无法生成 Google Earth 入口。"}</p>
              {renderList(["先生成至少一个候选坐标，再对比道路、轨道、建筑、花坛、电线杆和视角关系。"])}
            </div>
          </div>
        ) : (
          <p className="muted">每个候选卡片都包含 Google Maps 卫星预览、Google Earth 入口和逐项核验清单。</p>
        )}
      </div>
      <div className="candidate-list">
        {filteredCandidates.length === 0 ? <p className="muted">{sortedCandidates.length > 0 ? `没有符合“${selectedFilterLabel}”的候选坐标` : "尚未生成候选坐标"}</p> : null}
        {filteredCandidates.map((candidate, index) => {
          const rankIndex = sortedCandidates.findIndex((item) => item.id === candidate.id);
          const displayRank = rankIndex >= 0 ? rankIndex + 1 : index + 1;
          return (
          <article className="candidate" key={candidate.id}>
            <div className="candidate-header">
              <strong>{candidate.name ? `候选 ${displayRank}：${candidate.name}` : `候选 ${displayRank}`}</strong>
              <div className="candidate-badges">
                <span>{confidenceLabel(candidate.confidence)}</span>
                <span className={`review-status review-status-${candidateReviewStatus[candidate.id] ?? "pending"}`}>
                  {reviewStatusLabels[candidateReviewStatus[candidate.id] ?? "pending"]}
                </span>
              </div>
            </div>
            <div className="coordinate-row">
              <p className="coordinate">{formatCoordinate(candidate.latitude, candidate.longitude)}</p>
              <button className="small-button" type="button" onClick={() => void copyCoordinate(candidate)}>
                {copiedCandidateId === candidate.id ? "已复制" : "复制候选坐标"}
              </button>
            </div>
            <div className="candidate-verification-grid">
              {typeof candidate.matchScore === "number" ? (
                <div className="verification-score">
                  <strong>匹配评分 {candidate.matchScore}/100</strong>
                  <span>按物理特征、空间关系和视角一致性排序</span>
                </div>
              ) : null}
              <div>
                <h4>已匹配特征</h4>
                {renderList(candidate.matchedFeatures ?? [])}
              </div>
              <div>
                <h4>待核验或不匹配</h4>
                {renderList(candidate.missingOrUnverifiedFeatures ?? [])}
              </div>
              <div>
                <h4>视角说明</h4>
                {renderList(candidate.viewpointNotes ?? [])}
              </div>
            </div>
            <div className="map-preview-grid">
              <div className="map-preview">
                <div className="map-preview-header">
                  <strong>{displayRank === 1 ? "Google Maps 卫星图像预览" : `候选 ${displayRank} 地图预览`}</strong>
                  <a href={candidate.mapLinks.googleMaps} target="_blank" rel="noreferrer">
                    打开 Maps
                  </a>
                </div>
                <div className="map-link-card">
                  <strong>{formatCoordinate(candidate.latitude, candidate.longitude)}</strong>
                  <span>完整地图预览已集中在上方当前候选区域，避免同时加载多个地图。</span>
                </div>
              </div>
              <div className="earth-preview">
                <strong>Earth 截图核验位</strong>
                <div className="earth-placeholder compact">
                  <span>候选卡片未自动获取 Earth 截图</span>
                </div>
                <strong>Google Earth 历史影像核验</strong>
                <p>{candidate.mapPreview.screenshotStatus}</p>
                <a href={candidate.mapPreview.googleEarthWebUrl} target="_blank" rel="noreferrer">
                  打开 Earth 历史影像
                </a>
                {renderList(candidate.mapPreview.notes)}
              </div>
            </div>
            {(candidate.osintLinks ?? []).length > 0 ? (
              <section className="osint-links-panel">
                <h4>候选外部 OSINT 核验入口</h4>
                <div className="osint-link-grid">
                  {candidate.osintLinks?.map((link) => (
                    <a aria-label={`${link.title} for ${candidateLabel(candidate)}`} href={link.url} key={link.title} target="_blank" rel="noreferrer">
                      <strong>{link.title}</strong>
                      <span>{link.note}</span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
            <details>
              <summary>查看完整证据链</summary>
              <h4>为什么像</h4>
              {renderList(candidate.matchingEvidence)}
              <h4>不确定点</h4>
              {renderList(candidate.uncertainty)}
              <h4>Google Earth 核验</h4>
              <p>{candidate.mapLinks.googleEarthHint}</p>
              {renderList(candidate.earthVerificationChecklist)}
            </details>
          </article>
          );
        })}
      </div>
      {investigation ? (
        <details className="report">
          <summary>完整 Markdown 报告</summary>
          <pre>{investigation.report.fullMarkdown}</pre>
        </details>
      ) : null}
        </div>
      </details>
    </section>
  );
}
