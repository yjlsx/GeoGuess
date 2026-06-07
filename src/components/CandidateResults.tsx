import { useEffect, useMemo, useRef, useState } from "react";
import type { CandidateManualVerdict, FeatureMatch, Investigation } from "../shared/types";
import { formatCoordinate } from "../shared/mapLinks";

type Candidate = Investigation["candidates"][number];
type FeatureMatchStatus = NonNullable<Candidate["featureMatches"]>[number]["status"];
type CandidateManualVerdictStatus = CandidateManualVerdict["status"];

type Props = {
  assetMediaType?: string | null;
  assetName?: string | null;
  assetPreviewUrl?: string | null;
  investigation: Investigation | null;
  loading: boolean;
  error: string | null;
  hasImage?: boolean;
  hasVisionKey?: boolean;
  analysisProgress?: number;
  analysisStartedAt?: number | null;
  analysisFinishedAt?: number | null;
  showLowConfidenceCandidates?: boolean;
  maxLowConfidenceCandidates?: number;
  matchingThreshold?: number;
  modelName?: string | null;
  now?: number;
  onFeatureMatchStatusChange?: (candidateId: string, featureMatchIndex: number, status: FeatureMatchStatus) => void;
  onFeatureMatchAdd?: (candidateId: string, featureMatch: FeatureMatch) => void;
  onCandidateVerdictChange?: (candidateId: string, status: CandidateManualVerdictStatus, rationale: string) => void;
};

type EvidenceTab = "canvas" | "ocr" | "visual" | "metadata" | "reasoning" | "map";
type MapEvidenceTab = "distribution" | "satellite";
type CandidateFilterMode = "all" | "high" | "above-threshold";
type CanvasClueMarker = {
  label: string;
  markerTitle: string;
  style: { left: string; top: string };
};
type ProcessStep = {
  title: string;
  detail: string;
  status?: "done" | "active" | "pending";
};

const candidateFilterLabels: Record<CandidateFilterMode, string> = {
  all: "全部候选",
  high: "高置信",
  "above-threshold": "高于阈值"
};

const candidateFilterModes: CandidateFilterMode[] = ["all", "high", "above-threshold"];
const featureMatchStatuses: FeatureMatchStatus[] = ["matched", "partial", "unverified", "mismatch"];
const candidateVerdictStatuses: CandidateManualVerdictStatus[] = ["confirmed", "kept", "excluded"];

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

function candidateVerdictLabel(status: CandidateManualVerdictStatus | undefined) {
  if (status === "confirmed") {
    return "已确认";
  }
  if (status === "kept") {
    return "保留核验";
  }
  if (status === "excluded") {
    return "已排除";
  }
  return "未人工判定";
}

function candidateVerdictActionLabel(status: CandidateManualVerdictStatus) {
  if (status === "confirmed") {
    return "确认候选";
  }
  if (status === "kept") {
    return "保留候选";
  }
  if (status === "excluded") {
    return "排除候选";
  }
  return "重置候选";
}

function candidateScoreLabel(candidate: Candidate | null | undefined) {
  if (!candidate) {
    return "--";
  }
  return typeof candidate.matchScore === "number" ? `${candidate.matchScore.toFixed(1)}%` : confidenceLabel(candidate.confidence);
}

function CandidateVerdictPanel({
  candidate,
  onChange
}: {
  candidate: Candidate;
  onChange?: (status: CandidateManualVerdictStatus, rationale: string) => void;
}) {
  const draftRationaleRef = useRef(candidate.manualVerdict?.rationale ?? "");
  const draftRationaleInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const nextRationale = candidate.manualVerdict?.rationale ?? "";
    draftRationaleRef.current = nextRationale;
    if (draftRationaleInputRef.current) {
      draftRationaleInputRef.current.value = nextRationale;
    }
  }, [candidate.id, candidate.manualVerdict?.rationale]);

  const currentStatus = candidate.manualVerdict?.status ?? "unreviewed";
  const updateDraftRationale = (nextRationale: string) => {
    draftRationaleRef.current = nextRationale;
  };

  return (
    <section className="rail-card candidate-verdict-card" aria-label="当前候选人工结论">
      <div className="rail-card-heading compact">
        <h3>人工结论</h3>
        <span>{candidateVerdictLabel(currentStatus)}</span>
      </div>
      <strong className={`candidate-verdict-status verdict-${currentStatus}`}>人工结论：{candidateVerdictLabel(currentStatus)}</strong>
      <label className="field candidate-verdict-rationale">
        人工结论理由
        <textarea
          aria-label="人工结论理由"
          ref={draftRationaleInputRef}
          defaultValue={candidate.manualVerdict?.rationale ?? ""}
          onChange={(event) => updateDraftRationale(event.target.value)}
          onInput={(event) => updateDraftRationale(event.currentTarget.value)}
          placeholder="记录确认、保留或排除的地图/Earth 对照依据"
        />
      </label>
      <div className="candidate-verdict-actions">
        {candidateVerdictStatuses.map((status) => (
          <button
            aria-pressed={currentStatus === status}
            className={currentStatus === status ? "small-button active" : "small-button"}
            key={status}
            type="button"
            onClick={() => onChange?.(status, draftRationaleInputRef.current?.value || draftRationaleRef.current)}
          >
            {candidateVerdictActionLabel(status)}
          </button>
        ))}
      </div>
      {candidate.manualVerdict?.rationale ? <p>{candidate.manualVerdict.rationale}</p> : null}
    </section>
  );
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

function candidateMatchesFilter(candidate: Candidate, filterMode: CandidateFilterMode, thresholdScore: number) {
  if (filterMode === "all") {
    return true;
  }
  if (filterMode === "high") {
    return candidate.confidence === "high" || (candidate.matchScore ?? 0) >= 80;
  }
  if (filterMode === "above-threshold") {
    return typeof candidate.matchScore === "number" ? candidate.matchScore >= thresholdScore : false;
  }
  return true;
}

function applyLowConfidenceDisplaySettings(
  candidates: Candidate[],
  showLowConfidenceCandidates: boolean,
  maxLowConfidenceCandidates: number
) {
  if (!showLowConfidenceCandidates) {
    return candidates.filter((candidate) => candidate.confidence !== "low");
  }

  const lowLimit = Math.max(0, Math.floor(maxLowConfidenceCandidates));
  let visibleLowCount = 0;
  return candidates.filter((candidate) => {
    if (candidate.confidence !== "low") {
      return true;
    }
    visibleLowCount += 1;
    return visibleLowCount <= lowLimit;
  });
}

