import { useEffect, useState } from "react";
import { CandidateResults } from "./components/CandidateResults";
import { ConfigPanel, type ConfigPanelCopy } from "./components/ConfigPanel";
import { ImageInput, type ImageInputCopy } from "./components/ImageInput";
import { ScopeForm, type ScopeFormCopy } from "./components/ScopeForm";
import { scoreAndRankCandidates } from "./shared/candidateScoring";
import { buildReports } from "./shared/reportGenerator";
import type { CandidateManualVerdict, CropMode, FeatureMatch, Investigation, OutputLanguage, UserScope, VisionConfigProfile, VisionModelConfig } from "./shared/types";

const settingsStorageKey = "imageGeoFinder.settings";
const latestInvestigationStorageKey = "imageGeoFinder.latestInvestigation";
const defaultScope: UserScope = {
  regionScope: "country",
  boundaryMode: "rectangle",
  coordinateBox: { minLat: 28, minLon: 112, maxLat: 34, maxLon: 118 }
};
const defaultVisionProfileId = "default-profile";
const defaultVisionConfig: VisionModelConfig = {
  model: "gpt-4o",
  matchingThreshold: 0.6,
  maxCandidates: 10,
  showLowConfidenceCandidates: true,
  maxLowConfidenceCandidates: 10,
  coordinateSystem: "WGS84 (EPSG:4326)"
};

type SavedSettings = {
  outputLanguage?: OutputLanguage;
  visionConfig?: VisionModelConfig;
  visionProfiles?: VisionConfigProfile[];
  activeVisionProfileId?: string;
};

type SavedInvestigationState = {
  investigation: Investigation;
  analysisStartedAt: number | null;
  analysisFinishedAt: number | null;
};
type FeatureMatchStatus = NonNullable<Investigation["candidates"][number]["featureMatches"]>[number]["status"];
type CandidateManualVerdictStatus = CandidateManualVerdict["status"];

type AppCopy = {
  analyze: string;
  analyzing: (progress: number) => string;
  brandSubtitle: string;
  commandMetaLabel: string;
  configPanel: ConfigPanelCopy;
  errors: {
    analysisFailed: string;
    noApiKey: string;
    noFile: string;
    requestFailed: (status?: number) => string;
  };
  fetchModels: {
    empty: string;
    failed: string;
    missingApiKey: string;
    success: (count: number) => string;
  };
  imageInput: ImageInputCopy;
  interfaceLanguageLabel: string;
  navLabel: string;
  projectLabel: string;
  reset: string;
  saveStatus: string;
  scopeForm: ScopeFormCopy;
  statusAnalyzing: string;
  statusLabel: string;
  statusReady: string;
  statusStandby: string;
  workflowSidebarLabel: string;
  workflowSrOnly: string;
};

