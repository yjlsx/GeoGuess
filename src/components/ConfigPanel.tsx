import type { OutputLanguage, VisionModelConfig } from "../shared/types";

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

export function ConfigPanel({ outputLanguage, saveStatus, onOutputLanguageChange, onSave }: Props) {
  return (
    <section className="panel config-panel compact-config-panel">
      <div className="config-heading">
        <div>
          <h2>配置</h2>
          <p>模型配置已放在左侧控制栏；这里用于保存非敏感偏好。API Key 仅保留在当前页面会话。</p>
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
      {saveStatus ? <p className="save-status">{saveStatus}</p> : null}
    </section>
  );
}
