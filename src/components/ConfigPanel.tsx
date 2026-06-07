import type { VisionConfigProfile, VisionModelConfig } from "../shared/types";
import { VisionModelSettings, type VisionModelSettingsCopy } from "./VisionModelSettings";

export type ConfigPanelCopy = {
  addProfile: string;
  configName: string;
  deleteProfile: string;
  description: string;
  heading: string;
  modelConfig: string;
  saveButton: string;
  unnamedConfig: string;
  visionModelSettings: VisionModelSettingsCopy;
};

type Props = {
  activeVisionProfileId: string;
  availableModels: string[];
  copy?: ConfigPanelCopy;
  modelListStatus: string | null;
  modelListLoading: boolean;
  saveStatus: string | null;
  visionConfig: VisionModelConfig;
  visionProfiles: VisionConfigProfile[];
  onAddVisionProfile: () => void;
  onDeleteVisionProfile: () => void;
  onFetchModels: () => void;
  onSave: () => void;
  onVisionConfigChange: (value: VisionModelConfig) => void;
  onVisionProfileChange: (profileId: string) => void;
  onVisionProfileNameChange: (name: string) => void;
};

const defaultCopy: ConfigPanelCopy = {
  addProfile: "新增配置",
  configName: "配置名称",
  deleteProfile: "删除配置",
  description: "模型、Base URL 和 API Key 可按配置档案保存在本机浏览器。",
  heading: "配置",
  modelConfig: "模型配置",
  saveButton: "保存配置",
  unnamedConfig: "未命名配置",
  visionModelSettings: {
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
  }
};

export function ConfigPanel({
  activeVisionProfileId,
  availableModels,
  copy = defaultCopy,
  modelListLoading,
  modelListStatus,
  saveStatus,
  visionConfig,
  visionProfiles,
  onAddVisionProfile,
  onDeleteVisionProfile,
  onFetchModels,
  onSave,
  onVisionConfigChange,
  onVisionProfileChange,
  onVisionProfileNameChange
}: Props) {
  const activeProfile = visionProfiles.find((profile) => profile.id === activeVisionProfileId) ?? visionProfiles[0];

  return (
    <section className="panel config-panel settings-config-panel">
      <div className="config-heading">
        <div>
          <h2>{copy.heading}</h2>
          <p>{copy.description}</p>
        </div>
        <button className="small-button" type="button" onClick={onSave}>
          {copy.saveButton}
        </button>
      </div>
      <div className="model-profile-grid">
        <label className="field">
          {copy.modelConfig}
          <select value={activeVisionProfileId} onChange={(event) => onVisionProfileChange(event.target.value)}>
            {visionProfiles.map((profile) => (
              <option value={profile.id} key={profile.id}>
                {profile.name || copy.unnamedConfig}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {copy.configName}
          <input value={activeProfile?.name ?? ""} onChange={(event) => onVisionProfileNameChange(event.target.value)} />
        </label>
        <div className="model-profile-actions">
          <button className="small-button" type="button" onClick={onAddVisionProfile}>
            {copy.addProfile}
          </button>
          <button className="small-button danger-button" type="button" onClick={onDeleteVisionProfile} disabled={visionProfiles.length <= 1}>
            {copy.deleteProfile}
          </button>
        </div>
      </div>
      <VisionModelSettings
        availableModels={availableModels}
        copy={copy.visionModelSettings}
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