const uiCopy: Record<OutputLanguage, AppCopy> = {
  "zh-CN": {
    analyze: "开始分析",
    analyzing: (progress) => `分析中 ${progress}%`,
    brandSubtitle: "OSINT 地理定位调查指挥中心",
    commandMetaLabel: "项目状态",
    configPanel: {
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
    },
    errors: {
      analysisFailed: "分析失败",
      noApiKey: "请先填写视觉模型 API Key，系统需要视觉模型自动识别图片线索。",
      noFile: "请先上传图片或视频。",
      requestFailed: (status) => (status ? `请求失败（HTTP ${status}）` : "请求失败")
    },
    fetchModels: {
      empty: "接口未返回可用模型，可手动填写模型名。",
      failed: "模型列表获取失败",
      missingApiKey: "请先填写 API Key。",
      success: (count) => `已获取 ${count} 个模型`
    },
    imageInput: {
      assetCountUnit: "个素材",
      clearFile: "清除文件",
      fileInputLabel: "上传图片",
      fileSizeFallback: "2024-05-16 17:45:32 | 2.6 MB",
      hint: "可上传多张连续截图或一小段视频，系统会合并可见地物、站台、建筑、道路和视角线索。",
      maxSize: "最大 200MB",
      notesLabel: "附加信息（可选）",
      notesPlaceholder: "输入事件描述、来源链接、备注等...",
      supportedFormats: "支持 JPG, PNG, WEBP, MP4, MOV",
      title: "上传与输入",
      uploadCta: "点击或拖拽文件到此处"
    },
    interfaceLanguageLabel: "界面语言",
    navLabel: "工作台导航",
    projectLabel: "项目：",
    reset: "重置",
    saveStatus: "配置已保存到本机浏览器。",
    scopeForm: {
      boundaryModeLabel: "范围类型",
      collapseCountryPicker: "收起国家/地区选择",
      countryLabel: "国家/地区",
      countryPlaceholder: "搜索或选择国家/地区",
      customScope: "自定义范围",
      dateOrTimeHint: "时间提示",
      east: "东",
      emptyCountryMatch: "未匹配，可直接输入",
      expandCountryPicker: "展开国家/地区选择",
      facilityType: "设施类型",
      globalNote: "将在全球范围内生成候选位置，优先按视觉线索缩小范围。",
      globalScope: "全球",
      countryScope: "按国家/地区",
      notes: "备注",
      north: "北",
      polygonBoundary: "多边形范围",
      polygonCoordinates: "多边形坐标",
      polygonPlaceholder: "每行一个点：纬度, 经度",
      rectangleBoundary: "矩形范围",
      regionLabel: "省/州/城市（可选）",
      regionPlaceholder: "不确定可留空",
      scopeLabel: "区域范围",
      source: "来源",
      south: "南",
      title: "分析范围",
      west: "西"
    },
    statusAnalyzing: "分析中",
    statusLabel: "状态：",
    statusReady: "已就绪",
    statusStandby: "待命",
    workflowSidebarLabel: "分析控制栏",
    workflowSrOnly: "自动识别 OCR / 地物 / 设施 / 空间关系"
  },
  "en-US": {
    analyze: "Analyze",
    analyzing: (progress) => `Analyzing ${progress}%`,
    brandSubtitle: "OSINT geolocation investigation command center",
    commandMetaLabel: "Project status",
    configPanel: {
      addProfile: "Add profile",
      configName: "Profile name",
      deleteProfile: "Delete profile",
      description: "Model, Base URL, and API key are saved per local browser profile.",
      heading: "Configuration",
      modelConfig: "Model profile",
      saveButton: "Save config",
      unnamedConfig: "Unnamed profile",
      visionModelSettings: {
        apiKeyLabel: "Vision model API key",
        apiKeyPlaceholder: "Saved with the active model profile in this browser",
        baseUrlLabel: "Vision model Base URL",
        baseUrlPlaceholder: "Leave empty or use your compatible endpoint",
        coordinateSystem: "Coordinate system",
        fetchModels: "Fetch models",
        fetchingModels: "Fetching...",
        hint: "The vision model extracts OCR, map features, facility clues, and spatial relationships.",
        lowConfidenceMax: "Low-confidence limit",
        maxCandidates: "Max candidates",
        modelName: "Vision model name",
        showLowConfidence: "Show low-confidence candidates",
        subtitle: "Extract OCR, features, facilities, and spatial relationships.",
        threshold: "Match threshold",
        title: "Vision model"
      }
    },
    errors: {
      analysisFailed: "Analysis failed",
      noApiKey: "Add a vision model API key first so the system can extract image clues.",
      noFile: "Upload an image or video first.",
      requestFailed: (status) => (status ? `Request failed (HTTP ${status})` : "Request failed")
    },
    fetchModels: {
      empty: "The endpoint returned no usable models. You can enter a model name manually.",
      failed: "Model list fetch failed",
      missingApiKey: "Add an API key first.",
      success: (count) => `Fetched ${count} models`
    },
    imageInput: {
      assetCountUnit: "assets",
      clearFile: "Clear file",
      fileInputLabel: "Upload image",
      fileSizeFallback: "2024-05-16 17:45:32 | 2.6 MB",
      hint: "Upload multiple consecutive screenshots or a short video so the system can merge visible features, platforms, buildings, roads, and viewpoint clues.",
      maxSize: "Max 200MB",
      notesLabel: "Additional info (optional)",
      notesPlaceholder: "Enter event details, source links, notes...",
      supportedFormats: "Supports JPG, PNG, WEBP, MP4, MOV",
      title: "Upload & input",
      uploadCta: "Click or drag files here"
    },
    interfaceLanguageLabel: "Interface language",
    navLabel: "Workbench navigation",
    projectLabel: "Project:",
    reset: "Reset",
    saveStatus: "Configuration saved to this browser.",
    scopeForm: {
      boundaryModeLabel: "Scope type",
      collapseCountryPicker: "Collapse country/region selector",
      countryLabel: "Country/region",
      countryPlaceholder: "Search or choose a country/region",
      customScope: "Custom area",
      dateOrTimeHint: "Time hint",
      east: "East",
      emptyCountryMatch: "No match. You can type directly.",
      expandCountryPicker: "Expand country/region selector",
      facilityType: "Facility type",
      globalNote: "Candidates will be generated globally and narrowed by visual clues first.",
      globalScope: "Global",
      countryScope: "By country/region",
      notes: "Notes",
      north: "North",
      polygonBoundary: "Polygon area",
      polygonCoordinates: "Polygon coordinates",
      polygonPlaceholder: "One point per line: latitude, longitude",
      rectangleBoundary: "Rectangle area",
      regionLabel: "Province/state/city (optional)",
      regionPlaceholder: "Leave blank if unsure",
      scopeLabel: "Region scope",
      source: "Source",
      south: "South",
      title: "Analysis scope",
      west: "West"
    },
    statusAnalyzing: "Analyzing",
    statusLabel: "Status:",
    statusReady: "Ready",
    statusStandby: "Standby",
    workflowSidebarLabel: "Analysis controls",
    workflowSrOnly: "Extract OCR / features / facilities / spatial relationships"
  }
};

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

