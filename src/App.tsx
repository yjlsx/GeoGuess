import { useEffect, useState } from "react";
import { CandidateResults } from "./components/CandidateResults";
import { ConfigPanel } from "./components/ConfigPanel";
import { ImageInput } from "./components/ImageInput";
import { ScopeForm } from "./components/ScopeForm";
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
const historyLimit = 12;
const defaultScope: UserScope = {
  regionScope: "country",
  boundaryMode: "rectangle",
  coordinateBox: { minLat: 28, minLon: 112, maxLat: 34, maxLon: 118 }
};

type SavedSettings = {
  outputLanguage?: OutputLanguage;
  visionConfig?: VisionModelConfig;
};

type LegacyVisionModelConfig = VisionModelConfig & {
  apiKey?: string;
  baseUrl?: string;
};

type HistoryItem = {
  id: string;
  assetName: string;
  candidateCount: number;
  createdAt: string;
  investigation?: Investigation;
  analysisStartedAt?: number | null;
  analysisFinishedAt?: number | null;
};

type SavedInvestigationState = {
  investigation: Investigation;
  analysisStartedAt: number | null;
  analysisFinishedAt: number | null;
};

function formatHistoryDate(value: string | number | null | undefined) {
  if (!value) {
    return "时间未知";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
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

function getAssetName(investigation: Investigation) {
  return investigation.image.originalPath.split(/[\\/]/).pop() ?? "未命名素材";
}

function bestCandidateName(investigation: Investigation | null) {
  return investigation?.candidates[0]?.name ?? "无候选名称";
}

function bestCandidateScore(investigation: Investigation | null) {
  const score = investigation?.candidates[0]?.matchScore;
  return typeof score === "number" ? `${Math.round(score * 100)}%` : "--";
}

function loadSavedSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(settingsStorageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as SavedSettings;
    const savedVisionConfig = parsed.visionConfig && typeof parsed.visionConfig === "object" ? (parsed.visionConfig as LegacyVisionModelConfig) : undefined;
    const { apiKey: _apiKey, baseUrl: _baseUrl, ...safeVisionConfig } = savedVisionConfig ?? {};
    return {
      outputLanguage: parsed.outputLanguage === "en-US" || parsed.outputLanguage === "zh-CN" ? parsed.outputLanguage : undefined,
      visionConfig: savedVisionConfig ? safeVisionConfig : undefined
    };
  } catch {
    return {};
  }
}

function loadHistory(): HistoryItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(historyStorageKey) ?? "[]") as HistoryItem[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry) => entry && typeof entry.id === "string" && typeof entry.assetName === "string")
      .map((entry) => ({
        id: entry.id,
        assetName: entry.assetName,
        candidateCount: typeof entry.candidateCount === "number" ? entry.candidateCount : entry.investigation?.candidates.length ?? 0,
        createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
        investigation: entry.investigation,
        analysisStartedAt: typeof entry.analysisStartedAt === "number" ? entry.analysisStartedAt : null,
        analysisFinishedAt: typeof entry.analysisFinishedAt === "number" ? entry.analysisFinishedAt : null
      }))
      .slice(0, historyLimit);
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
  const regionScope = scope.regionScope ?? "country";
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
  const [assetPreviewUrls, setAssetPreviewUrls] = useState<string[]>([]);
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
  const [comparisonInvestigation, setComparisonInvestigation] = useState<Investigation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<string | null>(null);
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
  const assetName = files[0]?.name ?? (investigation ? getAssetName(investigation) : null);
  const selectedModelName = visionConfig.model?.trim() || "gpt-4o";
  const primaryAssetPreviewUrl = assetPreviewUrls[0] ?? null;
  const primaryAssetMediaType = files[0]?.type ?? null;

  useEffect(() => {
    if (files.length === 0 || typeof URL.createObjectURL !== "function") {
      setAssetPreviewUrls([]);
      return;
    }

    const urls = files.map((file) => URL.createObjectURL(file));
    setAssetPreviewUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

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
    setComparisonInvestigation(null);
    setError(null);
    setExportStatus(null);
    setHistoryStatus(null);
    setAnalysisStartedAt(null);
    setAnalysisFinishedAt(null);
    setAnalysisProgress(0);
    localStorage.removeItem(latestInvestigationStorageKey);
  }

  function updateNotes(notes: string) {
    setScope((current) => ({ ...current, notes: notes || undefined }));
  }

  function persistHistory(nextHistory: HistoryItem[]) {
    localStorage.setItem(historyStorageKey, JSON.stringify(nextHistory));
  }

  function rememberInvestigation(nextInvestigation: Investigation, startedAt: number | null, finishedAt: number | null) {
    const item: HistoryItem = {
      id: nextInvestigation.id,
      assetName: getAssetName(nextInvestigation),
      candidateCount: nextInvestigation.candidates.length,
      createdAt: nextInvestigation.report?.createdAt || new Date().toISOString(),
      investigation: nextInvestigation,
      analysisStartedAt: startedAt,
      analysisFinishedAt: finishedAt
    };
    setHistory((current) => {
      const nextHistory = [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, historyLimit);
      persistHistory(nextHistory);
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

  function restoreHistoryItem(entry: HistoryItem) {
    if (!entry.investigation) {
      setHistoryStatus("这条旧历史记录缺少完整快照，无法重新打开。请用新版重新分析一次后再保存。");
      return;
    }

    setFiles([]);
    setInvestigation(entry.investigation);
    setComparisonInvestigation(null);
    setError(null);
    setExportStatus(null);
    setHistoryStatus(`已重新打开：${entry.assetName}`);
    setAnalysisStartedAt(entry.analysisStartedAt ?? null);
    setAnalysisFinishedAt(entry.analysisFinishedAt ?? null);
    setAnalysisProgress(100);
    rememberLatestInvestigation(entry.investigation, entry.analysisStartedAt ?? null, entry.analysisFinishedAt ?? null);
    setActiveMenu(null);
  }

  function compareHistoryItem(entry: HistoryItem) {
    if (!investigation) {
      setHistoryStatus("请先打开或完成一个当前调查，再选择历史记录进行对比。");
      return;
    }
    if (!entry.investigation) {
      setHistoryStatus("这条旧历史记录缺少完整快照，无法对比。请用新版重新分析一次后再保存。");
      return;
    }
    if (entry.investigation.id === investigation.id) {
      setHistoryStatus("当前调查与所选历史记录相同，无需对比。");
      return;
    }

    setComparisonInvestigation(entry.investigation);
    setHistoryStatus(`正在对比：${entry.assetName}`);
    setActiveMenu(null);
  }

  function deleteHistoryItem(id: string) {
    setHistory((current) => {
      const nextHistory = current.filter((entry) => entry.id !== id);
      persistHistory(nextHistory);
      return nextHistory;
    });
    setComparisonInvestigation((current) => (current?.id === id ? null : current));
    setHistoryStatus("已删除该条历史记录。");
  }

  function clearHistory() {
    setHistory([]);
    setComparisonInvestigation(null);
    persistHistory([]);
    setHistoryStatus("历史记录已清空，当前打开的调查不会受影响。");
  }

  function settingsForStorage() {
    const { apiKey: _apiKey, baseUrl: _baseUrl, ...safeVisionConfig } = visionConfig;
    return {
      outputLanguage,
      visionConfig: safeVisionConfig
    } satisfies SavedSettings;
  }

  async function analyze() {
    setError(null);
    setExportStatus(null);
    setHistoryStatus(null);
    setComparisonInvestigation(null);
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
      rememberInvestigation(nextInvestigation, startedAt, finishedAt);
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
    setHistoryStatus(null);
    setComparisonInvestigation(null);
    const nextInvestigation = buildSampleInvestigation(outputLanguage);
    setInvestigation(nextInvestigation);
    const now = Date.now();
    setAnalysisStartedAt(now);
    setAnalysisFinishedAt(now);
    setAnalysisProgress(100);
    rememberInvestigation(nextInvestigation, now, now);
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
          <div>
            <h1>GeoGuess</h1>
            <p>OSINT 地理定位调查指挥中心</p>
          </div>
        </div>
        <div className="command-meta" aria-label="项目状态">
          <span>
            项目：
            <strong>{investigation?.id ? investigation.id.slice(0, 16) : "LOCAL-WORKBENCH"}</strong>
          </span>
          <span className={loading ? "command-live active" : investigation ? "command-live ready" : "command-live"}>
            状态：
            <strong>{loading ? "分析中" : investigation ? "已就绪" : "待命"}</strong>
          </span>
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
              <div className="nav-popover history-popover" style={ { width: "360px", maxHeight: "70vh", overflowY: "auto" } }>
                <strong>最近分析</strong>
                {historyStatus ? <span>{historyStatus}</span> : null}
                {history.length === 0 ? <span>暂无历史记录</span> : null}
                {history.map((entry) => (
                  <div key={entry.id} style={ { display: "grid", gap: "6px", borderTop: "1px solid var(--border)", paddingTop: "8px" } }>
                    <span>
                      {entry.assetName} · {entry.candidateCount} 个候选 · {formatHistoryDate(entry.createdAt)}
                    </span>
                    <div style={ { display: "flex", flexWrap: "wrap", gap: "6px" } }>
                      <button type="button" onClick={() => restoreHistoryItem(entry)}>
                        打开
                      </button>
                      <button type="button" onClick={() => compareHistoryItem(entry)}>
                        对比当前
                      </button>
                      <button type="button" onClick={() => deleteHistoryItem(entry.id)}>
                        删除
                      </button>
                    </div>
                  </div>
                ))}
                {history.length > 0 ? (
                  <button type="button" onClick={clearHistory}>
                    清空全部历史
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
          {investigation && comparisonInvestigation ? (
            <section className="panel" aria-label="历史调查对比" style={ { display: "grid", gap: "8px", marginBottom: "10px" } }>
              <div className="card-title-row">
                <h3>历史调查对比</h3>
                <button className="small-button" type="button" onClick={() => setComparisonInvestigation(null)}>
                  关闭
                </button>
              </div>
              <div style={ { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" } }>
                <div className="scope-mode-note">
                  <strong>当前调查</strong>
                  <br />
                  {getAssetName(investigation)} · {investigation.candidates.length} 个候选
                  <br />
                  第一候选：{bestCandidateName(investigation)} · 匹配 {bestCandidateScore(investigation)}
                </div>
                <div className="scope-mode-note">
                  <strong>历史记录</strong>
                  <br />
                  {getAssetName(comparisonInvestigation)} · {comparisonInvestigation.candidates.length} 个候选
                  <br />
                  第一候选：{bestCandidateName(comparisonInvestigation)} · 匹配 {bestCandidateScore(comparisonInvestigation)}
                </div>
              </div>
            </section>
          ) : null}
          <CandidateResults
            assetMediaType={primaryAssetMediaType}
            assetName={assetName}
            assetPreviewUrl={primaryAssetPreviewUrl}
            exportStatus={exportStatus}
            investigation={investigation}
            loading={loading}
            error={error}
            hasImage={files.length > 0}
            hasVisionKey={hasVisionKey}
            analysisProgress={analysisProgress}
            analysisStartedAt={analysisStartedAt}
            analysisFinishedAt={analysisFinishedAt}
            matchingThreshold={visionConfig.matchingThreshold ?? 0.6}
            modelName={selectedModelName}
            now={clockNow}
            onCopyReport={handleCopyReport}
            onDownloadHtml={handleDownloadHtml}
            onDownloadMarkdown={handleDownloadMarkdown}
            onPrintReport={handlePrintReport}
            onShowSample={showSampleInvestigation}
          />
        </div>
      </div>
      <footer className="command-footer" aria-label="系统活动">
        <div>
          <span>系统状态</span>
          <strong>{error ? "需要处理错误" : "全部服务正常"}</strong>
        </div>
        <div>
          <span>使用量</span>
          <strong>{history.length} / {historyLimit} 条本地记录</strong>
        </div>
        <div>
          <span>活动日志</span>
          <strong>{loading ? "分析任务运行中" : investigation ? "候选生成完成" : "等待上传素材"}</strong>
        </div>
        <a href="#root">查看完整日志</a>
      </footer>
    </main>
  );
}
