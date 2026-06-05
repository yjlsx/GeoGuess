import { useEffect, useState } from "react";
import { CandidateResults } from "./components/CandidateResults";
import { ConfigPanel } from "./components/ConfigPanel";
import { ImageInput } from "./components/ImageInput";
import { ScopeForm } from "./components/ScopeForm";
import { VisionModelSettings } from "./components/VisionModelSettings";
import { buildReports } from "./shared/reportGenerator";
import {
  copyReportToClipboard,
  exportReportAsHtml,
  exportReportAsMarkdown,
  printReport
} from "./shared/reportExport";
import { sampleInvestigationInput } from "./shared/sampleInvestigation";
import type { CropMode, Investigation, OutputLanguage, UserScope, VisionModelConfig } from "./shared/types";

const settingsStorageKey = "imageGeoFinder.settings";
const historyStorageKey = "imageGeoFinder.history";
const latestInvestigationStorageKey = "imageGeoFinder.latestInvestigation";
const defaultScope: UserScope = {
  regionScope: "custom",
  boundaryMode: "rectangle",
  coordinateBox: { minLat: 28, minLon: 112, maxLat: 34, maxLon: 118 }
};

type SavedSettings = {
  outputLanguage?: OutputLanguage;
  visionConfig?: VisionModelConfig;
};

type HistoryItem = {
  id: string;
  assetName: string;
  candidateCount: number;
  createdAt: string;
};

type SavedInvestigationState = {
  investigation: Investigation;
  analysisStartedAt: number | null;
  analysisFinishedAt: number | null;
};

type WorkbenchStatusProps = {
  assetName: string | null;
  fileCount: number;
  hasVisionKey: boolean;
  hasInvestigation: boolean;
  loading: boolean;
  candidateCount: number;
  modelName: string;
  error: string | null;
  progress: number;
  analysisStartedAt: number | null;
  analysisFinishedAt: number | null;
  now: number;
};

