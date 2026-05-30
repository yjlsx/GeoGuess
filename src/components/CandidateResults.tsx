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
      <div className="clues">
        <h3>线索摘要</h3>
        <p>{investigation.extractedClues.sceneFeatures.join(" / ") || "没有地物线索"}</p>
      </div>
      <div className="candidate-list">
        {investigation.candidates.map((candidate, index) => (
          <article className="candidate" key={candidate.id}>
            <div className="candidate-header">
              <strong>候选 {index + 1}</strong>
              <span>{confidenceLabel(candidate.confidence)}</span>
            </div>
            <p>{formatCoordinate(candidate.latitude, candidate.longitude)}</p>
            <a href={candidate.mapLinks.googleMaps} target="_blank" rel="noreferrer">
              打开 Google Maps
            </a>
            <details>
              <summary>查看证据链和核验清单</summary>
              <h4>为什么像</h4>
              <ul>{candidate.matchingEvidence.map((item) => <li key={item}>{item}</li>)}</ul>
              <h4>不确定点</h4>
              <ul>{candidate.uncertainty.map((item) => <li key={item}>{item}</li>)}</ul>
              <h4>Google Earth 核验</h4>
              <p>{candidate.mapLinks.googleEarthHint}</p>
              <ul>{candidate.earthVerificationChecklist.map((item) => <li key={item}>{item}</li>)}</ul>
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