function normalizeVisionConfig(config?: VisionModelConfig): VisionModelConfig {
  return {
    ...defaultVisionConfig,
    apiKey: config?.apiKey,
    baseUrl: config?.baseUrl,
    model: config?.model ?? defaultVisionConfig.model,
    matchingThreshold: config?.matchingThreshold ?? defaultVisionConfig.matchingThreshold,
    maxCandidates: config?.maxCandidates ?? defaultVisionConfig.maxCandidates,
    showLowConfidenceCandidates: config?.showLowConfidenceCandidates ?? defaultVisionConfig.showLowConfidenceCandidates,
    maxLowConfidenceCandidates: config?.maxLowConfidenceCandidates ?? defaultVisionConfig.maxLowConfidenceCandidates,
    coordinateSystem: config?.coordinateSystem ?? defaultVisionConfig.coordinateSystem
  };
}

function normalizeVisionProfiles(settings: SavedSettings): VisionConfigProfile[] {
  if (Array.isArray(settings.visionProfiles)) {
    const profiles = settings.visionProfiles
      .filter((profile) => profile && typeof profile.id === "string" && profile.config && typeof profile.config === "object")
      .map((profile, index) => ({
        id: profile.id || `profile-${index + 1}`,
        name: typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : `配置 ${index + 1}`,
        config: normalizeVisionConfig(profile.config)
      }));

    if (profiles.length > 0) {
      return profiles;
    }
  }

  if (settings.visionConfig && typeof settings.visionConfig === "object") {
    return [
      {
        id: defaultVisionProfileId,
        name: "默认配置",
        config: normalizeVisionConfig(settings.visionConfig)
      }
    ];
  }

  return [
    {
      id: defaultVisionProfileId,
      name: "默认配置",
      config: normalizeVisionConfig()
    }
  ];
}

function resolveActiveVisionProfileId(profiles: VisionConfigProfile[], savedActiveId?: string) {
  return profiles.some((profile) => profile.id === savedActiveId) ? savedActiveId ?? profiles[0].id : profiles[0].id;
}