function formatStatusDate(timestamp: number | null) {
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

function formatElapsed(startedAt: number | null, finishedAt: number | null, now: number) {
  if (!startedAt) {
    return "--";
  }
  const elapsedSeconds = Math.max(0, Math.floor(((finishedAt ?? now) - startedAt) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function estimateAnalysisProgress(startedAt: number, now: number) {
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (elapsedSeconds < 5) {
    return Math.min(22, 8 + elapsedSeconds * 3);
  }
  if (elapsedSeconds < 20) {
    return Math.min(43, 22 + Math.floor((elapsedSeconds - 5) * 1.4));
  }
  if (elapsedSeconds < 60) {
    return Math.min(71, 43 + Math.floor((elapsedSeconds - 20) * 0.7));
  }
  if (elapsedSeconds < 180) {
    return Math.min(86, 71 + Math.floor((elapsedSeconds - 60) * 0.13));
  }
  return 86;
}

function WorkbenchStatus({
  assetName,
  fileCount,
  hasVisionKey,
  hasInvestigation,
  loading,
  candidateCount,
  modelName,
  error,
  progress,
  analysisStartedAt,
  analysisFinishedAt,
  now
}: WorkbenchStatusProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const analysisStatus = error
    ? `分析失败：${error}`
    : loading
      ? clampedProgress >= 86
        ? `等待模型返回... ${clampedProgress}%`
        : `分析中... ${clampedProgress}%`
      : hasInvestigation
        ? "分析完成 100%"
        : fileCount > 0
          ? "待开始"
          : "待命";

  return (
    <section className="workbench-status-bar" aria-label="定位核验工作台状态">
      <div className="status-pill asset-status">
        <span>资产</span>
        <strong>{assetName ?? "未上传"}</strong>
      </div>
      <div className={hasVisionKey ? "status-pill ready" : "status-pill"}>
        <span>模型状态</span>
        <strong>{hasVisionKey ? `${modelName || "未选择模型"} 已就绪` : "未配置"}</strong>
      </div>
      <div
        className={loading ? "status-pill in-progress" : hasInvestigation ? "status-pill ready" : error ? "status-pill error-pill" : "status-pill"}
        title={error ?? undefined}
      >
        <span>分析状态</span>
        <strong>{analysisStatus}</strong>
        {loading || hasInvestigation ? (
          <div className="status-progress" aria-hidden="true">
            <span style={{ width: `${hasInvestigation ? 100 : clampedProgress}%` }} />
          </div>
        ) : null}
      </div>
      <div className={candidateCount > 0 ? "status-pill ready" : "status-pill"}>
        <span>候选结果</span>
        <strong>{candidateCount > 0 ? `${candidateCount} 个候选位置` : "0"}</strong>
      </div>
      <div className={analysisStartedAt ? "status-pill ready" : "status-pill"}>
        <span>开始时间</span>
        <strong>{formatStatusDate(analysisStartedAt)}</strong>
      </div>
      <div className={analysisStartedAt ? "status-pill ready" : "status-pill"}>
        <span>耗时</span>
        <strong>{formatElapsed(analysisStartedAt, analysisFinishedAt, now)}</strong>
      </div>
    </section>
  );
}

function ModelSidebarPanel({
  availableModels,
  hasVisionKey,
  modelListLoading,
  modelListStatus,
  onFetchModels,
  onVisionConfigChange,
  value
}: {
  availableModels: string[];
  hasVisionKey: boolean;
  modelListLoading: boolean;
  modelListStatus: string | null;
  onFetchModels: () => void;
  onVisionConfigChange: (value: VisionModelConfig) => void;
  value: VisionModelConfig;
}) {
  return (
    <section className="panel model-sidebar-panel">
      <div className="section-heading compact-heading">
        <span className="step-number">2</span>
        <div>
          <h2>模型配置</h2>
        </div>
      </div>
      <VisionModelSettings
        availableModels={availableModels}
        modelListLoading={modelListLoading}
        modelListStatus={modelListStatus}
        value={value}
        onChange={onVisionConfigChange}
        onFetchModels={onFetchModels}
      />
      <p className={hasVisionKey ? "model-ready-note ready" : "model-ready-note"}>{hasVisionKey ? "模型已就绪，可开始分析。" : "请填写 API Key 后开始分析。"}</p>
    </section>
  );
}

function loadSavedSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(settingsStorageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as SavedSettings;
    const savedVisionConfig = parsed.visionConfig && typeof parsed.visionConfig === "object" ? parsed.visionConfig : undefined;
    return {
      outputLanguage: parsed.outputLanguage === "en-US" || parsed.outputLanguage === "zh-CN" ? parsed.outputLanguage : undefined,
      visionConfig: savedVisionConfig ? { ...savedVisionConfig, apiKey: undefined } : undefined
    };
  } catch {
    return {};
  }
}

function loadHistory(): HistoryItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(historyStorageKey) ?? "[]") as HistoryItem[];
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function loadLatestInvestigation(): SavedInvestigationState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(latestInvestigationStorageKey) ?? "null") as SavedInvestigationState | null;
    if (!parsed?.investigation || typeof parsed.investigation.id !== "string" || !Array.isArray(parsed.investigation.candidates)) {
      return null;
    }

    return {
      investigation: parsed.investigation,
      analysisStartedAt: typeof parsed.analysisStartedAt === "number" ? parsed.analysisStartedAt : null,
      analysisFinishedAt: typeof parsed.analysisFinishedAt === "number" ? parsed.analysisFinishedAt : null
    };
  } catch {
    return null;
  }
}

