import type { VisionModelConfig } from "../shared/types";

type Props = {
  availableModels: string[];
  modelListStatus: string | null;
  modelListLoading: boolean;
  value: VisionModelConfig;
  onChange: (value: VisionModelConfig) => void;
  onFetchModels: () => void;
};

export function VisionModelSettings({ availableModels, modelListStatus, modelListLoading, value, onChange, onFetchModels }: Props) {
  function set(key: keyof VisionModelConfig, next: string) {
    onChange({ ...value, [key]: next });
  }

  function setNumber(key: "matchingThreshold" | "maxCandidates", next: string) {
    const parsed = Number(next);
    if (Number.isFinite(parsed)) {
      onChange({ ...value, [key]: parsed });
    }
  }

  const threshold = value.matchingThreshold ?? 0.6;
  const maxCandidates = value.maxCandidates ?? 10;

  return (
    <section className="model-settings-section">
      <div className="subsection-heading">
        <h3>视觉模型</h3>
        <p>自动识别 OCR、地物、设施和空间关系。</p>
      </div>
      <div className="model-settings-grid">
        <label className="field model-settings-wide">
          视觉模型 API Key
          <input
            autoComplete="off"
            type="password"
            value={value.apiKey ?? ""}
            onChange={(event) => set("apiKey", event.target.value)}
            placeholder="本次分析使用，不会持久保存"
          />
        </label>
        <label className="field">
          视觉模型 Base URL
          <input
            value={value.baseUrl ?? ""}
            onChange={(event) => set("baseUrl", event.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </label>
        <label className="field">
          视觉模型名称
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
          {modelListLoading ? "获取中..." : "获取模型列表"}
        </button>
        {modelListStatus ? <span>{modelListStatus}</span> : null}
      </div>
      <div className="model-settings-grid">
        <label className="field threshold-field model-settings-wide">
          <span>匹配阈值</span>
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
          最大候选数
          <select value={maxCandidates} onChange={(event) => setNumber("maxCandidates", event.target.value)}>
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="20">20</option>
          </select>
        </label>
        <label className="field">
          坐标系
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
      <div className="toggle-row">
        <span>启用地形校验（实验性）</span>
        <button
          aria-label="切换地形校验"
          aria-pressed={value.terrainValidation ?? true}
          className={(value.terrainValidation ?? true) ? "toggle-switch enabled" : "toggle-switch"}
          type="button"
          onClick={() => onChange({ ...value, terrainValidation: !(value.terrainValidation ?? true) })}
        />
      </div>
      <p className="hint">系统会用视觉模型自动识别 OCR、地物语义、军事/交通设施和空间关系。</p>
    </section>
  );
}