function markerPositionForClue(clue: string, fallbackIndex: number) {
  if (/cctv\.com|央视网/i.test(clue)) {
    return { left: "91%", top: "7%" };
  }
  if (/cctv\s*7|cctv-?7|cctv/i.test(clue)) {
    return { left: "88%", top: "7%" };
  }
  if (/国防军事|国防|军事频道/i.test(clue)) {
    return { left: "9%", top: "7%" };
  }
  if (/军事报道/.test(clue)) {
    return { left: "13%", top: "76%" };
  }
  if (/火箭军|新兵团|袁航|帮助他们|合格军人|地方青年/.test(clue)) {
    return { left: "48%", top: "72%" };
  }
  return clueMarkerPositions[fallbackIndex] ?? clueMarkerPositions[0];
}

function buildClueChips(investigation: Investigation | null, selectedCandidate: Candidate | undefined) {
  const prominentVisibleLabels = investigation?.extractedClues.visibleLabels.filter((item) => !/^(CCTV|CGTN|BBC|CNN|NHK)\s*\d*$/i.test(item.trim())) ?? [];
  const secondaryVisibleLabels = investigation?.extractedClues.visibleLabels.filter((item) => !prominentVisibleLabels.includes(item)) ?? [];
  const prominentOcrText = [...(investigation?.extractedClues.ocrText ?? [])].sort((left, right) => left.length - right.length);
  const candidateClues = selectedCandidate
    ? [
        ...(selectedCandidate.matchedFeatures ?? []),
        ...(selectedCandidate.viewpointNotes ?? [])
      ]
    : [];
  const investigationClues = investigation
    ? [
        ...prominentVisibleLabels,
        ...prominentOcrText,
        ...secondaryVisibleLabels,
        ...investigation.extractedClues.ocrText.map((item) => `OCR：${item}`),
        ...investigation.extractedClues.visibleLabels.map((item) => `标识：${item}`),
        ...investigation.extractedClues.sceneFeatures,
        ...investigation.extractedClues.spatialRelationships
      ]
    : [];

  return uniqueItems([...investigationClues, ...candidateClues]).slice(0, 5);
}

function buildCanvasMarkers(clues: string[]): CanvasClueMarker[] {
  return clues.map((clue, index) => ({
      label: String(index + 1),
      markerTitle: clue,
      style: markerPositionForClue(clue, index)
    }));
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
  { left: "9%", top: "7%" },
  { left: "91%", top: "7%" },
  { left: "13%", top: "76%" },
  { left: "48%", top: "72%" },
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

function featureMatchStatusLabel(status: NonNullable<Candidate["featureMatches"]>[number]["status"]) {
  if (status === "matched") {
    return "已匹配";
  }
  if (status === "partial") {
    return "部分匹配";
  }
  if (status === "mismatch") {
    return "不匹配";
  }
  return "待核验";
}

function confidenceTextLabel(confidence: FeatureMatch["aiVerification"] extends infer Verification ? Verification extends { confidence: infer Value } ? Value : never : never) {
  if (confidence === "high") {
    return "高置信";
  }
  if (confidence === "medium") {
    return "中置信";
  }
  return "低置信";
}

function aiVerificationStatusLabel(status: NonNullable<FeatureMatch["aiVerification"]>["status"]) {
  if (status === "supports") {
    return "支持";
  }
  if (status === "contradicts") {
    return "矛盾";
  }
  return "证据不足";
}

function readEvidenceImageAttachment(file: File): Promise<NonNullable<FeatureMatch["mapScreenshotAttachment"]>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("无法读取截图附件。"));
        return;
      }

      resolve({
        name: file.name,
        dataUrl: reader.result,
        mediaType: file.type || "application/octet-stream"
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error("无法读取截图附件。"));
    reader.readAsDataURL(file);
  });
}