function syncActiveProfileConfig(profiles: VisionConfigProfile[], activeProfileId: string, config: VisionModelConfig) {
  return profiles.map((profile) => (profile.id === activeProfileId ? { ...profile, config: normalizeVisionConfig(config) } : profile));
}

function loadSavedSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(settingsStorageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as SavedSettings;
    const visionProfiles = normalizeVisionProfiles(parsed);
    const activeVisionProfileId = resolveActiveVisionProfileId(visionProfiles, parsed.activeVisionProfileId);
    const activeProfile = visionProfiles.find((profile) => profile.id === activeVisionProfileId) ?? visionProfiles[0];
    return {
      outputLanguage: parsed.outputLanguage === "en-US" || parsed.outputLanguage === "zh-CN" ? parsed.outputLanguage : undefined,
      visionConfig: activeProfile.config,
      visionProfiles,
      activeVisionProfileId
    };
  } catch {
    return {};
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

function refreshInvestigationReport(investigation: Investigation): Investigation {
  return {
    ...investigation,
    report: buildReports({
      outputLanguage: investigation.outputLanguage,
      userScope: investigation.userScope,
      extractedClues: investigation.extractedClues,
      mapFeatureProfile: investigation.mapFeatureProfile,
      metadataEvidence: investigation.metadataEvidence,
      searchQueries: investigation.searchQueries,
      searchProcess: investigation.searchProcess,
      imageAnalysis: investigation.imageAnalysis,
      seasonalAnalysis: investigation.seasonalAnalysis,
      candidates: investigation.candidates
    })
  };
}

function rescoreInvestigationCandidates(investigation: Investigation): Investigation {
  return refreshInvestigationReport({
    ...investigation,
    candidates: scoreAndRankCandidates(investigation.candidates, {
      clues: investigation.extractedClues,
      mapFeatureProfile: investigation.mapFeatureProfile,
      userScope: investigation.userScope
    })
  });
}

export default function App() {
  const savedSettings = loadSavedSettings();
  const savedInvestigation = loadLatestInvestigation();
  const restoredInvestigation = savedInvestigation?.investigation ? rescoreInvestigationCandidates(savedInvestigation.investigation) : null;
  const initialVisionProfiles = savedSettings.visionProfiles ?? normalizeVisionProfiles(savedSettings);
  const initialActiveVisionProfileId = savedSettings.activeVisionProfileId ?? resolveActiveVisionProfileId(initialVisionProfiles);
  const initialVisionConfig =
    initialVisionProfiles.find((profile) => profile.id === initialActiveVisionProfileId)?.config ?? normalizeVisionConfig(savedSettings.visionConfig);
  const [files, setFiles] = useState<File[]>([]);
  const [assetPreviewUrls, setAssetPreviewUrls] = useState<string[]>([]);
  const cropMode: CropMode = "full";
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>(savedSettings.outputLanguage ?? "zh-CN");
  const [visionProfiles, setVisionProfiles] = useState<VisionConfigProfile[]>(initialVisionProfiles);
  const [activeVisionProfileId, setActiveVisionProfileId] = useState(initialActiveVisionProfileId);
  const [visionConfig, setVisionConfig] = useState<VisionModelConfig>(initialVisionConfig);
  const [scope, setScope] = useState<UserScope>(defaultScope);
  const [investigation, setInvestigation] = useState<Investigation | null>(restoredInvestigation);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelListStatus, setModelListStatus] = useState<string | null>(null);
  const [modelListLoading, setModelListLoading] = useState(false);
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(savedInvestigation?.analysisStartedAt ?? null);
  const [analysisFinishedAt, setAnalysisFinishedAt] = useState<number | null>(savedInvestigation?.analysisFinishedAt ?? null);
  const [analysisProgress, setAnalysisProgress] = useState(restoredInvestigation ? 100 : 0);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hasVisionKey = Boolean(visionConfig.apiKey?.trim());
  const assetName = files[0]?.name ?? (investigation ? getAssetName(investigation) : null);
  const selectedModelName = visionConfig.model?.trim() || "gpt-4o";
  const primaryAssetPreviewUrl = assetPreviewUrls[0] ?? null;
  const primaryAssetMediaType = files[0]?.type ?? null;
  const copy = uiCopy[outputLanguage];

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
    if (restoredInvestigation) {
      rememberLatestInvestigation(restoredInvestigation, analysisStartedAt, analysisFinishedAt);
    }
  }, []);

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
    setAnalysisStartedAt(null);
    setAnalysisFinishedAt(null);
    setAnalysisProgress(0);
    localStorage.removeItem(latestInvestigationStorageKey);
  }

  function updateNotes(notes: string) {
    setScope((current) => ({ ...current, notes: notes || undefined }));
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

  function updateFeatureMatchStatus(candidateId: string, featureMatchIndex: number, status: FeatureMatchStatus) {
    setInvestigation((current) => {
      if (!current) {
        return current;
      }

      const nextInvestigation = refreshInvestigationReport({
        ...current,
        candidates: current.candidates.map((candidate) => {
          if (candidate.id !== candidateId || !candidate.featureMatches?.[featureMatchIndex]) {
            return candidate;
          }

          return {
            ...candidate,
            featureMatches: candidate.featureMatches.map((match, index) => (index === featureMatchIndex ? { ...match, status } : match))
          };
        })
      });

      rememberLatestInvestigation(nextInvestigation, analysisStartedAt, analysisFinishedAt);
      return nextInvestigation;
    });
  }

  function addCandidateFeatureMatch(candidateId: string, featureMatch: FeatureMatch) {
    setInvestigation((current) => {
      if (!current) {
        return current;
      }

      const nextInvestigation = refreshInvestigationReport({
        ...current,
        candidates: current.candidates.map((candidate) => {
          if (candidate.id !== candidateId) {
            return candidate;
          }

          return {
            ...candidate,
            featureMatches: [...(candidate.featureMatches ?? []), featureMatch]
          };
        })
      });

      rememberLatestInvestigation(nextInvestigation, analysisStartedAt, analysisFinishedAt);
      return nextInvestigation;
    });
  }

  function updateCandidateManualVerdict(candidateId: string, status: CandidateManualVerdictStatus, rationale: string) {
    setInvestigation((current) => {
      if (!current) {
        return current;
      }

      const trimmedRationale = rationale.trim();
      const nextInvestigation = refreshInvestigationReport({
        ...current,
        candidates: current.candidates.map((candidate) => {
          if (candidate.id !== candidateId) {
            return candidate;
          }

          return {
            ...candidate,
            manualVerdict: {
              status,
              ...(trimmedRationale ? { rationale: trimmedRationale } : {})
            }
          };
        })
      });

      rememberLatestInvestigation(nextInvestigation, analysisStartedAt, analysisFinishedAt);
      return nextInvestigation;
    });
  }

  function updateVisionConfig(nextConfig: VisionModelConfig) {
    const normalizedConfig = normalizeVisionConfig(nextConfig);
    setVisionConfig(normalizedConfig);
    setVisionProfiles((current) => syncActiveProfileConfig(current, activeVisionProfileId, normalizedConfig));
  }

  function selectVisionProfile(profileId: string) {
    const syncedProfiles = syncActiveProfileConfig(visionProfiles, activeVisionProfileId, visionConfig);
    const nextProfile = syncedProfiles.find((profile) => profile.id === profileId);
    if (!nextProfile) {
      return;
    }

    setVisionProfiles(syncedProfiles);
    setActiveVisionProfileId(profileId);
    setVisionConfig(nextProfile.config);
    setAvailableModels([]);
    setModelListStatus(null);
    setSaveStatus(null);
  }

  function renameActiveVisionProfile(name: string) {
    setVisionProfiles((current) => current.map((profile) => (profile.id === activeVisionProfileId ? { ...profile, name } : profile)));
    setSaveStatus(null);
  }

  function addVisionProfile() {
    const syncedProfiles = syncActiveProfileConfig(visionProfiles, activeVisionProfileId, visionConfig);
    let nextIndex = syncedProfiles.length + 1;
    while (syncedProfiles.some((profile) => profile.id === `profile-${nextIndex}`)) {
      nextIndex += 1;
    }
    const nextProfile: VisionConfigProfile = {
      id: `profile-${nextIndex}`,
      name: `配置 ${nextIndex}`,
      config: normalizeVisionConfig(visionConfig)
    };

    setVisionProfiles([...syncedProfiles, nextProfile]);
    setActiveVisionProfileId(nextProfile.id);
    setVisionConfig(nextProfile.config);
    setAvailableModels([]);
    setModelListStatus(null);
    setSaveStatus(null);
  }

  function deleteActiveVisionProfile() {
    if (visionProfiles.length <= 1) {
      return;
    }

    const syncedProfiles = syncActiveProfileConfig(visionProfiles, activeVisionProfileId, visionConfig);
    const remainingProfiles = syncedProfiles.filter((profile) => profile.id !== activeVisionProfileId);
    const nextProfile = remainingProfiles[0];
    setVisionProfiles(remainingProfiles);
    setActiveVisionProfileId(nextProfile.id);
    setVisionConfig(nextProfile.config);
    setAvailableModels([]);
    setModelListStatus(null);
    setSaveStatus(null);
  }

  function settingsForStorage(nextProfiles = visionProfiles, nextActiveProfileId = activeVisionProfileId, nextConfig = visionConfig) {
    const syncedProfiles = syncActiveProfileConfig(nextProfiles, nextActiveProfileId, nextConfig);
    return {
      outputLanguage,
      visionProfiles: syncedProfiles,
      activeVisionProfileId: nextActiveProfileId
    } satisfies SavedSettings;
  }

  function persistInterfaceLanguage(language: OutputLanguage) {
    try {
      const currentSettings = loadSavedSettings();
      localStorage.setItem(settingsStorageKey, JSON.stringify({ ...currentSettings, outputLanguage: language } satisfies SavedSettings));
    } catch {
      localStorage.setItem(settingsStorageKey, JSON.stringify({ outputLanguage: language } satisfies SavedSettings));
    }
  }

  function changeInterfaceLanguage(language: OutputLanguage) {
    setOutputLanguage(language);
    persistInterfaceLanguage(language);
    setSaveStatus(null);
  }

  async function analyze() {
    setError(null);
    setAnalysisStartedAt(null);
    setAnalysisFinishedAt(null);
    setAnalysisProgress(0);
    let startedAt: number | null = null;
    try {
      if (files.length === 0) {
        throw new Error(copy.errors.noFile);
      }
      if (!visionConfig.apiKey?.trim()) {
        throw new Error(copy.errors.noApiKey);
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
            coordinateSystem: visionConfig.coordinateSystem ?? "WGS84 (EPSG:4326)"
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
      setAnalysisProgress(100);
      setAnalysisFinishedAt(finishedAt);
      rememberLatestInvestigation(nextInvestigation, startedAt, finishedAt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.errors.analysisFailed);
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
        throw new Error(copy.fetchModels.missingApiKey);
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
        updateVisionConfig({ ...visionConfig, model: models.includes(visionConfig.model ?? "") ? visionConfig.model : models[0] });
        setModelListStatus(copy.fetchModels.success(models.length));
      } else {
        setModelListStatus(copy.fetchModels.empty);
      }
    } catch (caught) {
      setModelListStatus(caught instanceof Error ? caught.message : copy.fetchModels.failed);
    } finally {
      setModelListLoading(false);
    }
  }

  function saveSettings() {
    const syncedProfiles = syncActiveProfileConfig(visionProfiles, activeVisionProfileId, visionConfig);
    setVisionProfiles(syncedProfiles);
    localStorage.setItem(settingsStorageKey, JSON.stringify(settingsForStorage(syncedProfiles, activeVisionProfileId, visionConfig)));
    setSaveStatus(copy.saveStatus);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>GeoGuess</h1>
            <p>{copy.brandSubtitle}</p>
          </div>
        </div>
        <div className="command-meta" aria-label={copy.commandMetaLabel}>
          <span>
            {copy.projectLabel}
            <strong>{investigation?.id ? investigation.id.slice(0, 16) : "LOCAL-WORKBENCH"}</strong>
          </span>
          <span className={loading ? "command-live active" : investigation ? "command-live ready" : "command-live"}>
            {copy.statusLabel}
            <strong>{loading ? copy.statusAnalyzing : investigation ? copy.statusReady : copy.statusStandby}</strong>
          </span>
        </div>
        <nav className="header-nav" aria-label={copy.navLabel}>
          <div className="language-toggle" role="group" aria-label={copy.interfaceLanguageLabel}>
            <button
              aria-pressed={outputLanguage === "zh-CN"}
              className={outputLanguage === "zh-CN" ? "active" : ""}
              type="button"
              onClick={() => changeInterfaceLanguage("zh-CN")}
            >
              中
            </button>
            <button
              aria-pressed={outputLanguage === "en-US"}
              className={outputLanguage === "en-US" ? "active" : ""}
              type="button"
              onClick={() => changeInterfaceLanguage("en-US")}
            >
              EN
            </button>
          </div>
          <div className="settings-menu">
            <button
              aria-expanded={settingsOpen}
              className="header-nav-item settings-nav"
              type="button"
              onClick={() => setSettingsOpen((current) => !current)}
            >
              {outputLanguage === "zh-CN" ? "设置" : "Settings"}
            </button>
            {settingsOpen ? (
              <div className="settings-popover">
                <ConfigPanel
                  activeVisionProfileId={activeVisionProfileId}
                  availableModels={availableModels}
                  copy={copy.configPanel}
                  modelListLoading={modelListLoading}
                  modelListStatus={modelListStatus}
                  saveStatus={saveStatus}
                  visionConfig={visionConfig}
                  visionProfiles={visionProfiles}
                  onAddVisionProfile={addVisionProfile}
                  onDeleteVisionProfile={deleteActiveVisionProfile}
                  onFetchModels={fetchModels}
                  onSave={saveSettings}
                  onVisionConfigChange={updateVisionConfig}
                  onVisionProfileChange={selectVisionProfile}
                  onVisionProfileNameChange={renameActiveVisionProfile}
                />
              </div>
            ) : null}
          </div>
        </nav>
      </header>
      <div className="workspace">
        <aside className="input-column" aria-label={copy.workflowSidebarLabel}>
          <ImageInput
            copy={copy.imageInput}
            files={files}
            displayAssetName={files.length === 0 ? assetName : null}
            notes={scope.notes ?? ""}
            onFileChange={handleFileChange}
            onNotesChange={updateNotes}
          />
          <ScopeForm copy={copy.scopeForm} value={scope} onChange={setScope} />
          <section className="analysis-action-panel">
            <p className="sr-only">{copy.workflowSrOnly}</p>
            <button className="primary-button" onClick={analyze} disabled={loading}>
              {loading ? copy.analyzing(analysisProgress) : copy.analyze}
            </button>
            <button className="reset-button" type="button" onClick={() => setScope(defaultScope)}>
              {copy.reset}
            </button>
          </section>
        </aside>
        <div className="main-workbench">
          <CandidateResults
            assetMediaType={primaryAssetMediaType}
            assetName={assetName}
            assetPreviewUrl={primaryAssetPreviewUrl}
            investigation={investigation}
            loading={loading}
            error={error}
            hasImage={files.length > 0}
            hasVisionKey={hasVisionKey}
            analysisProgress={analysisProgress}
            analysisStartedAt={analysisStartedAt}
            analysisFinishedAt={analysisFinishedAt}
            showLowConfidenceCandidates={visionConfig.showLowConfidenceCandidates ?? true}
            maxLowConfidenceCandidates={visionConfig.maxLowConfidenceCandidates ?? 10}
            matchingThreshold={visionConfig.matchingThreshold ?? 0.6}
            modelName={selectedModelName}
            now={clockNow}
            onFeatureMatchStatusChange={updateFeatureMatchStatus}
            onFeatureMatchAdd={addCandidateFeatureMatch}
            onCandidateVerdictChange={updateCandidateManualVerdict}
          />
        </div>
      </div>
    </main>
  );
}
