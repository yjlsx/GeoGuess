import type { Investigation } from "../shared/types";
import { formatCoordinate } from "../shared/mapLinks";

type Props = {
  investigation: Investigation | null;
  loading: boolean;
  error: string | null;
};

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

export function CandidateResults({ investigation, loading, error }: Props) {
  if (loading) {
    return (
      <section className="panel result-panel" aria-live="polite" role="status">
        正在分析...
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel result-panel error" aria-live="polite" role="alert">
        {error}
      </section>
    );
  }

  if (!investigation) {
    return (
      <section className="panel result-panel" aria-live="polite">
        结果会显示候选坐标、证据链和 Google Earth 核验清单。
      </section>
    );
  }

  return (
    <section className="panel result-panel" aria-live="polite">
      <h2>候选结果</h2>
      <div className="evidence-overview">
        <article className="evidence-card">
          <h3>自动识别线索</h3>
          {renderList(investigation.imageAnalysis.observations)}
          <h4>能力边界</h4>
          {renderList(investigation.imageAnalysis.limitations)}
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
      <div className="candidate-list">
        {investigation.candidates.map((candidate, index) => (
          <article className="candidate" key={candidate.id}>
            <div className="candidate-header">
              <strong>{candidate.name ? `候选 ${index + 1}：${candidate.name}` : `候选 ${index + 1}`}</strong>
              <span>{confidenceLabel(candidate.confidence)}</span>
            </div>
            <p className="coordinate">{formatCoordinate(candidate.latitude, candidate.longitude)}</p>
            <div className="map-preview-grid">
              <div className="map-preview">
                <div className="map-preview-header">
                  <strong>Google Maps 地图预览</strong>
                  <a href={candidate.mapLinks.googleMaps} target="_blank" rel="noreferrer">
                    打开 Maps
                  </a>
                </div>
                <iframe
                  title={`候选 ${index + 1} Google Maps 预览`}
                  src={candidate.mapPreview.googleMapsEmbedUrl}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="earth-preview">
                <strong>Google Earth 历史影像核验</strong>
                <p>{candidate.mapPreview.screenshotStatus}</p>
                <a href={candidate.mapPreview.googleEarthWebUrl} target="_blank" rel="noreferrer">
                  打开 Google Earth
                </a>
                {renderList(candidate.mapPreview.notes)}
              </div>
            </div>
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
      <details className="report">
        <summary>完整 Markdown 报告</summary>
        <pre>{investigation.report.fullMarkdown}</pre>
      </details>
    </section>
  );
}