function buildSampleInvestigation(outputLanguage: OutputLanguage): Investigation {
  const reportInput = {
    ...sampleInvestigationInput,
    outputLanguage
  };

  return {
    id: "sample-investigation",
    outputLanguage,
    image: {
      originalPath: "local://IMG_20240516_174532.jpg",
      cropMode: "full"
    },
    userScope: sampleInvestigationInput.userScope,
    extractedClues: sampleInvestigationInput.extractedClues,
    mapFeatureProfile: sampleInvestigationInput.mapFeatureProfile ?? {
      primaryFeatures: [],
      spatialRelationships: [],
      viewpointConstraints: [],
      auxiliaryTextClues: [],
      excludedSourceOnlyClues: [],
      searchInstruction: ""
    },
    metadataEvidence: sampleInvestigationInput.metadataEvidence ?? [],
    searchQueries: sampleInvestigationInput.searchQueries,
    searchProcess: sampleInvestigationInput.searchProcess ?? [],
    imageAnalysis: sampleInvestigationInput.imageAnalysis ?? {
      recognitionMode: "local-metadata",
      observations: [],
      limitations: []
    },
    seasonalAnalysis: sampleInvestigationInput.seasonalAnalysis ?? {
      captureDateHint: "",
      inferredSeason: "未提供",
      confidence: "low",
      reasoning: [],
      mapComparisonNotes: []
    },
    candidates: sampleInvestigationInput.candidates,
    report: buildReports(reportInput)
  };
}

function buildRequestScope(scope: UserScope): UserScope {
  const regionScope = scope.regionScope ?? "custom";
  const baseScope: UserScope = {
    regionScope,
    notes: scope.notes
  };

  if (regionScope === "custom") {
    const boundaryMode = scope.boundaryMode ?? "rectangle";
    return {
      ...baseScope,
      boundaryMode,
      coordinateBox: boundaryMode === "rectangle" ? scope.coordinateBox : undefined,
      polygonCoordinates: boundaryMode === "polygon" ? scope.polygonCoordinates : undefined
    };
  }

  if (regionScope === "country") {
    return {
      ...baseScope,
      country: scope.country,
      region: scope.region,
      facilityType: scope.facilityType,
      source: scope.source,
      dateOrTimeHint: scope.dateOrTimeHint
    };
  }

  return baseScope;
}

async function getResponseErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
      ) {
        return (body as { error: string }).error;
      }
    } catch {
      // Fall through to text/status fallback when the server sends invalid JSON.
    }
  }

  try {
    const text = await response.text();
    if (text) {
      try {
        const body: unknown = JSON.parse(text);
        if (
          body &&
          typeof body === "object" &&
          "error" in body &&
          typeof (body as { error: unknown }).error === "string"
        ) {
          return (body as { error: string }).error;
        }
      } catch {
        return text;
      }
      return text;
    }
  } catch {
    // Fall through to status fallback.
  }

  return response.status ? `请求失败（HTTP ${response.status}）` : "请求失败";
}

