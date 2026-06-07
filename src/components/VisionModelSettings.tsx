import type { VisionModelConfig } from "../shared/types";

type Props = {
  availableModels: string[];
  copy?: VisionModelSettingsCopy;
  modelListStatus: string | null;
  modelListLoading: boolean;
  value: VisionModelConfig;
  onChange: (value: VisionModelConfig) => void;
  onFetchModels: () => void;
};

export type VisionModelSettingsCopy = {
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  baseUrlLabel: string;
  baseUrlPlaceholder: string;
  coordinateSystem: string;
  fetchModels: string;
  fetchingModels: string;
  hint: string;
  lowConfidenceMax: string;
  maxCandidates: string;
  modelName: string;
  showLowConfidence: string;
  subtitle: string;
  threshold: string;
  title: string;
};

const defaultCopy: VisionModelSettingsCopy = {
  apiKeyLabel: "视觉模型 API Key",
  apiKeyPlaceholder: "随当前模型配置保存在本机浏览器",
  baseUrlLabel: "视觉模型 Base URL",
  baseUrlPlaceholder: "可留空，或填写自己的兼容接口",
  coordinateSystem: "坐标系",
  fetchModels: "获取模型列表",
  fetchingModels: "获取中...",
  hint: "系统会用视觉模型自动识别 OCR、地物语义、军事/交通设施和空间关系。",
  lowConfidenceMax: "低置信最多展示",
  maxCandidates: "最大候选数",
  modelName: "视觉模型名称",
  showLowConfidence: "展示低置信候选",
  subtitle: "自动识别 OCR、地物、设施和空间关系。",
  threshold: "匹配阈值",
  title: "视觉模型"
};

export function VisionModelSettings({ availableModels, copy = defaultCopy, modelListStatus, modelListLoading, value, onChange, onFetchModels }: Props) {
  function set(key: keyof VisionModelConfig, next: string) {
    onChange({ ...value, [key]: next });
  }

  function setNumber(key: "matchingThreshold" | "maxCandidates" | "maxLowConfidenceCandidates", next: string) {
    const parsed = Number(next);
    if (Number.isFinite(parsed)) {
      onChange({ ...value, [key]: parsed });
    }
  }

  const threshold = value.matchingThreshold ?? 0.6;
  const maxCandidates = value.maxCandidates ?? 10;
  const showLowConfidenceCandidates = value.showLowConfidenceCandidates ?? true;
  const maxLowConfidenceCandidates = value.maxLowConfidenceCandidates ?? 10;

  return (
    <section className="model-settings-section">
      <div className="subsection-heading">
        <h3>{copy.title}</h3>
        <p>{copy.subtitle}</p>
      </div>
      <div className="model-settings-grid">
        <label className="field model-settings-wide">
          {copy.apiKeyLabel}
          <input
            autoComplete="off"
            type="password"
            value={value.apiKey ?? ""}
            onChange={(event) => set("apiKey", event.target.value)}
            placeholder={copy.apiKeyPlaceholder}
          />
        </label>
        <label className="field">
          {copy.baseUrlLabel}
          <input
            value={value.baseUrl ?? ""}
            onChange={(event) => set("baseUrl", event.target.value)}
            placeholder={copy.baseUrlPlaceholder}
          />
        </label>
        <label className="field">
          {copy.modelName}
          {availableModels.length > 0 ? (
            <select value={value.model ?? availableModels[0]} onChange={(event) => set("model", event.target.value)}>
              {availableModels.map((model) => (
                <option value={model} key={model}>
                  {model}
                </option>
              ))}
            </select>
          ) : (
            <input value={value.model ?? "gpt-4o"} onChange={(event) => set("model", event.target.value)} />
          )}
        </label>
      </div>
      <div className="model-fetch-row">
        <button className="small-button" type="button" onClick={onFetchModels} disabled={modelListLoading}>
          {modelListLoading ? copy.fetchingModels : copy.fetchModels}
        </button>
        {modelListStatus ? <span>{modelListStatus}</span> : null}
      </div>
      <div className="model-settings-grid">
        <label className="field threshold-field model-settings-wide">
          <span>{copy.threshold}</span>
          <input type="range" min="0" max="1" step="0.01" value={threshold} onChange={(event) => setNumber("matchingThreshold", event.target.value)} />
          <span className="threshold-output">{threshold.toFixed(2)}</span>
          <span className="range-ticks" aria-hidden="true">
            <span>0.00</span>
            <span>0.25</span>
            <span>0.50</span>
            <span>0.75</span>
            <span>1.00</span>
          </span>
        </label>
        <label className="field">
          {copy.maxCandidates}
          <select value={maxCandidates} onChange={(event) => setNumber("maxCandidates", event.target.value)}>
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="20">20</option>
          </select>
        </label>
        <label className="toggle-row low-confidence-toggle">
          <span>{copy.showLowConfidence}</span>
          <input
            checked={showLowConfidenceCandidates}
            onChange={(event) => onChange({ ...value, showLowConfidenceCandidates: event.target.checked })}
            type="checkbox"
          />
          <span className={showLowConfidenceCandidates ? "toggle-switch enabled" : "toggle-switch"} aria-hidden="true" />
        </label>
        <label className="field">
          {copy.lowConfidenceMax}
          <select
            disabled={!showLowConfidenceCandidates}
            value={maxLowConfidenceCandidates}
            onChange={(event) => setNumber("maxLowConfidenceCandidates", event.target.value)}
          >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="20">20</option>
          </select>
        </label>
        <label className="field">
          {copy.coordinateSystem}
          <select
            value={value.coordinateSystem ?? "WGS84 (EPSG:4326)"}
            onChange={(event) => onChange({ ...value, coordinateSystem: event.target.value as VisionModelConfig["coordinateSystem"] })}
          >
            <option>WGS84 (EPSG:4326)</option>
            <option>GCJ-02</option>
            <option>BD-09</option>
          </select>
        </label>
      </div>
      <p className="hint">{copy.hint}</p>
    </section>
  );
}
