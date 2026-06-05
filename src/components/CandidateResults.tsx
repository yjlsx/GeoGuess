import { useEffect, useMemo, useState } from "react";
import type { Investigation } from "../shared/types";
import { formatCoordinate } from "../shared/mapLinks";

type Props = {
  investigation: Investigation | null;
  loading: boolean;
  error: string | null;
  hasImage?: boolean;
  hasVisionKey?: boolean;
  analysisProgress?: number;
  matchingThreshold?: number;
  onShowSample?: () => void;
};

type Candidate = Investigation["candidates"][number];
type CandidateReviewStatus = "pending" | "keep" | "excluded" | "confirmed";
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
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  getCandidateLabel
}: {
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
    <div className="candidate-distribution-map" aria-label="候选位置分布地图" role="group">
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
  investigation,
  loading,
  error,
  hasImage = false,
  hasVisionKey = false,
  analysisProgress = 0,
  matchingThreshold = 0.6,
  onShowSample
}: Props) {
  const [copiedCandidateId, setCopiedCandidateId] = useState<string | null>(null);
  const [candidateReviewStatus, setCandidateReviewStatus] = useState<Record<string, CandidateReviewStatus>>({});
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

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

  useEffect(() => {
    setCopiedCandidateId(null);
    setCandidateReviewStatus({});
    setSelectedCandidateId(null);
  }, [investigation?.id]);

  useEffect(() => {
    setSelectedCandidateId((currentId) => {
      if (sortedCandidates.length === 0) {
        return null;
      }

      if (currentId && sortedCandidates.some((candidate) => candidate.id === currentId)) {
        return currentId;
      }

      return sortedCandidates[0].id;
    });
  }, [investigation?.id, sortedCandidates]);

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

  const clampedProgress = Math.max(0, Math.min(100, analysisProgress));
  const thresholdScore = Math.round(matchingThreshold * 100);
  const bestCandidate = sortedCandidates[0];
  const selectedCandidate = sortedCandidates.find((candidate) => candidate.id === selectedCandidateId) ?? bestCandidate;
  const selectedCandidateIndex = selectedCandidate ? sortedCandidates.findIndex((candidate) => candidate.id === selectedCandidate.id) : -1;
  const belowThresholdCount = sortedCandidates.filter((candidate) => typeof candidate.matchScore === "number" && candidate.matchScore < thresholdScore).length;
  const topVerificationNotes = selectedCandidate
    ? [
        ...(selectedCandidate.matchedFeatures ?? []).map((item) => `${item} 匹配`),
        ...(selectedCandidate.missingOrUnverifiedFeatures ?? []).map((item) => `${item} 待核验`),
        ...(selectedCandidate.viewpointNotes ?? []),
        ...selectedCandidate.earthVerificationChecklist
      ].slice(0, 8)
    : [];

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
              ? `生成 ${countSummary(sortedCandidates.length, "个候选坐标")}，包含低置信人工复核线索；下方显示 Google Maps 预览和 Google Earth 入口。`
              : "未生成候选坐标；模型返回为空，或候选缺少坐标。可补充来源、地区、字幕或更多连续截图后重试。"
        }
      ]
    : waitingAnalysisSteps;

  return (
    <section className="panel result-panel verification-workbench" aria-live="polite" role={loading ? "status" : error ? "alert" : undefined}>
      {error ? <div className="inline-error">{error}</div> : null}
      <div className="result-toolbar">
        <div>
          <p className="eyebrow">核验工作台</p>
          <h2>{investigation ? "候选结果" : loading ? "正在分析" : "等待分析"}</h2>
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
          {!investigation && !loading && onShowSample ? (
            <button className="secondary-button" type="button" onClick={onShowSample}>
              查看示例证据链
            </button>
          ) : null}
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
            <span>{sortedCandidates.length} 个候选</span>
          </div>
          <CandidateDistributionMap
            candidates={sortedCandidates}
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
              {sortedCandidates.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    {investigation
                      ? "本次没有可保留、排除或确认的候选点。请降低匹配阈值、补充范围线索，或上传更多连续截图后重新分析。"
                      : "暂无候选坐标，开始分析后这里会显示可保留、排除或确认的候选点。"}
                  </td>
                </tr>
              ) : null}
              {sortedCandidates.map((candidate, index) => {
                const status = candidateReviewStatus[candidate.id] ?? "pending";
                const label = candidateLabel(candidate);

                return (
                  <tr
                    aria-selected={selectedCandidate?.id === candidate.id}
                    className={`review-${status}${selectedCandidate?.id === candidate.id ? " selected-candidate-row" : ""}`}
                    key={candidate.id}
                    onClick={() => setSelectedCandidateId(candidate.id)}
                  >
                    <td>{index + 1}</td>
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
                    <td>{index === 0 ? "来源线索 + 待地图核验" : "视觉候选"}</td>
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
        {sortedCandidates.length === 0 ? (
          <div className="map-preview-grid">
            <div className="map-preview map-preview-empty">
              <div className="map-preview-header">
                <strong>Google Maps 卫星图像预览</strong>
              </div>
              <p>尚无候选坐标，无法加载 Google Maps 卫星预览。</p>
            </div>
            <div className="earth-preview">
              <strong>Google Earth 历史影像核验</strong>
              <p>尚无候选坐标，无法生成 Google Earth 入口。</p>
              {renderList(["先生成至少一个候选坐标，再对比道路、轨道、建筑、花坛、电线杆和视角关系。"])}
            </div>
          </div>
        ) : (
          <p className="muted">每个候选卡片都包含 Google Maps 卫星预览、Google Earth 入口和逐项核验清单。</p>
        )}
      </div>
      <div className="candidate-list">
        {sortedCandidates.length === 0 ? <p className="muted">尚未生成候选坐标</p> : null}
        {sortedCandidates.map((candidate, index) => (
          <article className="candidate" key={candidate.id}>
            <div className="candidate-header">
              <strong>{candidate.name ? `候选 ${index + 1}：${candidate.name}` : `候选 ${index + 1}`}</strong>
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
                  <strong>{index === 0 ? "Google Maps 卫星图像预览" : `候选 ${index + 1} 地图预览`}</strong>
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
        ))}
      </div>
      {investigation ? (
        <details className="report">
          <summary>完整 Markdown 报告</summary>
          <pre>{investigation.report.fullMarkdown}</pre>
        </details>
      ) : null}
    </section>
  );
}