export default function App() {
  const savedSettings = loadSavedSettings();
  const savedInvestigation = loadLatestInvestigation();
  const [files, setFiles] = useState<File[]>([]);
  const cropMode: CropMode = "full";
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>(savedSettings.outputLanguage ?? "zh-CN");
  const [visionConfig, setVisionConfig] = useState<VisionModelConfig>(
    savedSettings.visionConfig ?? {
      model: "gpt-4o",
      matchingThreshold: 0.6,
      maxCandidates: 10,
      coordinateSystem: "WGS84 (EPSG:4326)",
      terrainValidation: true
    }
  );
  const [scope, setScope] = useState<UserScope>(defaultScope);
  const [investigation, setInvestigation] = useState<Investigation | null>(savedInvestigation?.investigation ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelListStatus, setModelListStatus] = useState<string | null>(null);
  const [modelListLoading, setModelListLoading] = useState(false);
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(savedInvestigation?.analysisStartedAt ?? null);
  const [analysisFinishedAt, setAnalysisFinishedAt] = useState<number | null>(savedInvestigation?.analysisFinishedAt ?? null);
  const [analysisProgress, setAnalysisProgress] = useState(savedInvestigation?.investigation ? 100 : 0);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<"project" | "history" | "user" | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const hasVisionKey = Boolean(visionConfig.apiKey?.trim());
  const candidateCount = investigation?.candidates.length ?? 0;
  const assetName = files[0]?.name ?? (investigation ? investigation.image.originalPath.split(/[\\/]/).pop() ?? null : null);
  const selectedModelName = visionConfig.model?.trim() || "gpt-4o";

  useEffect(() => {
    if (!loading || !analysisStartedAt) {
      return;
    }
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [analysisStartedAt, loading]);

  useEffect(() => {
    if (!loading) {
      return;
    }
    const timer = window.setInterval(() => {
      setAnalysisProgress((current) => (analysisStartedAt ? Math.max(current, estimateAnalysisProgress(analysisStartedAt, Date.now())) : current));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [analysisStartedAt, loading]);

  function handleFileChange(nextFiles: File[]) {
    setFiles(nextFiles);
    setInvestigation(null);
    setError(null);
    setExportStatus(null);
    setAnalysisStartedAt(null);
    setAnalysisFinishedAt(null);
    setAnalysisProgress(0);
    localStorage.removeItem(latestInvestigationStorageKey);
  }

  function updateNotes(notes: string) {
    setScope((current) => ({ ...current, notes: notes || undefined }));
  }

  function rememberInvestigation(nextInvestigation: Investigation) {
    const item = {
      id: nextInvestigation.id,
      assetName: nextInvestigation.image.originalPath.split(/[\\/]/).pop() ?? "未命名素材",
      candidateCount: nextInvestigation.candidates.length,
      createdAt: new Date().toISOString()
    };
    setHistory((current) => {
      const nextHistory = [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 6);
      localStorage.setItem(historyStorageKey, JSON.stringify(nextHistory));
      return nextHistory;
    });
  }

  function rememberLatestInvestigation(nextInvestigation: Investigation, startedAt: number | null, finishedAt: number | null) {
    localStorage.setItem(
      latestInvestigationStorageKey,
      JSON.stringify({
        investigation: nextInvestigation,
        analysisStartedAt: startedAt,
        analysisFinishedAt: finishedAt
      } satisfies SavedInvestigationState)
    );
  }

  function settingsForStorage() {
    const { apiKey: _apiKey, ...safeVisionConfig } = visionConfig;
    return {
      outputLanguage,
      visionConfig: safeVisionConfig
    } satisfies SavedSettings;
  }

  async function analyze() {
    setError(null);
    setExportStatus(null);
    setAnalysisStartedAt(null);
    setAnalysisFinishedAt(null);
    setAnalysisProgress(0);
    let startedAt: number | null = null;
    try {
      if (files.length === 0) {
        throw new Error("请先上传图片或视频。");
      }
      if (!visionConfig.apiKey?.trim()) {
        throw new Error("请先填写视觉模型 API Key，系统需要视觉模型自动识别图片线索。");
      }
      startedAt = Date.now();
      setClockNow(startedAt);
      setAnalysisStartedAt(startedAt);
      setAnalysisProgress(8);
      setLoading(true);
      const formData = new FormData();
      const requestScope = buildRequestScope(scope);
      for (const file of files) {
        formData.append("assets", file);
      }
      formData.append("cropMode", cropMode);
      formData.append("outputLanguage", outputLanguage);
      for (const [key, value] of Object.entries(requestScope)) {
        if (typeof value === "string" && value) {
          formData.append(key, value);
        }
      }
      if (requestScope.coordinateBox) {
        formData.append("coordinateBox", JSON.stringify(requestScope.coordinateBox));
      }
      if (visionConfig.apiKey?.trim()) {
        formData.append(
          "visionConfig",
          JSON.stringify({
            apiKey: visionConfig.apiKey.trim(),
            baseUrl: visionConfig.baseUrl?.trim() || undefined,
            model: visionConfig.model?.trim() || "gpt-4o",
            matchingThreshold: visionConfig.matchingThreshold ?? 0.6,
            maxCandidates: visionConfig.maxCandidates ?? 10,
            coordinateSystem: visionConfig.coordinateSystem ?? "WGS84 (EPSG:4326)",
            terrainValidation: visionConfig.terrainValidation ?? true
          })
        );
      }
      const response = await fetch("/api/investigations", { method: "POST", body: formData });
      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response));
      }
      const nextInvestigation = (await response.json()) as Investigation;
      const finishedAt = Date.now();
      setInvestigation(nextInvestigation);
      rememberInvestigation(nextInvestigation);
      setAnalysisProgress(100);
      setAnalysisFinishedAt(finishedAt);
      rememberLatestInvestigation(nextInvestigation, startedAt, finishedAt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "分析失败");
      if (startedAt) {
        setAnalysisFinishedAt(Date.now());
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchModels() {
    setModelListLoading(true);
    setModelListStatus(null);
    try {
      if (!visionConfig.apiKey?.trim()) {
        throw new Error("请先填写 API Key。");
      }
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: visionConfig.apiKey.trim(),
          baseUrl: visionConfig.baseUrl?.trim() || undefined
        })
      });
      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response));
      }
      const body = (await response.json()) as { models?: string[] };
      const models = Array.isArray(body.models) ? body.models.filter((model) => typeof model === "string" && model) : [];
      setAvailableModels(models);
      if (models.length > 0) {
        setVisionConfig((current) => ({ ...current, model: models.includes(current.model ?? "") ? current.model : models[0] }));
        setModelListStatus(`已获取 ${models.length} 个模型`);
      } else {
        setModelListStatus("接口未返回可用模型，可手动填写模型名。");
      }
    } catch (caught) {
      setModelListStatus(caught instanceof Error ? caught.message : "模型列表获取失败");
    } finally {
      setModelListLoading(false);
    }
  }

  function showSampleInvestigation() {
    setError(null);
    setExportStatus(null);
    const nextInvestigation = buildSampleInvestigation(outputLanguage);
    setInvestigation(nextInvestigation);
    const now = Date.now();
    setAnalysisStartedAt(now);
    setAnalysisFinishedAt(now);
    setAnalysisProgress(100);
    rememberInvestigation(nextInvestigation);
    rememberLatestInvestigation(nextInvestigation, now, now);
  }

  function saveSettings() {
    localStorage.setItem(settingsStorageKey, JSON.stringify(settingsForStorage()));
    setSaveStatus("配置已保存到本机浏览器；API Key 仅用于本次会话，不会持久保存。");
  }

  function handleDownloadMarkdown() {
    if (!investigation) {
      return;
    }
    exportReportAsMarkdown(investigation);
    setExportStatus("已导出 Markdown 报告。");
  }

  function handleDownloadHtml() {
    if (!investigation) {
      return;
    }
    exportReportAsHtml(investigation);
    setExportStatus("已导出 HTML 报告。");
  }

  function handlePrintReport() {
    if (!investigation) {
      return;
    }
    const opened = printReport(investigation);
    setExportStatus(
      opened
        ? "已打开打印窗口，可在打印对话框中选择“另存为 PDF”。"
        : "无法打开打印窗口，请检查浏览器是否拦截了弹窗。"
    );
  }

  async function handleCopyReport() {
    if (!investigation) {
      return;
    }
    const ok = await copyReportToClipboard(investigation);
    setExportStatus(ok ? "报告内容已复制到剪贴板。" : "复制失败，请手动选择文本复制。");
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true" />
          <h1>GeoGuess</h1>
        </div>
        <nav className="header-nav" aria-label="工作台导航">
          <div className="settings-menu">
            <button className="header-nav-item project-nav" type="button" onClick={() => setActiveMenu(activeMenu === "project" ? null : "project")}>
              项目
            </button>
            {activeMenu === "project" ? (
              <div className="nav-popover">
                <strong>当前项目</strong>
                <span>素材：{assetName ?? "未上传"}</span>
                <span>候选：{candidateCount} 个</span>
                <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                  回到顶部
                </button>
              </div>
            ) : null}
          </div>
          <div className="settings-menu">
            <button className="header-nav-item history-nav" type="button" onClick={() => setActiveMenu(activeMenu === "history" ? null : "history")}>
              历史记录
            </button>
            {activeMenu === "history" ? (
              <div className="nav-popover history-popover">
                <strong>最近分析</strong>
                {history.length === 0 ? <span>暂无历史记录</span> : null}
                {history.map((entry) => (
                  <button key={entry.id} type="button" onClick={() => setActiveMenu(null)}>
                    {entry.assetName} · {entry.candidateCount} 个候选
                  </button>
                ))}
                {history.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem(historyStorageKey);
                      setHistory([]);
                    }}
                  >
                    清空历史
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="settings-menu">
            <button
              aria-expanded={settingsOpen}
              className="header-nav-item settings-nav"
              type="button"
              onClick={() => {
                setSettingsOpen((current) => !current);
                setActiveMenu(null);
              }}
            >
              设置
            </button>
            {settingsOpen ? (
              <div className="settings-popover">
                <ConfigPanel
                  availableModels={availableModels}
                  modelListLoading={modelListLoading}
                  modelListStatus={modelListStatus}
                  outputLanguage={outputLanguage}
                  saveStatus={saveStatus}
                  visionConfig={visionConfig}
                  onFetchModels={fetchModels}
                  onOutputLanguageChange={setOutputLanguage}
                  onSave={saveSettings}
                  onVisionConfigChange={setVisionConfig}
                />
              </div>
            ) : null}
          </div>
          <div className="settings-menu">
            <button className="user-chip" type="button" onClick={() => setActiveMenu(activeMenu === "user" ? null : "user")}>
              OC
            </button>
            {activeMenu === "user" ? (
              <div className="nav-popover user-popover">
                <strong>本地会话</strong>
                <span>配置保存在浏览器本机</span>
                <button type="button" onClick={saveSettings}>
                  保存当前配置
                </button>
              </div>
            ) : null}
          </div>
        </nav>
      </header>
      <div className="workspace">
        <aside className="input-column" aria-label="分析控制栏">
          <ImageInput
            files={files}
            displayAssetName={files.length === 0 ? assetName : null}
            notes={scope.notes ?? ""}
            onFileChange={handleFileChange}
            onNotesChange={updateNotes}
          />
          <ModelSidebarPanel
            availableModels={availableModels}
            hasVisionKey={hasVisionKey}
            modelListLoading={modelListLoading}
            modelListStatus={modelListStatus}
            value={visionConfig}
            onFetchModels={fetchModels}
            onVisionConfigChange={setVisionConfig}
          />
          <ScopeForm value={scope} onChange={setScope} />
          <section className="analysis-action-panel">
            <p className="sr-only">自动识别 OCR / 地物 / 设施 / 空间关系</p>
            <button className="primary-button" onClick={analyze} disabled={loading}>
              {loading ? `分析中 ${analysisProgress}%` : "开始分析"}
            </button>
            <button className="reset-button" type="button" onClick={() => setScope(defaultScope)}>
              重置
            </button>
          </section>
        </aside>
        <div className="main-workbench">
          <WorkbenchStatus
            assetName={assetName}
            fileCount={files.length}
            hasVisionKey={hasVisionKey}
            hasInvestigation={Boolean(investigation)}
            loading={loading}
            candidateCount={candidateCount}
            modelName={selectedModelName}
            error={error}
            progress={analysisProgress}
            analysisStartedAt={analysisStartedAt}
            analysisFinishedAt={analysisFinishedAt}
            now={clockNow}
          />
          {investigation ? (
            <section
              className="report-export-bar"
              aria-label="报告导出与分享"
              style= display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", margin: "12px 0" 
            >
              <button className="secondary-button" type="button" onClick={handlePrintReport}>
                打印 / 导出 PDF
              </button>
              <button className="small-button" type="button" onClick={handleDownloadMarkdown}>
                下载 Markdown
              </button>
              <button className="small-button" type="button" onClick={handleDownloadHtml}>
                下载 HTML
              </button>
              <button className="small-button" type="button" onClick={handleCopyReport}>
                复制报告
              </button>
              {exportStatus ? (
                <span className="save-status" role="status">
                  {exportStatus}
                </span>
              ) : null}
            </section>
          ) : null}
          <CandidateResults
            investigation={investigation}
            loading={loading}
            error={error}
            hasImage={files.length > 0}
            hasVisionKey={hasVisionKey}
            analysisProgress={analysisProgress}
            matchingThreshold={visionConfig.matchingThreshold ?? 0.6}
            onShowSample={showSampleInvestigation}
          />
        </div>
      </div>
    </main>
  );
}
