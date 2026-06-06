import type { OutputLanguage, VisionModelConfig } from "../shared/types";
import { VisionModelSettings } from "./VisionModelSettings";

type Props = {
  availableModels: string[];
  modelListStatus: string | null;
  modelListLoading: boolean;
  outputLanguage: OutputLanguage;
  saveStatus: string | null;
  visionConfig: VisionModelConfig;
  onFetchModels: () => void;
  onOutputLanguageChange: (language: OutputLanguage) => void;
  onSave: () => void;
  onVisionConfigChange: (value: VisionModelConfig) => void;
};

export function ConfigPanel({
  availableModels,
  modelListLoading,
  modelListStatus,
  outputLanguage,
  saveStatus,
  visionConfig,
  onFetchModels,
  onOutputLanguageChange,
  onSave,
  onVisionConfigChange
}: Props) {
  return (
    <section className="panel config-panel settings-config-panel">
      <div className="config-heading">
        <div>
          <h2>配置</h2>
          <p>模型与偏好统一放在这里；API Key 仅保留在当前页面会话。</p>
        </div>
        <button className="small-button" type="button" onClick={onSave}>
          保存配置
        </button>
      </div>
      <label className="field">
        输出语言
        <select value={outputLanguage} onChange={(event) => onOutputLanguageChange(event.target.value as OutputLanguage)}>
          <option value="zh-CN">中文</option>
          <option value="en-US">English</option>
        </select>
      </label>
      <VisionModelSettings
        availableModels={availableModels}
        modelListLoading={modelListLoading}
        modelListStatus={modelListStatus}
        value={visionConfig}
        onChange={onVisionConfigChange}
        onFetchModels={onFetchModels}
      />
      {saveStatus ? <p className="save-status">{saveStatus}</p> : null}
    </section>
  );
}