function FeatureMatchBoard({
  ariaLabel = "证据对照",
  candidate,
  onAdd,
  onStatusChange,
  variant = "default"
}: {
  ariaLabel?: string;
  candidate: Candidate;
  onAdd?: (featureMatch: FeatureMatch) => void;
  onStatusChange?: (featureMatchIndex: number, status: FeatureMatchStatus) => void;
  variant?: "default" | "rail";
}) {
  const featureMatches = candidate.featureMatches ?? [];
  const [draftImageFeature, setDraftImageFeature] = useState("");
  const [draftMapFeature, setDraftMapFeature] = useState("");
  const [draftVerification, setDraftVerification] = useState("");
  const [draftImageAnnotation, setDraftImageAnnotation] = useState("");
  const [draftMapAnnotation, setDraftMapAnnotation] = useState("");
  const [draftEvidenceLink, setDraftEvidenceLink] = useState("");
  const [draftMapScreenshotUrl, setDraftMapScreenshotUrl] = useState("");
  const [draftMapScreenshotAttachment, setDraftMapScreenshotAttachment] = useState<FeatureMatch["mapScreenshotAttachment"]>();
  const [draftEarthImageDate, setDraftEarthImageDate] = useState("");
  const [draftAiVerificationStatus, setDraftAiVerificationStatus] = useState<NonNullable<FeatureMatch["aiVerification"]>["status"]>("inconclusive");
  const [draftAiVerificationConfidence, setDraftAiVerificationConfidence] = useState<NonNullable<FeatureMatch["aiVerification"]>["confidence"]>("medium");
  const [draftAiVerificationRationale, setDraftAiVerificationRationale] = useState("");
  const [draftAiVerificationModel, setDraftAiVerificationModel] = useState("");

  const boardClassName = variant === "rail" ? "feature-match-board rail-card rail-feature-match-board" : "feature-match-board";
  const canAddFeatureMatch = Boolean(
    onAdd &&
      draftImageFeature.trim() &&
      draftMapFeature.trim() &&
      draftVerification.trim()
  );
  const addFeatureMatch = () => {
    if (!canAddFeatureMatch || !onAdd) {
      return;
    }

    const imageAnnotation = draftImageAnnotation.trim();
    const mapAnnotation = draftMapAnnotation.trim();
    const evidenceLink = draftEvidenceLink.trim();
    const mapScreenshotUrl = draftMapScreenshotUrl.trim();
    const earthImageDate = draftEarthImageDate.trim();
    const aiVerificationRationale = draftAiVerificationRationale.trim();
    const aiVerificationModel = draftAiVerificationModel.trim();
    onAdd({
      imageFeature: draftImageFeature.trim(),
      mapFeature: draftMapFeature.trim(),
      verification: draftVerification.trim(),
      ...(imageAnnotation ? { imageAnnotation } : {}),
      ...(mapAnnotation ? { mapAnnotation } : {}),
      ...(evidenceLink ? { evidenceLink } : {}),
      ...(mapScreenshotUrl ? { mapScreenshotUrl } : {}),
      ...(draftMapScreenshotAttachment ? { mapScreenshotAttachment: draftMapScreenshotAttachment } : {}),
      ...(earthImageDate ? { earthImageDate } : {}),
      ...(aiVerificationRationale
        ? {
            aiVerification: {
              status: draftAiVerificationStatus,
              confidence: draftAiVerificationConfidence,
              rationale: aiVerificationRationale,
              ...(aiVerificationModel ? { model: aiVerificationModel } : {})
            }
          }
        : {}),
      status: "unverified"
    });
    setDraftImageFeature("");
    setDraftMapFeature("");
    setDraftVerification("");
    setDraftImageAnnotation("");
    setDraftMapAnnotation("");
    setDraftEvidenceLink("");
    setDraftMapScreenshotUrl("");
    setDraftMapScreenshotAttachment(undefined);
    setDraftEarthImageDate("");
    setDraftAiVerificationStatus("inconclusive");
    setDraftAiVerificationConfidence("medium");
    setDraftAiVerificationRationale("");
    setDraftAiVerificationModel("");
  };
  const handleMapScreenshotAttachmentChange = async (file: File | undefined) => {
    if (!file) {
      setDraftMapScreenshotAttachment(undefined);
      return;
    }

    setDraftMapScreenshotAttachment(await readEvidenceImageAttachment(file));
  };

  return (
    <section className={boardClassName} aria-label={ariaLabel}>
      <div className="feature-match-heading">
        <h4>证据对照</h4>
        <span>{featureMatches.length} 项</span>
      </div>
      {featureMatches.length > 0 ? (
        <div className="feature-match-list">
          {featureMatches.map((match, index) => (
            <article
              aria-label={`证据对应 ${index + 1}`}
              className={`feature-match-item match-${match.status}`}
              key={`${match.imageFeature}-${match.mapFeature}-${index}`}
            >
              <span className="feature-match-index">{index + 1}</span>
              <div>
                <strong>原图特征</strong>
                <p>{match.imageFeature}</p>
              </div>
              <div>
                <strong>地图 / Earth 对应</strong>
                <p>{match.mapFeature}</p>
              </div>
              <div>
                <strong>{featureMatchStatusLabel(match.status)}</strong>
                <p>{match.verification}</p>
                {match.imageAnnotation || match.mapAnnotation || match.evidenceLink || match.mapScreenshotUrl || match.earthImageDate || match.aiVerification ? (
                  <dl className="feature-match-source-details" aria-label={`证据对应 ${index + 1} 来源详情`}>
                    {match.imageAnnotation ? (
                      <>
                        <dt>原图标注说明</dt>
                        <dd>{match.imageAnnotation}</dd>
                      </>
                    ) : null}
                    {match.mapAnnotation ? (
                      <>
                        <dt>地图/Earth 标注说明</dt>
                        <dd>{match.mapAnnotation}</dd>
                      </>
                    ) : null}
                    {match.evidenceLink ? (
                      <>
                        <dt>核验链接</dt>
                        <dd>{match.evidenceLink}</dd>
                      </>
                    ) : null}
                    {match.mapScreenshotUrl ? (
                      <>
                        <dt>地图/Earth 截图</dt>
                        <dd>{match.mapScreenshotUrl}</dd>
                      </>
                    ) : null}
                    {match.mapScreenshotAttachment ? (
                      <>
                        <dt>地图/Earth 截图附件</dt>
                        <dd>{match.mapScreenshotAttachment.name}</dd>
                      </>
                    ) : null}
                    {match.earthImageDate ? (
                      <>
                        <dt>地图/Earth 影像日期</dt>
                        <dd>{match.earthImageDate}</dd>
                      </>
                    ) : null}
                    {match.aiVerification ? (
                      <>
                        <dt>AI 核验</dt>
                        <dd>AI 核验：{aiVerificationStatusLabel(match.aiVerification.status)}</dd>
                        <dt>置信度</dt>
                        <dd>置信度：{confidenceTextLabel(match.aiVerification.confidence)}</dd>
                        <dt>AI 核验理由</dt>
                        <dd>{match.aiVerification.rationale}</dd>
                        {match.aiVerification.model ? (
                          <>
                            <dt>AI 核验模型</dt>
                            <dd>{match.aiVerification.model}</dd>
                          </>
                        ) : null}
                        {match.aiVerification.checkedAt ? (
                          <>
                            <dt>AI 核验时间</dt>
                            <dd>{match.aiVerification.checkedAt}</dd>
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </dl>
                ) : null}
                {match.mapScreenshotAttachment ? (
                  <figure className="feature-match-screenshot-preview">
                    <img src={match.mapScreenshotAttachment.dataUrl} alt={`证据对应 ${index + 1} 地图/Earth 截图附件`} />
                    <figcaption>{match.mapScreenshotAttachment.name}</figcaption>
                  </figure>
                ) : null}
                {onStatusChange ? (
                  <div className="feature-match-status-controls" aria-label={`证据对应 ${index + 1} 人工标记`}>
                    {featureMatchStatuses.map((status) => (
                      <button
                        aria-pressed={match.status === status}
                        className={match.status === status ? "active" : ""}
                        key={status}
                        type="button"
                        onClick={() => onStatusChange(index, status)}
                      >
                        标记为{featureMatchStatusLabel(status)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">尚未记录原图与地图/Earth 的对应关系。</p>
      )}
      {onAdd ? (
        <div className="feature-match-add-form" aria-label="新增证据对应">
          <label>
            新增原图特征
            <input
              aria-label="新增原图特征"
              value={draftImageFeature}
              onChange={(event) => setDraftImageFeature(event.target.value)}
              placeholder="例如：原图左侧蓝色屋顶贴近弯道"
            />
          </label>
          <label>
            新增地图或 Earth 对应
            <input
              aria-label="新增地图或 Earth 对应"
              value={draftMapFeature}
              onChange={(event) => setDraftMapFeature(event.target.value)}
              placeholder="例如：Earth 中候选点西北角蓝屋顶"
            />
          </label>
          <label>
            新增核验依据
            <textarea
              aria-label="新增核验依据"
              value={draftVerification}
              onChange={(event) => setDraftVerification(event.target.value)}
              placeholder="记录在 Maps/Earth 中需要对照的线条、圈选或截图说明"
            />
          </label>
          <label>
            原图标注说明
            <input
              aria-label="原图标注说明"
              value={draftImageAnnotation}
              onChange={(event) => setDraftImageAnnotation(event.target.value)}
              placeholder="例如：红圈圈住屋顶，蓝线沿入口道路"
            />
          </label>
          <label>
            地图/Earth 标注说明
            <input
              aria-label="地图/Earth 标注说明"
              value={draftMapAnnotation}
              onChange={(event) => setDraftMapAnnotation(event.target.value)}
              placeholder="例如：Earth 截图红圈圈住同一屋顶"
            />
          </label>
          <label>
            核验链接（Google Maps/Earth）
            <input
              aria-label="核验链接（Google Maps/Earth）"
              value={draftEvidenceLink}
              onChange={(event) => setDraftEvidenceLink(event.target.value)}
              placeholder="粘贴 Google Maps/Earth、OSM 或其它可复核链接"
            />
          </label>
          <label>
            地图/Earth 截图或来源
            <input
              aria-label="地图/Earth 截图或来源"
              value={draftMapScreenshotUrl}
              onChange={(event) => setDraftMapScreenshotUrl(event.target.value)}
              placeholder="例如：earth-candidate-1-2024-04.png"
            />
          </label>
          <label>
            地图/Earth 截图附件
            <input
              aria-label="地图/Earth 截图附件"
              accept="image/*"
              type="file"
              onChange={(event) => void handleMapScreenshotAttachmentChange(event.target.files?.[0])}
            />
          </label>
          {draftMapScreenshotAttachment ? (
            <figure className="feature-match-screenshot-preview draft">
              <img src={draftMapScreenshotAttachment.dataUrl} alt="待添加地图/Earth 截图附件" />
              <figcaption>{draftMapScreenshotAttachment.name}</figcaption>
            </figure>
          ) : null}
          <label>
            地图/Earth 影像日期
            <input
              aria-label="地图/Earth 影像日期"
              value={draftEarthImageDate}
              onChange={(event) => setDraftEarthImageDate(event.target.value)}
              placeholder="例如：2024-04、2023-10-18 或历史影像未知"
            />
          </label>
          <div className="feature-match-ai-fields" aria-label="AI 核验证据">
            <label>
              AI 核验结论
              <select
                aria-label="AI 核验结论"
                value={draftAiVerificationStatus}
                onChange={(event) => setDraftAiVerificationStatus(event.target.value as NonNullable<FeatureMatch["aiVerification"]>["status"])}
              >
                <option value="supports">支持</option>
                <option value="contradicts">矛盾</option>
                <option value="inconclusive">证据不足</option>
              </select>
            </label>
            <label>
              AI 核验置信度
              <select
                aria-label="AI 核验置信度"
                value={draftAiVerificationConfidence}
                onChange={(event) => setDraftAiVerificationConfidence(event.target.value as NonNullable<FeatureMatch["aiVerification"]>["confidence"])}
              >
                <option value="high">高置信</option>
                <option value="medium">中置信</option>
                <option value="low">低置信</option>
              </select>
            </label>
            <label>
              AI 核验理由
              <textarea
                aria-label="AI 核验理由"
                value={draftAiVerificationRationale}
                onChange={(event) => setDraftAiVerificationRationale(event.target.value)}
                placeholder="模型对原图特征与地图/Earth 对应关系的判断理由"
              />
            </label>
            <label>
              AI 核验模型
              <input
                aria-label="AI 核验模型"
                value={draftAiVerificationModel}
                onChange={(event) => setDraftAiVerificationModel(event.target.value)}
                placeholder="例如：geo-vision-v2"
              />
            </label>
          </div>
          <button className="small-button" type="button" disabled={!canAddFeatureMatch} onClick={addFeatureMatch}>
            添加证据对应
          </button>
        </div>
      ) : null}
    </section>
  );
}

function countSummary(count: number, unit: string) {
  return `${count} ${unit}`;
}

function compactErrorMessage(error: string) {
  if (/联网候选搜索暂时不可用|HTTP\s*50[0234]|upstream_error|Upstream request failed/i.test(error)) {
    return {
      title: "候选坐标搜索暂时不可用",
      detail:
        "模型服务或 Base URL 上游返回错误，系统已保留可用线索但没有拿到候选坐标。候选搜索需要支持 Responses API 和 web_search_preview；可稍后重试，或在右上角设置里切换到支持联网搜索的模型/Base URL。",
      raw: error
    };
  }
  return null;
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
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useMemo(() => buildDistributionMap(candidates), [candidates]);

  if (!map) {
    return <div className="map-placeholder">无候选坐标</div>;
  }

  function expandMap() {
    void mapRef.current?.requestFullscreen?.();
  }

  return (
    <div className="candidate-distribution-map" aria-label={ariaLabel} ref={mapRef} role="group">
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
      <button className="map-corner-expand" type="button" onClick={expandMap} aria-label="全屏查看候选分布" title="全屏查看候选分布">
        <span aria-hidden="true" />
      </button>
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
  investigation,
  loading,
  error,
  hasImage = false,
  hasVisionKey = false,
  analysisProgress = 0,
  analysisStartedAt = null,
  analysisFinishedAt = null,
  showLowConfidenceCandidates = true,
  maxLowConfidenceCandidates = 10,
  matchingThreshold = 0.6,
  modelName = null,
  now = Date.now(),
  onFeatureMatchStatusChange,
  onFeatureMatchAdd,
  onCandidateVerdictChange
}: Props) {
  const [copiedCandidateId, setCopiedCandidateId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [activeEvidenceTab, setActiveEvidenceTab] = useState<EvidenceTab>("canvas");
  const [activeMapEvidenceTab, setActiveMapEvidenceTab] = useState<MapEvidenceTab>("distribution");
  const [filterOpen, setFilterOpen] = useState(false);
  const [candidateFilterMode, setCandidateFilterMode] = useState<CandidateFilterMode>("all");
  const [mediaZoom, setMediaZoom] = useState(1);
  const [mediaFit, setMediaFit] = useState<"cover" | "contain">("cover");
  const [mediaEnhanced, setMediaEnhanced] = useState(false);

  const openMapEvidenceTab = (mapTab: MapEvidenceTab = "distribution") => {
    setActiveEvidenceTab("map");
    setActiveMapEvidenceTab(mapTab);
  };

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
  const visibleCandidates = useMemo(
    () => applyLowConfidenceDisplaySettings(sortedCandidates, showLowConfidenceCandidates, maxLowConfidenceCandidates),
    [maxLowConfidenceCandidates, showLowConfidenceCandidates, sortedCandidates]
  );
  const hiddenLowConfidenceCount = sortedCandidates.length - visibleCandidates.length;
  const filteredCandidates = useMemo(() => {
    return visibleCandidates.filter((candidate) => candidateMatchesFilter(candidate, candidateFilterMode, thresholdScore));
  }, [candidateFilterMode, thresholdScore, visibleCandidates]);
  const candidateFilterCounts = useMemo(() => {
    return candidateFilterModes.reduce((counts, filterMode) => {
      counts[filterMode] = visibleCandidates.filter((candidate) => candidateMatchesFilter(candidate, filterMode, thresholdScore)).length;
      return counts;
    }, {} as Record<CandidateFilterMode, number>);
  }, [thresholdScore, visibleCandidates]);

  useEffect(() => {
    setCopiedCandidateId(null);
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

  useEffect(() => {
    setMediaZoom(1);
    setMediaFit("cover");
    setMediaEnhanced(false);
  }, [assetPreviewUrl]);

  async function copyCoordinate(candidate: Candidate) {
    const coordinate = formatCoordinate(candidate.latitude, candidate.longitude);
    await navigator.clipboard?.writeText(coordinate);
    setCopiedCandidateId(candidate.id);
  }

  function candidateCoordinate(candidate: Candidate) {
    return formatCoordinate(candidate.latitude, candidate.longitude);
  }

  function candidateLabel(candidate: Candidate) {
    return candidate.name ?? candidateCoordinate(candidate);
  }

  function candidateSecondaryLabel(candidate: Candidate) {
    return candidate.name ? candidateCoordinate(candidate) : "未命名候选点";
  }

  function candidateRankingLabel(candidate: Candidate, displayRank: number) {
    const verdictStatus = candidate.manualVerdict?.status;
    const verdictSuffix = verdictStatus && verdictStatus !== "unreviewed" ? ` ${candidateVerdictLabel(verdictStatus)}` : "";
    return `查看候选 ${displayRank} ${candidateLabel(candidate)}${verdictSuffix}`;
  }

  const bestCandidate = filteredCandidates[0] ?? visibleCandidates[0];
  const selectedCandidate = filteredCandidates.find((candidate) => candidate.id === selectedCandidateId) ?? filteredCandidates[0];
  const selectedCandidateIndex = selectedCandidate ? visibleCandidates.findIndex((candidate) => candidate.id === selectedCandidate.id) : -1;
  const selectedFilterLabel = candidateFilterLabels[candidateFilterMode];
  const candidateFilterSummary = candidateFilterMode === "all" ? `${visibleCandidates.length} 个候选` : `${filteredCandidates.length}/${visibleCandidates.length} 个候选`;
  const belowThresholdCount = visibleCandidates.filter((candidate) => typeof candidate.matchScore === "number" && candidate.matchScore < thresholdScore).length;
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
  const canvasMarkers = buildCanvasMarkers(canvasClues);
  const metadataRows = buildMetadataRows(investigation, selectedCandidate, assetName);
  const colorSwatches = buildColorSwatches(investigation);
  const compactError = error ? compactErrorMessage(error) : null;
  const candidateSearchUnavailableStep = investigation?.searchProcess.find((step) => /候选坐标搜索暂时不可用|Candidate coordinate search temporarily unavailable/i.test(step.title));
  const candidateSearchUnavailableDetail = candidateSearchUnavailableStep?.rationale;
  const noCandidateReason = candidateSearchUnavailableDetail
    ? "候选搜索上游暂时不可用；本次分析已保留识别线索、搜索语句和人工核验报告，但不会伪造候选坐标。"
    : "模型没有返回可核验候选坐标；可补充来源、地区、字幕或更多连续截图后重试。";
  const mediaStyle = {
    objectFit: mediaFit,
    transform: `scale(${mediaZoom})`,
    filter: mediaEnhanced ? "brightness(1.18) contrast(1.08) saturate(1.08)" : "none"
  };

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
          title: candidateSearchUnavailableStep?.title ?? "候选坐标生成完成",
          detail:
            visibleCandidates.length > 0
              ? `展示 ${countSummary(visibleCandidates.length, "个候选坐标")}，包含按设置保留的低置信候选；地图预览集中在“地图核验”标签，高级详情保留候选对比、证据链和报告。`
              : candidateSearchUnavailableDetail ?? "未生成候选坐标；模型返回为空，或候选缺少坐标。可补充来源、地区、字幕或更多连续截图后重试。"
        }
      ]
    : waitingAnalysisSteps;

  return (
    <section className="panel result-panel verification-workbench command-workbench" aria-live="polite" role={loading ? "status" : error ? "alert" : undefined}>
      {error ? (
        compactError ? (
          <div className="inline-error compact-error">
            <strong>{compactError.title}</strong>
            <span>{compactError.detail}</span>
            <details>
              <summary>查看技术详情</summary>
              <p>{compactError.raw}</p>
            </details>
          </div>
        ) : (
          <div className="inline-error">{error}</div>
        )
      ) : null}
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
        <span className={visibleCandidates.length > 0 ? "workbench-count ready" : "workbench-count"}>
          {visibleCandidates.length > 0 ? `${visibleCandidates.length} 个候选` : "暂无候选"}
        </span>
      </div>
      {hiddenLowConfidenceCount > 0 ? (
        <p className="threshold-review-note">
          已按设置隐藏 {hiddenLowConfidenceCount} 个低置信候选。
        </p>
      ) : null}
      {belowThresholdCount > 0 ? (
        <p className="threshold-review-note">
          显示 {belowThresholdCount} 个低于 {thresholdScore} 分阈值的低置信候选，便于继续地图核验。
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
              <button
                className={activeEvidenceTab === tab ? "active" : ""}
                key={tab}
                type="button"
                onClick={() => (tab === "map" ? openMapEvidenceTab("distribution") : setActiveEvidenceTab(tab))}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={activeEvidenceTab === "map" ? "evidence-canvas-frame map-canvas-frame" : "evidence-canvas-frame"}>
            {activeEvidenceTab === "map" ? (
              <div className="evidence-map-tab-view" aria-label="地图核验">
                <div className="map-subtabs" role="tablist" aria-label="地图核验视图">
                  <button
                    className={activeMapEvidenceTab === "distribution" ? "active" : ""}
                    type="button"
                    role="tab"
                    aria-selected={activeMapEvidenceTab === "distribution"}
                    onClick={() => setActiveMapEvidenceTab("distribution")}
                  >
                    候选分布
                  </button>
                  <button
                    className={activeMapEvidenceTab === "satellite" ? "active" : ""}
                    type="button"
                    role="tab"
                    aria-selected={activeMapEvidenceTab === "satellite"}
                    onClick={() => setActiveMapEvidenceTab("satellite")}
                  >
                    卫星图
                  </button>
                </div>
                {activeMapEvidenceTab === "distribution" ? (
                  <section className="evidence-map-card map-tab-card" role="tabpanel" aria-label="候选分布">
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
                ) : (
                  <section className="evidence-map-card map-tab-card selected-map-card" role="tabpanel" aria-label="卫星图">
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
                          allowFullScreen
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                        <div className="selected-map-overlay">
                          <strong>{selectedCandidate.name ?? "未命名候选点"}</strong>
                          <span>{candidateCoordinate(selectedCandidate)}</span>
                        </div>
                        <a
                          className="map-corner-expand map-corner-link"
                          href={selectedCandidate.mapLinks.googleMaps}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="在 Google Maps 中打开当前候选"
                          title="在 Google Maps 中打开当前候选"
                        >
                          <span aria-hidden="true" />
                        </a>
                      </div>
                    ) : (
                      <div className="map-placeholder">等待候选坐标</div>
                    )}
                  </section>
                )}
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
                  <video className="evidence-main-media" src={assetPreviewUrl} muted controls style={mediaStyle} />
                ) : null}
                {assetPreviewUrl && !assetMediaType?.startsWith("video/") ? (
                  <img className="evidence-main-media" src={assetPreviewUrl} alt={assetName ? `${assetName} 证据预览` : "证据预览"} style={mediaStyle} />
                ) : null}
                {!assetPreviewUrl ? (
                  <div className="evidence-empty-stage">
                    <strong>{investigation ? "历史调查素材未缓存" : hasImage ? "素材预览生成中" : "等待上传证据素材"}</strong>
                    <span>{investigation ? "候选与证据链仍可继续核验。" : "上传图片或视频后，这里会显示主证据画布和线索标记。"}</span>
                  </div>
                ) : null}
                {assetPreviewUrl ? (
                  <div className="canvas-marker-layer" aria-hidden="true">
                    {canvasMarkers.map((clue, index) => (
                      <span
                        className="canvas-marker"
                        key={`${clue.markerTitle}-${index}`}
                        style={clue.style}
                        title={clue.markerTitle}
                      >
                        {clue.label}
                      </span>
                    ))}
                  </div>
                ) : null}
                {assetPreviewUrl ? (
                  <div className="canvas-tool-stack" aria-label="证据图工具">
                    <button type="button" aria-label="缩小证据图" title="缩小证据图" onClick={() => setMediaZoom((zoom) => Math.max(0.5, Number((zoom - 0.25).toFixed(2))))}>
                      ⌕
                    </button>
                    <button
                      type="button"
                      aria-label="切换完整显示"
                      title="切换完整显示"
                      onClick={() => setMediaFit((fit) => (fit === "cover" ? "contain" : "cover"))}
                    >
                      □
                    </button>
                    <button type="button" aria-label="放大证据图" title="放大证据图" onClick={() => setMediaZoom((zoom) => Math.min(3, Number((zoom + 0.25).toFixed(2))))}>
                      ＋
                    </button>
                    <button
                      type="button"
                      aria-label="重置证据图"
                      title="重置证据图"
                      onClick={() => {
                        setMediaZoom(1);
                        setMediaFit("cover");
                        setMediaEnhanced(false);
                      }}
                    >
                      ↻
                    </button>
                    <button type="button" aria-label="增强图像亮度" title="增强图像亮度" onClick={() => setMediaEnhanced((enhanced) => !enhanced)}>
                      ☼
                    </button>
                  </div>
                ) : null}
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
          {selectedCandidate ? (
            <section className="primary-comparison-panel" aria-label="原图 / 地图对照">
              <div className="primary-comparison-heading">
                <h3>原图 / 地图对照</h3>
                <span>{candidateScoreLabel(selectedCandidate)}</span>
              </div>
              <div className="comparison-split">
                <div className="comparison-pane original-pane">
                  <strong>原图</strong>
                  {assetPreviewUrl ? (
                    assetMediaType?.startsWith("video/") ? (
                      <video src={assetPreviewUrl} muted controls />
                    ) : (
                      <img src={assetPreviewUrl} alt={assetName ? `${assetName} 原图对照` : "原图对照"} />
                    )
                  ) : (
                    <div className="comparison-empty">原图预览未缓存</div>
                  )}
                </div>
                <div className="comparison-pane map-pane">
                  <strong>当前候选地图 / Earth</strong>
                  <iframe
                    title="当前候选地图对照"
                    src={selectedCandidate.mapPreview.googleMapsEmbedUrl}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                  <div className="comparison-map-meta">
                    <strong>{candidateLabel(selectedCandidate)}</strong>
                    <span>{candidateSecondaryLabel(selectedCandidate)}</span>
                  </div>
                </div>
              </div>
              <div className="comparison-actions">
                <a className="inline-action" href={selectedCandidate.mapLinks.googleMaps} target="_blank" rel="noreferrer">
                  打开 Maps 对照
                </a>
                <a className="inline-action" href={selectedCandidate.mapPreview.googleEarthWebUrl} target="_blank" rel="noreferrer">
                  打开 Earth 对照
                </a>
              </div>
            </section>
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
            <div className="candidate-ranking-list" aria-label="候选排行">
              {visibleCandidates.length === 0 ? (
                <div className="candidate-rank-empty">
                  <span>{investigation && sortedCandidates.length > 0 ? "低置信候选已按设置隐藏" : investigation ? "尚未生成候选坐标" : "开始分析后显示候选排行"}</span>
                  {investigation ? <small>{noCandidateReason}</small> : null}
                </div>
              ) : null}
              {visibleCandidates.length > 0 && filteredCandidates.length === 0 ? (
                <div className="candidate-rank-empty">
                  <span>没有符合“{selectedFilterLabel}”的候选</span>
                </div>
              ) : null}
              {filteredCandidates.map((candidate, index) => {
                const rankIndex = visibleCandidates.findIndex((item) => item.id === candidate.id);
                const displayRank = rankIndex >= 0 ? rankIndex + 1 : index + 1;
                const selected = selectedCandidate?.id === candidate.id;
                return (
                  <button
                    aria-label={candidateRankingLabel(candidate, displayRank)}
                    className={`candidate-rank-card${selected ? " selected" : ""}`}
                    key={candidate.id}
                    type="button"
                    onClick={() => setSelectedCandidateId(candidate.id)}
                  >
                    <span className="candidate-rank-number">{displayRank}</span>
                    <span className="candidate-thumb">
                      {assetPreviewUrl ? <img src={assetPreviewUrl} alt="" /> : <span>{displayRank}</span>}
                    </span>
                    <span className="candidate-rank-main">
                      <strong>{candidateLabel(candidate)}</strong>
                      <small>{candidateCoordinate(candidate)}</small>
                      <span className="candidate-rank-meta">
                        <em>{confidenceLabel(candidate.confidence)}</em>
                        <em>{formatDistanceFromBest(candidate, bestCandidate)}</em>
                        {candidate.manualVerdict?.status && candidate.manualVerdict.status !== "unreviewed" ? (
                          <em>{candidateVerdictLabel(candidate.manualVerdict.status)}</em>
                        ) : null}
                      </span>
                      <span className="score-meter" aria-hidden="true">
                        <span style={{ width: candidateScoreWidth(candidate) }} />
                      </span>
                    </span>
                    <span className="candidate-score">
                      <strong>{candidateScoreLabel(candidate)}</strong>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
          {selectedCandidate ? (
            <FeatureMatchBoard
              ariaLabel="当前候选证据对照"
              candidate={selectedCandidate}
              onAdd={(featureMatch) => onFeatureMatchAdd?.(selectedCandidate.id, featureMatch)}
              onStatusChange={(featureMatchIndex, status) => onFeatureMatchStatusChange?.(selectedCandidate.id, featureMatchIndex, status)}
              variant="rail"
            />
          ) : null}
          {selectedCandidate ? (
            <CandidateVerdictPanel
              candidate={selectedCandidate}
              onChange={(status, rationale) => onCandidateVerdictChange?.(selectedCandidate.id, status, rationale)}
            />
          ) : null}
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
                  <strong>{candidateLabel(selectedCandidate)}</strong>
                  <span>{candidateSecondaryLabel(selectedCandidate)}</span>
                  <p>完整卫星图与候选分布已移入上方“地图核验”标签。</p>
                  <button className="small-button" type="button" onClick={() => openMapEvidenceTab("satellite")}>
                    查看地图核验
                  </button>
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
        </aside>
      </div>
      <details className="advanced-verification-drawer">
        <summary>
          <span>高级核验详情</span>
          <small>分析过程、候选对比、证据链、报告与外部入口</small>
        </summary>
        <div className="advanced-verification-content">
      <section className="verification-detail-hero" aria-label="高级核验摘要">
        <div className="verification-detail-title">
          <span>核验档案</span>
          <h3>证据链总览</h3>
          <p>
            {selectedCandidate
              ? `${candidateLabel(selectedCandidate)} · ${candidateCoordinate(selectedCandidate)}`
              : investigation
                ? "本次未生成可核验候选坐标。"
                : "尚未生成候选坐标。"}
          </p>
        </div>
        <div className="verification-detail-metrics" aria-label="高级核验指标">
          <div>
            <span>候选</span>
            <strong>{visibleCandidates.length}</strong>
          </div>
          <div>
            <span>当前评分</span>
            <strong>{candidateScoreLabel(selectedCandidate)}</strong>
          </div>
          <div>
            <span>来源</span>
            <strong>{selectedCandidate?.sources.length ?? 0}</strong>
          </div>
          <div>
            <span>待核验</span>
            <strong>{topVerificationNotes.filter((item, index) => checklistTone(item, index) !== "good").length}</strong>
          </div>
        </div>
      </section>
      <div className="summary-board verification-dossier-grid">
        <article className="evidence-card analysis-log-card dossier-process-card">
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
        <article className="best-candidate-card dossier-candidate-card" aria-label="当前候选">
          <div className="card-title-row">
            <h3>{selectedCandidate ? (selectedCandidateIndex === 0 ? "地图核验候选（Top 1）" : `当前候选（排名 ${selectedCandidateIndex + 1}）`) : "当前候选"}</h3>
            {selectedCandidate ? (
              <button className="icon-button" type="button" onClick={() => void copyCoordinate(selectedCandidate)} aria-label="复制坐标">
                {copiedCandidateId === selectedCandidate.id ? "已复制" : "复制坐标"}
              </button>
            ) : null}
          </div>
          {selectedCandidate ? (
            <>
              <strong className="candidate-place-name">{candidateLabel(selectedCandidate)}</strong>
              <p className="coordinate hero-coordinate">{candidateSecondaryLabel(selectedCandidate)}</p>
              <dl className="candidate-metrics">
                <div>
                  <dt>置信度</dt>
                  <dd>{candidateScoreLabel(selectedCandidate)}</dd>
                </div>
                <div>
                  <dt>定位方式</dt>
                  <dd>{selectedCandidateIndex === 0 ? "来源线索 + 地图核验" : "视觉候选"}</dd>
                </div>
                <div>
                  <dt>候选 ID</dt>
                  <dd>{selectedCandidate.id}</dd>
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
        <article className="evidence-card map-handoff-card dossier-map-card">
          <div className="card-title-row">
            <h3>地图核验入口</h3>
            <span>{candidateFilterSummary}</span>
          </div>
          {selectedCandidate ? (
            <div className="map-handoff-summary">
              <strong>{candidateLabel(selectedCandidate)}</strong>
              <span>{candidateSecondaryLabel(selectedCandidate)}</span>
              <p>候选分布和当前候选卫星图已集中到证据画布的“地图核验”标签。</p>
              <button className="small-button" type="button" onClick={() => openMapEvidenceTab("satellite")}>
                查看地图核验
              </button>
            </div>
          ) : (
            <p className="muted">候选生成后，可在“地图核验”标签统一查看分布、卫星图和外部地图入口。</p>
          )}
        </article>
      </div>
      <div className="primary-verification-grid compact-verification-grid verification-dossier-actions">
        <article className="map-handoff-panel dossier-action-card">
          <div className="map-preview-header">
            <strong>地图与 Earth 核验入口</strong>
            {selectedCandidate ? <span>{candidateScoreLabel(selectedCandidate)}</span> : null}
          </div>
          {selectedCandidate ? (
            <div className="map-handoff-body">
              <div>
                <span>当前候选</span>
                <strong>{candidateLabel(selectedCandidate)}</strong>
                <small>{candidateSecondaryLabel(selectedCandidate)}</small>
                <p>{selectedCandidate.mapPreview.screenshotStatus}</p>
              </div>
              <div className="map-handoff-actions">
                <button className="small-button" type="button" onClick={() => openMapEvidenceTab("satellite")}>
                  切换到地图核验
                </button>
                <a className="inline-action" href={selectedCandidate.mapLinks.googleMaps} target="_blank" rel="noreferrer">
                  打开 Maps
                </a>
                <a className="inline-action" href={selectedCandidate.mapPreview.googleEarthWebUrl} target="_blank" rel="noreferrer">
                  打开 Earth
                </a>
              </div>
              {selectedCandidate.mapPreview.notes.length > 0 ? (
                <ul className="earth-checklist">
                  {selectedCandidate.mapPreview.notes.slice(0, 3).map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="muted">候选坐标生成后会显示地图核验标签、Google Maps 与 Google Earth 外部入口。</p>
          )}
        </article>
        <aside className="field-checklist dossier-checklist-card">
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
      {investigation ? (
        <details className="evidence-drawer dossier-evidence-drawer">
          <summary>证据链与搜索过程</summary>
          <EvidenceTraceStrip investigation={investigation} />
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
        <div>
          <h3>地图核验入口</h3>
          <p className="muted">
            {filteredCandidates.length === 0
              ? visibleCandidates.length > 0
                ? `没有符合“${selectedFilterLabel}”的候选坐标。`
                : sortedCandidates.length > 0
                  ? "低置信候选已按设置隐藏，无法加载地图核验。"
                  : "尚无候选坐标，无法加载地图核验。"
              : "卫星图、候选分布和当前候选地图入口已集中到上方“地图核验”标签。"}
          </p>
        </div>
        {selectedCandidate ? (
          <div className="map-verification-actions">
            <button className="small-button" type="button" onClick={() => openMapEvidenceTab("satellite")}>
              查看地图核验
            </button>
            <a className="inline-action" href={selectedCandidate.mapLinks.googleMaps} target="_blank" rel="noreferrer">
              打开 Maps
            </a>
            <a className="inline-action" href={selectedCandidate.mapPreview.googleEarthWebUrl} target="_blank" rel="noreferrer">
              打开 Earth
            </a>
          </div>
        ) : null}
      </div>
      <div className="dossier-ledger-heading" aria-label="候选坐标台账摘要">
        <div>
          <span>候选坐标台账</span>
          <strong>{candidateFilterSummary}</strong>
        </div>
        <div className="dossier-ledger-meta">
          <span>{selectedFilterLabel}</span>
          {hiddenLowConfidenceCount > 0 ? <span>隐藏低置信 {hiddenLowConfidenceCount}</span> : null}
        </div>
      </div>
      <div className="candidate-list dossier-candidate-ledger">
        {filteredCandidates.length === 0 ? (
          <p className="muted">
            {visibleCandidates.length > 0
              ? `没有符合“${selectedFilterLabel}”的候选坐标`
              : sortedCandidates.length > 0
                ? "低置信候选已按设置隐藏"
                : "尚未生成候选坐标"}
          </p>
        ) : null}
        {filteredCandidates.map((candidate, index) => {
          const rankIndex = visibleCandidates.findIndex((item) => item.id === candidate.id);
          const displayRank = rankIndex >= 0 ? rankIndex + 1 : index + 1;
          return (
          <article className="candidate dossier-candidate-row" key={candidate.id}>
            <div className="candidate-header">
              <strong>{candidate.name ? `候选 ${displayRank}：${candidate.name}` : `候选 ${displayRank}`}</strong>
              <div className="candidate-badges">
                <span>{confidenceLabel(candidate.confidence)}</span>
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
                <h4>人工结论</h4>
                {renderList([
                  candidateVerdictLabel(candidate.manualVerdict?.status),
                  ...(candidate.manualVerdict?.rationale ? [candidate.manualVerdict.rationale] : [])
                ])}
              </div>
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
            <div className="candidate-map-actions">
              <div className="candidate-map-summary">
                <strong>{candidateLabel(candidate)}</strong>
                <span>{candidateSecondaryLabel(candidate)}</span>
                <p>卫星图和候选分布在证据画布“地图核验”标签统一查看，候选卡只保留外部入口与核验备注。</p>
              </div>
              <div className="candidate-map-links">
                <button className="small-button" type="button" onClick={() => openMapEvidenceTab("satellite")}>
                  查看地图核验
                </button>
                <a className="inline-action" href={candidate.mapLinks.googleMaps} target="_blank" rel="noreferrer">
                  打开 Maps
                </a>
                <a className="inline-action" href={candidate.mapPreview.googleEarthWebUrl} target="_blank" rel="noreferrer">
                  打开 Earth
                </a>
              </div>
              {candidate.mapPreview.notes.length > 0 ? (
                <div className="candidate-map-notes">
                  <strong>Earth 核验备注</strong>
                  {renderList(candidate.mapPreview.notes.slice(0, 4))}
                </div>
              ) : null}
            </div>
            <details>
              <summary>查看完整证据链</summary>
              <FeatureMatchBoard candidate={candidate} />
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
        <details className="report dossier-report-drawer">
          <summary>完整 Markdown 报告</summary>
          <pre>{investigation.report.fullMarkdown}</pre>
        </details>
      ) : null}
        </div>
      </details>
    </section>
  );
}
