import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import type { Investigation } from "../../src/shared/types";

const successfulInvestigation: Investigation = {
  id: "investigation-1",
  image: {
    originalPath: "uploads/image.jpg",
    cropMode: "upper_half"
  },
  outputLanguage: "zh-CN",
  userScope: {
    country: "Japan",
    region: "Tokyo",
    facilityType: "rail station",
    source: "video frame",
    dateOrTimeHint: "night",
    notes: "near a river"
  },
  extractedClues: {
    ocrText: ["Shinjuku"],
    visibleLabels: ["JR"],
    languages: ["Japanese"],
    sceneFeatures: ["rail platforms"],
    spatialRelationships: ["tracks beside towers"],
    inferredSearchTerms: ["Tokyo JR rail platform"]
  },
  mapFeatureProfile: {
    primaryFeatures: ["rail platforms"],
    spatialRelationships: ["tracks beside towers"],
    viewpointConstraints: [],
    auxiliaryTextClues: ["Shinjuku", "JR"],
    excludedSourceOnlyClues: [],
    searchInstruction: "Primary map checks: rail platforms. Spatial checks: tracks beside towers."
  },
  metadataEvidence: [],
  searchQueries: [
    {
      query: "Tokyo JR rail platform",
      language: "en",
      purpose: "scope-source-facility"
    }
  ],
  searchProcess: [
    {
      title: "步骤 1：范围/来源/设施搜索",
      query: "Tokyo JR rail platform",
      rationale: "把用户范围和设施类型组合成第一组搜索词",
      status: "planned"
    }
  ],
  imageAnalysis: {
    recognitionMode: "local-metadata",
    observations: ["自动读取图片尺寸：1280 x 720"],
    limitations: ["未配置视觉模型，OCR 和地物识别依赖手动线索或后续模型"]
  },
  seasonalAnalysis: {
    captureDateHint: "2026-04-18",
    inferredSeason: "春季",
    confidence: "medium",
    reasoning: ["日期提示 2026-04-18 对应北半球春季"],
    mapComparisonNotes: ["在 Google Earth 历史影像中优先对比春季或相邻月份"]
  },
  candidates: [
    {
      id: "candidate-1",
      latitude: 35.6895,
      longitude: 139.6917,
      confidence: "high",
      matchScore: 84,
      matchedFeatures: ["rail platforms", "urban towers"],
      featureMatches: [
        {
          imageFeature: "原图中道路后方可见红色跑道",
          mapFeature: "候选点北侧椭圆操场跑道",
          verification: "在 Google Earth 中对比跑道弧线、入口道路和建筑相对位置。",
          status: "matched"
        },
        {
          imageFeature: "原图右侧道路边界与候选点相反",
          mapFeature: "卫星图道路边界出现在左侧",
          verification: "如果旋转地图后仍然相反，应排除此候选。",
          status: "mismatch"
        }
      ],
      missingOrUnverifiedFeatures: ["road boundary partly hidden"],
      viewpointNotes: ["camera south of tracks looking north"],
      mapLinks: {
        googleMaps: "https://maps.example.test/?q=35.6895,139.6917",
        googleEarthHint: "Check platform geometry in Google Earth."
      },
      mapPreview: {
        googleMapsEmbedUrl: "https://maps.example.test/embed?q=35.6895,139.6917&t=k",
        googleEarthWebUrl: "https://earth.example.test/search/35.6895,139.6917",
        screenshotStatus: "当前默认使用 Google Maps 卫星图像预览；Earth 历史影像需要打开核验。",
        notes: ["对比轨道方向、塔楼相对位置和道路边界"]
      },
      matchingEvidence: ["JR sign matches"],
      uncertainty: ["Image is cropped"],
      sources: [],
      osintLinks: [
        {
          title: "OpenRailwayMap nearby",
          url: "https://www.openrailwaymap.org/?style=standard&lat=35.68950&lon=139.69170&zoom=16",
          note: "Check railway infrastructure near this candidate."
        },
        {
          title: "SunCalc shadow check",
          url: "https://www.suncalc.org/#/35.68950,139.69170,16",
          note: "Compare shadows and capture time."
        }
      ],
      earthVerificationChecklist: ["Compare tower alignment"]
    }
  ],
  report: {
    summaryMarkdown: "Summary",
    fullMarkdown: "完整报告：包含证据链",
    createdAt: "2026-05-31T00:00:00.000Z"
  }
};

function openSettings() {
  fireEvent.click(screen.queryByRole("button", { name: "设置" }) ?? screen.getByRole("button", { name: "Settings" }));
}

function switchInterfaceLanguage(language: "zh-CN" | "en-US") {
  fireEvent.click(screen.getByRole("button", { name: language === "zh-CN" ? "中" : "EN" }));
}

function openAdvancedDetails() {
  fireEvent.click(screen.getByText("高级核验详情"));
}

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("renders the investigation workspace", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "GeoGuess" })).toBeInTheDocument();
    expect(screen.getByText("OSINT 地理定位调查指挥中心")).toBeInTheDocument();
    expect(screen.getByText("模型状态")).toBeInTheDocument();
    expect(screen.getByText("分析状态")).toBeInTheDocument();
    expect(screen.getByText("暂无候选")).toBeInTheDocument();
    expect(screen.getByText("开始时间")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "项目" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "OC" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "历史记录" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "查看完整日志" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "界面语言" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "中" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    openSettings();
    expect(screen.getByRole("heading", { name: "配置" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "视觉模型" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存配置" })).toBeInTheDocument();
    expect(screen.getByText("自动识别 OCR / 地物 / 设施 / 空间关系")).toBeInTheDocument();
    expect(screen.getByLabelText("区域范围")).toHaveValue("country");
    expect(screen.getByLabelText("国家/地区")).toBeInTheDocument();
    expect(screen.getByLabelText("视觉模型 API Key")).toBeInTheDocument();
    expect(screen.getByLabelText("视觉模型 Base URL")).toBeInTheDocument();
    expect(screen.queryByLabelText("OCR 文字")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("可见标识")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("地物特征")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("空间关系")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("搜索词")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("输出语言")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始分析" })).toBeInTheDocument();
  });

  it("defaults to analyzing the uploaded image as-is", () => {
    render(<App />);

    expect(screen.queryByLabelText("分析区域")).not.toBeInTheDocument();
    expect(screen.getByText("可上传多张连续截图或一小段视频，系统会合并可见地物、站台、建筑、道路和视角线索。")).toBeInTheDocument();
  });

  it("switches the visible interface language from the header", () => {
    render(<App />);

    switchInterfaceLanguage("en-US");

    expect(screen.getByText("OSINT geolocation investigation command center")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze" })).toBeInTheDocument();
    expect(screen.getByText("Upload & input")).toBeInTheDocument();
    expect(screen.getByText("Analysis scope")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("heading", { name: "Configuration" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Output language")).not.toBeInTheDocument();

    switchInterfaceLanguage("zh-CN");
    expect(screen.getByText("OSINT 地理定位调查指挥中心")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始分析" })).toBeInTheDocument();
  });

  it("supports searching and selecting a country or region", () => {
    render(<App />);

    const countryInput = screen.getByLabelText("国家/地区");
    fireEvent.focus(countryInput);
    fireEvent.change(countryInput, { target: { value: "jap" } });

    fireEvent.click(screen.getByRole("option", { name: /日本/i }));

    expect(countryInput).toHaveValue("日本");
  });

  it("saves and restores model configuration profiles locally", () => {
    const { unmount } = render(<App />);

    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "saved-api-key" } });
    fireEvent.change(screen.getByLabelText("视觉模型 Base URL"), { target: { value: "https://proxy.example/v1" } });
    fireEvent.change(screen.getByLabelText("视觉模型名称"), { target: { value: "vision-model" } });
    fireEvent.click(screen.getByLabelText("展示低置信候选"));
    fireEvent.change(screen.getByLabelText("低置信最多展示"), { target: { value: "3" } });
    switchInterfaceLanguage("en-US");
    fireEvent.click(screen.getByRole("button", { name: "Save config" }));

    expect(screen.getByText("Configuration saved to this browser.")).toBeInTheDocument();
    expect(localStorage.getItem("imageGeoFinder.settings")).toContain("saved-api-key");
    expect(localStorage.getItem("imageGeoFinder.settings")).toContain("https://proxy.example/v1");
    expect(localStorage.getItem("imageGeoFinder.settings")).toContain("showLowConfidenceCandidates");
    expect(localStorage.getItem("imageGeoFinder.settings")).toContain("maxLowConfidenceCandidates");
    unmount();
    render(<App />);
    openSettings();

    expect(screen.getByLabelText("Vision model API key")).toHaveValue("saved-api-key");
    expect(screen.getByLabelText("Vision model Base URL")).toHaveValue("https://proxy.example/v1");
    expect(screen.getByLabelText("Vision model name")).toHaveValue("vision-model");
    expect(screen.getByLabelText("Show low-confidence candidates")).not.toBeChecked();
    expect(screen.getByLabelText("Low-confidence limit")).toHaveValue("3");
    expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("输出语言")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("切换地形校验")).not.toBeInTheDocument();
  });

  it("migrates a legacy saved model config into a profile", () => {
    localStorage.setItem(
      "imageGeoFinder.settings",
      JSON.stringify({
        outputLanguage: "zh-CN",
        visionConfig: {
          baseUrl: "https://proxy.example/v1",
          model: "vision-model",
          matchingThreshold: 0.72,
          maxCandidates: 20,
          coordinateSystem: "WGS84 (EPSG:4326)",
          terrainValidation: true
        }
      })
    );

    render(<App />);
    openSettings();

    expect(screen.getByLabelText("视觉模型 Base URL")).toHaveValue("https://proxy.example/v1");
    expect(screen.getByLabelText("视觉模型名称")).toHaveValue("vision-model");
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
    expect(localStorage.getItem("imageGeoFinder.settings")).toContain("visionProfiles");
    expect(localStorage.getItem("imageGeoFinder.settings")).toContain("https://proxy.example/v1");
    expect(localStorage.getItem("imageGeoFinder.settings")).not.toContain("terrainValidation");
  });

  it("can create, switch, save, and delete model profiles", () => {
    render(<App />);

    openSettings();
    fireEvent.change(screen.getByLabelText("配置名称"), { target: { value: "主配置" } });
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "key-main" } });
    fireEvent.change(screen.getByLabelText("视觉模型 Base URL"), { target: { value: "https://main.example/v1" } });
    fireEvent.change(screen.getByLabelText("视觉模型名称"), { target: { value: "main-model" } });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
    fireEvent.click(screen.getByRole("button", { name: "新增配置" }));

    fireEvent.change(screen.getByLabelText("配置名称"), { target: { value: "备用配置" } });
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "key-backup" } });
    fireEvent.change(screen.getByLabelText("视觉模型 Base URL"), { target: { value: "https://backup.example/v1" } });
    fireEvent.change(screen.getByLabelText("视觉模型名称"), { target: { value: "backup-model" } });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    fireEvent.change(screen.getByLabelText("模型配置"), { target: { value: "default-profile" } });
    expect(screen.getByLabelText("视觉模型 API Key")).toHaveValue("key-main");
    expect(screen.getByLabelText("视觉模型 Base URL")).toHaveValue("https://main.example/v1");
    expect(screen.getByLabelText("视觉模型名称")).toHaveValue("main-model");

    fireEvent.change(screen.getByLabelText("模型配置"), { target: { value: "profile-2" } });
    expect(screen.getByLabelText("视觉模型 API Key")).toHaveValue("key-backup");
    expect(screen.getByLabelText("视觉模型 Base URL")).toHaveValue("https://backup.example/v1");
    expect(screen.getByLabelText("视觉模型名称")).toHaveValue("backup-model");

    fireEvent.click(screen.getByRole("button", { name: "删除配置" }));
    expect(screen.queryByDisplayValue("备用配置")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
    expect(localStorage.getItem("imageGeoFinder.settings")).not.toContain("key-backup");
    expect(localStorage.getItem("imageGeoFinder.settings")).toContain("key-main");
  });

  it("loads selectable models with the configured API key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ models: ["geo-vision-v2", "gpt-4o"] })
    } as Response);
    render(<App />);

    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.change(screen.getByLabelText("视觉模型 Base URL"), { target: { value: "https://proxy.example/v1" } });
    fireEvent.click(screen.getByRole("button", { name: "获取模型列表" }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith("/api/models", expect.any(Object)));
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      apiKey: "test-api-key",
      baseUrl: "https://proxy.example/v1"
    });
    expect(await screen.findByText("已获取 2 个模型")).toBeInTheDocument();
    expect(screen.getByLabelText("视觉模型名称")).toHaveValue("gpt-4o");
    fireEvent.change(screen.getByLabelText("视觉模型名称"), { target: { value: "geo-vision-v2" } });
    expect(screen.getByLabelText("视觉模型名称")).toHaveValue("geo-vision-v2");
  });

  it("shows a local error and does not call fetch when no file is selected", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请先上传图片或视频。");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a vision model key before submitting an uploaded image", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请先填写视觉模型 API Key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the analysis process while an investigation request is running", async () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise<Response>(() => {}));
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(await screen.findByRole("status")).toHaveTextContent("分析过程");
    openAdvancedDetails();
    expect(screen.getByText("分析中... 8%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "分析进度" })).toHaveAttribute("aria-valuenow", "8");
    expect(screen.getByText("上传原图与素材")).toBeInTheDocument();
    expect(screen.getByText("原图元数据检查")).toBeInTheDocument();
    expect(screen.getByText("视觉模型识别")).toBeInTheDocument();
    expect(screen.getByText("来源反查与候选搜索")).toBeInTheDocument();
    expect(screen.getByText("地图与 Earth 核验准备")).toBeInTheDocument();
  });

  it("updates the analysis readiness checklist from uploaded image and vision key", () => {
    render(<App />);

    expect(screen.getByText("等待图片")).toBeInTheDocument();
    expect(screen.getByText("视觉模型未配置")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });

    expect(screen.getByText("图片已就绪")).toBeInTheDocument();
    expect(screen.getByText("视觉模型已配置")).toBeInTheDocument();
  });

  it("keeps the empty candidate state focused on real analysis", () => {
    render(<App />);

    expect(screen.getByText("开始分析后显示候选排行")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看示例证据链" })).not.toBeInTheDocument();
  });

  it("explains when a completed investigation has no candidates because online search was unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ...successfulInvestigation,
        id: "candidate-search-unavailable",
        candidates: [],
        searchProcess: [
          ...successfulInvestigation.searchProcess,
          {
            title: "候选坐标搜索暂时不可用",
            rationale:
              "联网候选搜索上游暂时失败，本次分析保留识别线索、搜索语句和人工核验报告，但不会伪造候选坐标。技术详情：HTTP 502",
            status: "planned"
          }
        ],
        report: {
          ...successfulInvestigation.report,
          summaryMarkdown: "尚未生成候选坐标。",
          fullMarkdown: "## 搜索过程\n- 候选坐标搜索暂时不可用\n\n## 候选地点\n尚未生成候选坐标。"
        }
      })
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(await screen.findByText("候选结果")).toBeInTheDocument();
    expect(screen.getAllByText("候选坐标搜索暂时不可用").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/不会伪造候选坐标/).length).toBeGreaterThan(0);
    expect(screen.getByText(/候选搜索上游暂时不可用/)).toBeInTheDocument();
  });

  it("restores the latest investigation after a reload-like remount", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    const { unmount } = render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(await screen.findAllByText("35.68950, 139.69170")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "历史记录" })).not.toBeInTheDocument();
    expect(localStorage.getItem("imageGeoFinder.latestInvestigation")).toContain("investigation-1");
    expect(localStorage.getItem("imageGeoFinder.history")).toBeNull();

    unmount();
    render(<App />);

    expect(screen.getByText("分析完成 100%")).toBeInTheDocument();
    expect(screen.getAllByText("35.68950, 139.69170")).not.toHaveLength(0);
    expect(screen.getByText("候选位置")).toBeInTheDocument();
  });

  it("does not render canvas markers when restored history has no cached image preview", () => {
    localStorage.setItem(
      "imageGeoFinder.latestInvestigation",
      JSON.stringify({
        investigation: {
          ...successfulInvestigation,
          id: "restored-no-preview",
          extractedClues: {
            ...successfulInvestigation.extractedClues,
            ocrText: ["火箭军某新兵团 袁航"],
            visibleLabels: ["国防军事", "CCTV.com"]
          }
        },
        savedAt: Date.now()
      })
    );

    render(<App />);

    expect(screen.getByText("历史调查素材未缓存")).toBeInTheDocument();
    expect(document.querySelectorAll(".canvas-marker")).toHaveLength(0);
  });

  it("rescoring restored candidates demotes terrain-only facility mismatches", () => {
    localStorage.setItem(
      "imageGeoFinder.latestInvestigation",
      JSON.stringify({
        investigation: {
          ...successfulInvestigation,
          id: "restored-rescore",
          userScope: {
            ...successfulInvestigation.userScope,
            facilityType: "rail station"
          },
          extractedClues: {
            ...successfulInvestigation.extractedClues,
            sceneFeatures: ["rail platform", "station building", "paved road"],
            spatialRelationships: ["station building east of the platform"]
          },
          mapFeatureProfile: {
            ...successfulInvestigation.mapFeatureProfile,
            primaryFeatures: ["rail platform", "station building", "paved road"],
            spatialRelationships: ["station building east of the platform"],
            viewpointConstraints: []
          },
          candidates: [
            {
              ...successfulInvestigation.candidates[0],
              id: "terrain-only",
              name: "Terrain-only hillside",
              latitude: 35.11,
              longitude: 139.22,
              confidence: "high",
              matchScore: 99,
              matchedFeatures: ["open farmland", "forest", "mountain slope"],
              featureMatches: [],
              matchingEvidence: [
                "Satellite imagery shows open farmland, forest, and a tree-covered mountain slope; no rail platform or station building is visible",
                "本地证据评分 90/100：旧评分"
              ],
              uncertainty: ["本地证据评分扣分项：旧扣分"]
            },
            {
              ...successfulInvestigation.candidates[0],
              id: "facility-supported",
              name: "Facility-supported station",
              latitude: 36.33,
              longitude: 140.44,
              confidence: "low",
              matchScore: 35,
              matchedFeatures: ["rail platform", "station building"],
              featureMatches: [],
              matchingEvidence: ["Satellite map shows a rail platform and station building beside a paved road"],
              uncertainty: []
            }
          ]
        },
        analysisStartedAt: 1,
        analysisFinishedAt: 2
      })
    );

    render(<App />);

    openAdvancedDetails();
    const candidateHeadings = screen.getAllByText(/候选 \d：/);
    expect(candidateHeadings[0]).toHaveTextContent("候选 1：Facility-supported station");
    expect(candidateHeadings[1]).toHaveTextContent("候选 2：Terrain-only hillside");
    const saved = JSON.parse(localStorage.getItem("imageGeoFinder.latestInvestigation") ?? "{}") as { investigation?: Investigation };
    const terrainOnly = saved.investigation?.candidates.find((candidate) => candidate.id === "terrain-only");
    expect(terrainOnly?.uncertainty.filter((item) => item.startsWith("本地证据评分扣分项："))).toHaveLength(1);
    expect(terrainOnly?.uncertainty.join(" ")).toContain("地貌/设施错配");
  });

  it("posts the selected image, crop mode, scope fields, and vision model settings", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    const file = new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("上传图片"), { target: { files: [file] } });
    expect(screen.queryByLabelText("分析区域")).not.toBeInTheDocument();
    switchInterfaceLanguage("en-US");
    openSettings();
    fireEvent.change(screen.getByLabelText("Region scope"), { target: { value: "country" } });
    fireEvent.change(screen.getByLabelText("Country/region"), { target: { value: "Japan" } });
    fireEvent.change(screen.getByLabelText("Province/state/city (optional)"), { target: { value: "Tokyo" } });
    fireEvent.change(screen.getByLabelText("Facility type"), { target: { value: "rail station" } });
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "video frame" } });
    fireEvent.change(screen.getByLabelText("Time hint"), { target: { value: "night" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "near a river" } });
    fireEvent.change(screen.getByLabelText("Vision model API key"), { target: { value: "test-api-key" } });
    fireEvent.change(screen.getByLabelText("Vision model name"), { target: { value: "vision-model" } });

    fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/investigations", expect.any(Object)));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const formData = request.body as FormData;
    expect(request.method).toBe("POST");
    expect(formData.getAll("assets")).toEqual([file]);
    expect(formData.get("cropMode")).toBe("full");
    expect(formData.get("outputLanguage")).toBe("en-US");
    expect(formData.get("country")).toBe("Japan");
    expect(formData.get("region")).toBe("Tokyo");
    expect(formData.get("facilityType")).toBe("rail station");
    expect(formData.get("source")).toBe("video frame");
    expect(formData.get("dateOrTimeHint")).toBe("night");
    expect(formData.get("notes")).toBe("near a river");
    expect(formData.get("regionScope")).toBe("country");
    expect(formData.has("boundaryMode")).toBe(false);
    expect(formData.has("coordinateBox")).toBe(false);
    expect(JSON.parse(formData.get("visionConfig") as string)).toEqual({
      apiKey: "test-api-key",
      model: "vision-model",
      matchingThreshold: 0.6,
      maxCandidates: 10,
      coordinateSystem: "WGS84 (EPSG:4326)"
    });
    expect(formData.has("manualClues")).toBe(false);
  });

  it("allows country-only scope without requiring a city or coordinate box", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    const file = new File(["image-bytes"], "country-only.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("上传图片"), { target: { files: [file] } });
    openSettings();
    fireEvent.change(screen.getByLabelText("区域范围"), { target: { value: "country" } });
    fireEvent.change(screen.getByLabelText("国家/地区"), { target: { value: "Mongolia" } });
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });

    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/investigations", expect.any(Object)));
    const formData = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(formData.get("regionScope")).toBe("country");
    expect(formData.get("country")).toBe("Mongolia");
    expect(formData.has("region")).toBe(false);
    expect(formData.has("boundaryMode")).toBe(false);
    expect(formData.has("coordinateBox")).toBe(false);
  });

  it("posts multiple selected images and videos as analysis assets", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    const first = new File(["image-a"], "frame-a.jpg", { type: "image/jpeg" });
    const second = new File(["image-b"], "frame-b.jpg", { type: "image/jpeg" });
    const video = new File(["video-bytes"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText("上传图片"), { target: { files: [first, second, video] } });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });

    expect(screen.getAllByText("frame-a.jpg").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/3 个素材/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect((request.body as FormData).getAll("assets")).toEqual([first, second, video]);
  });

  it("shows a clean JSON error string when the server returns a JSON error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ error: "Vision service unavailable" }),
      text: async () => JSON.stringify({ error: "Vision service unavailable" })
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Vision service unavailable");
    expect(alert).not.toHaveTextContent('"error"');
  });

  it("shows a compact upstream search failure with technical details collapsed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        error:
          "候选坐标搜索失败：联网候选搜索暂时不可用（HTTP 502）。系统已自动重试 3 次，仍未收到可用结果。错误摘要：Upstream request failed / upstream_error。这通常是模型服务或你配置的 Base URL 上游临时失败；可以稍后重试，或在右上角设置里切换模型或 Base URL。"
      })
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("候选坐标搜索暂时不可用")).toBeInTheDocument();
    expect(within(alert).getByText(/Responses API 和 web_search_preview/)).toBeInTheDocument();
    expect(within(alert).getByText(/切换到支持联网搜索的模型\/Base URL/)).toBeInTheDocument();
    expect(within(alert).getByText("查看技术详情")).toBeInTheDocument();
    expect(alert.querySelector(".compact-error")).not.toBeNull();
  });

  it("renders candidate coordinates, evidence, and report after a successful response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(await screen.findAllByText("35.68950, 139.69170")).not.toHaveLength(0);
    expect(screen.getByText("分析完成 100%")).toBeInTheDocument();
    expect(screen.getByText("匹配评分 84/100")).toBeInTheDocument();
    expect(screen.getAllByText("rail platforms")).not.toHaveLength(0);
    expect(screen.getByText("road boundary partly hidden")).toBeInTheDocument();
    expect(screen.getAllByText("camera south of tracks looking north")).not.toHaveLength(0);
    expect(screen.getAllByText("高置信")).not.toHaveLength(0);
    expect(screen.queryByText("high")).not.toBeInTheDocument();
    const investigationRail = screen.getByLabelText("调查面板");
    const primaryEvidenceBoard = within(investigationRail).getByLabelText("当前候选证据对照");
    expect(within(primaryEvidenceBoard).getByText("证据对照")).toBeInTheDocument();
    expect(within(primaryEvidenceBoard).getByText("原图中道路后方可见红色跑道")).toBeInTheDocument();
    expect(within(primaryEvidenceBoard).getByText("候选点北侧椭圆操场跑道")).toBeInTheDocument();
    expect(within(primaryEvidenceBoard).getByText("不匹配")).toBeInTheDocument();
    openAdvancedDetails();
    expect(screen.getByLabelText("高级核验摘要")).toBeInTheDocument();
    expect(screen.getByText("核验档案")).toBeInTheDocument();
    expect(screen.getByText("证据链总览")).toBeInTheDocument();
    expect(screen.getByText("核验工作台")).toBeInTheDocument();
    expect(screen.getByText("地图核验候选（Top 1）")).toBeInTheDocument();
    expect(screen.getByText("地图与 Earth 核验入口")).toBeInTheDocument();
    expect(screen.getByText("当前默认使用 Google Maps 卫星图像预览；Earth 历史影像需要打开核验。")).toBeInTheDocument();
    fireEvent.click(screen.getByText("证据链与搜索过程"));
    expect(screen.getByText("来源反查 / OCR 搜索")).toBeInTheDocument();
    expect(screen.getByText("媒体文字")).toBeInTheDocument();
    expect(screen.getByText("搜索查询")).toBeInTheDocument();
    expect(screen.getByText("地图可核验特征")).toBeInTheDocument();
    expect(screen.getByText("OCR: Shinjuku")).toBeInTheDocument();
    expect(screen.getByText("标识: JR")).toBeInTheDocument();
    expect(screen.getByText("Tokyo JR rail platform")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "外部搜索 Tokyo JR rail platform" })).toHaveAttribute(
      "href",
      "https://www.google.com/search?q=Tokyo%20JR%20rail%20platform"
    );
    expect(screen.getByText("自动识别线索")).toBeInTheDocument();
    expect(screen.getByText("分析过程")).toBeInTheDocument();
    expect(screen.getByText("视觉线索提取完成")).toBeInTheDocument();
    expect(screen.getByText("地图核验特征集合")).toBeInTheDocument();
    expect(screen.getAllByText("Primary map checks: rail platforms. Spatial checks: tracks beside towers.")).not.toHaveLength(0);
    expect(screen.getByText("搜索过程")).toBeInTheDocument();
    expect(screen.getByText("季节与历史影像")).toBeInTheDocument();
    expect(screen.getByText("地图与 Earth 核验入口")).toBeInTheDocument();
    expect(screen.getByText("外部 OSINT 核验入口")).toBeInTheDocument();
    expect(screen.queryByText("候选外部 OSINT 核验入口")).not.toBeInTheDocument();
    expect(screen.queryByText("报告导出")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打印 / 导出 PDF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载 Markdown" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载 HTML" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制报告" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OpenRailwayMap nearby" })).toHaveAttribute(
      "href",
      "https://www.openrailwaymap.org/?style=standard&lat=35.68950&lon=139.69170&zoom=16"
    );
    expect(screen.getByRole("link", { name: "SunCalc shadow check" })).toHaveAttribute(
      "href",
      "https://www.suncalc.org/#/35.68950,139.69170,16"
    );
    fireEvent.click(screen.getByRole("button", { name: "地图核验" }));
    expect(screen.getByLabelText("证据画布候选分布地图")).toBeInTheDocument();
    expect(screen.queryByTitle("证据画布当前候选卫星地图")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "卫星图" }));
    expect(screen.getByText("当前候选卫星图")).toBeInTheDocument();
    const mapFrame = screen.getByTitle("证据画布当前候选卫星地图");
    expect(mapFrame).toHaveAttribute("src", "https://maps.example.test/embed?q=35.6895,139.6917&t=k");
    expect(screen.queryByTitle("候选 1 Google Maps 卫星图像预览")).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "打开 Earth" })
        .some((link) => link.getAttribute("href") === "https://earth.example.test/search/35.6895,139.6917")
    ).toBe(true);
    fireEvent.click(screen.getByText("查看完整证据链"));
    const detailedEvidenceBoard = screen.getByLabelText("证据对照");
    expect(within(detailedEvidenceBoard).getByText("证据对照")).toBeInTheDocument();
    expect(within(detailedEvidenceBoard).getByText("原图中道路后方可见红色跑道")).toBeInTheDocument();
    expect(within(detailedEvidenceBoard).getByText("候选点北侧椭圆操场跑道")).toBeInTheDocument();
    expect(within(detailedEvidenceBoard).getByText("在 Google Earth 中对比跑道弧线、入口道路和建筑相对位置。")).toBeInTheDocument();
    expect(within(detailedEvidenceBoard).getByText("不匹配")).toBeInTheDocument();
    expect(within(detailedEvidenceBoard).getByText("原图右侧道路边界与候选点相反")).toBeInTheDocument();
    expect(within(detailedEvidenceBoard).getByText("如果旋转地图后仍然相反，应排除此候选。")).toBeInTheDocument();
    expect(screen.getByText("JR sign matches")).toBeInTheDocument();
    fireEvent.click(screen.getByText("完整 Markdown 报告"));
    expect(screen.getByText("完整报告：包含证据链")).toBeInTheDocument();
  });

  it("renders usable evidence image controls", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:frame-preview")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(await screen.findAllByText("35.68950, 139.69170")).not.toHaveLength(0);
    const image = screen.getByAltText("frame.jpg 证据预览");
    fireEvent.click(screen.getByRole("button", { name: "缩小证据图" }));
    expect(image).toHaveStyle({ transform: "scale(0.75)" });
    fireEvent.click(screen.getByRole("button", { name: "放大证据图" }));
    expect(image).toHaveStyle({ transform: "scale(1)" });
    fireEvent.click(screen.getByRole("button", { name: "放大证据图" }));
    expect(image).toHaveStyle({ transform: "scale(1.25)" });
    fireEvent.click(screen.getByRole("button", { name: "切换完整显示" }));
    expect(image).toHaveStyle({ objectFit: "contain" });
    fireEvent.click(screen.getByRole("button", { name: "增强图像亮度" }));
    expect(image).toHaveStyle({ filter: "brightness(1.18) contrast(1.08) saturate(1.08)" });
    fireEvent.click(screen.getByRole("button", { name: "重置证据图" }));
    expect(image).toHaveStyle({ transform: "scale(1)" });
  });

  it("shows a primary original-image and map comparison panel for the selected candidate", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:frame-preview")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    const comparisonPanel = await screen.findByLabelText("原图 / 地图对照");
    expect(within(comparisonPanel).getByText("原图 / 地图对照")).toBeInTheDocument();
    expect(within(comparisonPanel).getByAltText("frame.jpg 原图对照")).toHaveAttribute("src", "blob:frame-preview");
    expect(within(comparisonPanel).getByTitle("当前候选地图对照")).toHaveAttribute(
      "src",
      "https://maps.example.test/embed?q=35.6895,139.6917&t=k"
    );
    expect(within(comparisonPanel).getByText("35.68950, 139.69170")).toBeInTheDocument();
    expect(within(comparisonPanel).getByRole("link", { name: "打开 Maps 对照" })).toHaveAttribute(
      "href",
      "https://maps.example.test/?q=35.6895,139.6917"
    );
    expect(within(comparisonPanel).getByRole("link", { name: "打开 Earth 对照" })).toHaveAttribute(
      "href",
      "https://earth.example.test/search/35.6895,139.6917"
    );
  });

  it("puts the candidate place name before coordinates in map and detail panels", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ...successfulInvestigation,
        candidates: [
          {
            ...successfulInvestigation.candidates[0],
            name: "Shinjuku Rail Yard",
            latitude: 35.6895,
            longitude: 139.6917
          }
        ]
      })
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    await waitFor(() => expect(screen.getAllByText("Shinjuku Rail Yard").length).toBeGreaterThan(0));
    const comparisonMeta = document.querySelector(".comparison-map-meta");
    expect(comparisonMeta?.textContent).toMatch(/^Shinjuku Rail Yard35\.68950, 139\.69170$/);
    const miniMapSummary = document.querySelector(".mini-map-summary");
    expect(miniMapSummary?.textContent).toMatch(/^Shinjuku Rail Yard35\.68950, 139\.69170/);

    openAdvancedDetails();
    const currentCandidate = screen.getByLabelText("当前候选");
    expect(currentCandidate.textContent).toMatch(/Shinjuku Rail Yard35\.68950, 139\.69170/);
    expect(currentCandidate.textContent).not.toMatch(/35\.68950, 139\.69170.*Shinjuku Rail Yard/);
    const mapHandoffSummary = document.querySelector(".map-handoff-summary");
    expect(mapHandoffSummary?.textContent).toMatch(/^Shinjuku Rail Yard35\.68950, 139\.69170/);

    fireEvent.click(screen.getByRole("button", { name: "地图核验" }));
    fireEvent.click(screen.getByRole("tab", { name: "卫星图" }));
    const selectedMapOverlay = document.querySelector(".selected-map-overlay");
    expect(selectedMapOverlay?.textContent).toBe("Shinjuku Rail Yard35.68950, 139.69170");
  });

  it("anchors media and OCR label markers to the corresponding overlay regions", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:marker-preview")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ...successfulInvestigation,
        id: "overlay-marker-investigation",
        extractedClues: {
          ...successfulInvestigation.extractedClues,
          ocrText: ["火箭军某新兵团 袁航", "军事报道"],
          visibleLabels: ["国防军事", "CCTV.com", "CCTV 7"]
        }
      })
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(await screen.findByText("候选结果")).toBeInTheDocument();
    const markers = Array.from(document.querySelectorAll<HTMLElement>(".canvas-marker"));
    const markerByTitle = (title: string) => markers.find((marker) => marker.title.includes(title));

    expect(markerByTitle("国防军事")).toMatchObject({ style: expect.objectContaining({ left: "9%", top: "7%" }) });
    expect(markerByTitle("CCTV.com")).toMatchObject({ style: expect.objectContaining({ left: "91%", top: "7%" }) });
    expect(markerByTitle("军事报道")).toMatchObject({ style: expect.objectContaining({ left: "13%", top: "76%" }) });
    expect(markerByTitle("火箭军某新兵团 袁航")).toMatchObject({ style: expect.objectContaining({ left: "48%", top: "72%" }) });
  });

  it("sorts candidates by feature match score and keeps review controls out of the core flow", async () => {
    const lowerScoreCandidate = {
      ...successfulInvestigation.candidates[0],
      id: "candidate-low",
      name: "Lower score location",
      latitude: 35.1111,
      longitude: 139.2222,
      confidence: "high" as const,
      matchScore: 40,
      matchedFeatures: ["red wall"],
      missingOrUnverifiedFeatures: ["platform not visible"],
      mapLinks: {
        ...successfulInvestigation.candidates[0].mapLinks,
        googleMaps: "https://maps.example.test/?q=35.1111,139.2222"
      },
      mapPreview: {
        ...successfulInvestigation.candidates[0].mapPreview,
        googleMapsEmbedUrl: "https://maps.example.test/embed?q=35.1111,139.2222&t=k",
        googleEarthWebUrl: "https://earth.example.test/search/35.1111,139.2222",
        notes: ["Check low score site in Earth"]
      }
    };
    const higherScoreCandidate = {
      ...successfulInvestigation.candidates[0],
      id: "candidate-high",
      name: "Higher score location",
      latitude: 36.3333,
      longitude: 140.4444,
      confidence: "medium" as const,
      matchScore: 91,
      matchedFeatures: ["red wall", "blue roof", "platform edge"],
      missingOrUnverifiedFeatures: [],
      mapLinks: {
        ...successfulInvestigation.candidates[0].mapLinks,
        googleMaps: "https://maps.example.test/?q=36.3333,140.4444"
      },
      mapPreview: {
        ...successfulInvestigation.candidates[0].mapPreview,
        googleMapsEmbedUrl: "https://maps.example.test/embed?q=36.3333,140.4444&t=k",
        googleEarthWebUrl: "https://earth.example.test/search/36.3333,140.4444",
        notes: ["Check high score site in Earth"]
      }
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ...successfulInvestigation,
        candidates: [lowerScoreCandidate, higherScoreCandidate]
      })
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(await screen.findAllByText("36.33330, 140.44440")).not.toHaveLength(0);
    openAdvancedDetails();
    const candidateHeadings = screen.getAllByText(/候选 \d：/);
    expect(candidateHeadings[0]).toHaveTextContent("候选 1：Higher score location");
    expect(candidateHeadings[1]).toHaveTextContent("候选 2：Lower score location");
    expect(screen.queryByText("候选位置对比")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "匹配分数" })).not.toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "91.0" })).not.toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "red wall、blue roof" })).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("当前候选")).getByText("36.33330, 140.44440")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "地图核验" }));
    const distributionMap = screen.getByLabelText("证据画布候选分布地图");
    expect(within(distributionMap).getByRole("button", { name: "查看候选 1 Higher score location" })).toHaveTextContent("1");
    expect(within(distributionMap).getByRole("button", { name: "查看候选 2 Lower score location" })).toHaveTextContent("2");
    expect(within(distributionMap).getByRole("button", { name: "查看候选 1 Higher score location" })).toHaveClass("selected");

    expect(screen.queryByRole("button", { name: "确认 Higher score location" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保留 Higher score location" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "排除 Higher score location" })).not.toBeInTheDocument();

    fireEvent.click(within(distributionMap).getByRole("button", { name: "查看候选 2 Lower score location" }));
    expect(within(distributionMap).getByRole("button", { name: "查看候选 2 Lower score location" })).toHaveClass("selected");
    expect(screen.getByText("当前候选（排名 2）")).toBeInTheDocument();
    expect(within(screen.getByLabelText("当前候选")).getByText("35.11110, 139.22220")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "卫星图" }));
    expect(screen.getByTitle("证据画布当前候选卫星地图")).toHaveAttribute(
      "src",
      "https://maps.example.test/embed?q=35.1111,139.2222&t=k"
    );
    expect(
      screen
        .getAllByRole("link", { name: "打开 Earth" })
        .some((link) => link.getAttribute("href") === "https://earth.example.test/search/35.1111,139.2222")
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "确认 Lower score location" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保留 Lower score location" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "排除 Lower score location" })).not.toBeInTheDocument();
  });

  it("limits low-confidence candidates according to saved display settings", async () => {
    localStorage.setItem(
      "imageGeoFinder.settings",
      JSON.stringify({
        outputLanguage: "zh-CN",
        visionProfiles: [
          {
            id: "default-profile",
            name: "默认配置",
            config: {
              apiKey: "saved-api-key",
              model: "vision-model",
              showLowConfidenceCandidates: true,
              maxLowConfidenceCandidates: 2
            }
          }
        ],
        activeVisionProfileId: "default-profile"
      })
    );
    const highCandidate = {
      ...successfulInvestigation.candidates[0],
      id: "candidate-high-visible",
      name: "High confidence anchor",
      confidence: "high" as const,
      matchScore: 88
    };
    const lowCandidateA = {
      ...successfulInvestigation.candidates[0],
      id: "candidate-low-a",
      name: "Low confidence A",
      latitude: 35.101,
      longitude: 139.201,
      confidence: "low" as const,
      matchScore: 52
    };
    const lowCandidateB = {
      ...successfulInvestigation.candidates[0],
      id: "candidate-low-b",
      name: "Low confidence B",
      latitude: 35.102,
      longitude: 139.202,
      confidence: "low" as const,
      matchScore: 45
    };
    const lowCandidateC = {
      ...successfulInvestigation.candidates[0],
      id: "candidate-low-c",
      name: "Low confidence C hidden",
      latitude: 35.103,
      longitude: 139.203,
      confidence: "low" as const,
      matchScore: 31
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ...successfulInvestigation,
        candidates: [lowCandidateC, lowCandidateB, highCandidate, lowCandidateA]
      })
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    const candidateRanking = screen.getByLabelText("候选排行");
    expect(await within(candidateRanking).findByRole("button", { name: "查看候选 1 High confidence anchor" })).toBeInTheDocument();
    expect(within(candidateRanking).getByRole("button", { name: "查看候选 2 Low confidence A" })).toBeInTheDocument();
    expect(within(candidateRanking).getByRole("button", { name: "查看候选 3 Low confidence B" })).toBeInTheDocument();
    expect(screen.queryByText("Low confidence C hidden")).not.toBeInTheDocument();
    expect(screen.getByText("已按设置隐藏 1 个低置信候选。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "地图核验" }));
    const distributionMap = screen.getByLabelText("证据画布候选分布地图");
    expect(within(distributionMap).getByRole("button", { name: "查看候选 1 High confidence anchor" })).toBeInTheDocument();
    expect(within(distributionMap).getByRole("button", { name: "查看候选 2 Low confidence A" })).toBeInTheDocument();
    expect(within(distributionMap).getByRole("button", { name: "查看候选 3 Low confidence B" })).toBeInTheDocument();
    expect(within(distributionMap).queryByRole("button", { name: "查看候选 4 Low confidence C hidden" })).not.toBeInTheDocument();
    openAdvancedDetails();
    expect(screen.getByText("候选 1：High confidence anchor")).toBeInTheDocument();
    expect(screen.getByText("候选 2：Low confidence A")).toBeInTheDocument();
    expect(screen.getByText("候选 3：Low confidence B")).toBeInTheDocument();
    expect(screen.queryByText("候选 4：Low confidence C hidden")).not.toBeInTheDocument();
  });

  it("can hide all low-confidence candidates from the visible workbench", async () => {
    localStorage.setItem(
      "imageGeoFinder.settings",
      JSON.stringify({
        outputLanguage: "zh-CN",
        visionProfiles: [
          {
            id: "default-profile",
            name: "默认配置",
            config: {
              apiKey: "saved-api-key",
              model: "vision-model",
              showLowConfidenceCandidates: false,
              maxLowConfidenceCandidates: 5
            }
          }
        ],
        activeVisionProfileId: "default-profile"
      })
    );
    const mediumCandidate = {
      ...successfulInvestigation.candidates[0],
      id: "candidate-medium-visible",
      name: "Medium confidence visible",
      confidence: "medium" as const,
      matchScore: 61
    };
    const lowCandidate = {
      ...successfulInvestigation.candidates[0],
      id: "candidate-low-hidden",
      name: "Low confidence hidden",
      confidence: "low" as const,
      matchScore: 43
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ...successfulInvestigation,
        candidates: [lowCandidate, mediumCandidate]
      })
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    const candidateRanking = screen.getByLabelText("候选排行");
    expect(await within(candidateRanking).findByRole("button", { name: "查看候选 1 Medium confidence visible" })).toBeInTheDocument();
    expect(screen.queryByText("Low confidence hidden")).not.toBeInTheDocument();
    expect(screen.getByText("已按设置隐藏 1 个低置信候选。")).toBeInTheDocument();
    openSettings();
    expect(screen.getByLabelText("展示低置信候选")).not.toBeChecked();
  });

  it("does not show stale coordinates when the investigation has no verified candidates", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ...successfulInvestigation,
        candidates: [],
        report: {
          ...successfulInvestigation.report,
          summaryMarkdown: "尚未生成候选坐标。",
          fullMarkdown: "尚未生成候选坐标。"
        }
      })
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "different-frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(await screen.findByText("尚未生成候选坐标")).toBeInTheDocument();
    openAdvancedDetails();
    expect(screen.getByText("地图与 Earth 核验入口")).toBeInTheDocument();
    expect(screen.getByText("当前候选")).toBeInTheDocument();
    expect(screen.queryByText("当前候选（排名 0）")).not.toBeInTheDocument();
    expect(screen.getByText("尚无候选坐标，无法加载地图核验。")).toBeInTheDocument();
    expect(screen.getByText("候选坐标生成后会显示地图核验标签、Google Maps 与 Google Earth 外部入口。")).toBeInTheDocument();
    expect(screen.queryByText("42.25967, 112.75623")).not.toBeInTheDocument();
    expect(screen.queryByText("35.68950, 139.69170")).not.toBeInTheDocument();
  });

  it("clears the previous candidate coordinates when a different image is selected", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(await screen.findAllByText("35.68950, 139.69170")).not.toHaveLength(0);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["new-image-bytes"], "new-frame.jpg", { type: "image/jpeg" })] }
    });

    expect(screen.getByRole("heading", { name: "等待分析" })).toBeInTheDocument();
    expect(screen.queryByText("35.68950, 139.69170")).not.toBeInTheDocument();
    expect(localStorage.getItem("imageGeoFinder.latestInvestigation")).toBeNull();
  });

  it("copies candidate coordinates from the evidence card", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    const copyButton = await screen.findByRole("button", { name: "复制坐标" });
    fireEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("35.68950, 139.69170"));
  });

  it("copies source traceback search queries from the candidate workbench", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    const copyQueryButton = await screen.findByRole("button", { name: "复制查询 Tokyo JR rail platform" });
    fireEvent.click(copyQueryButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Tokyo JR rail platform"));
    expect(copyQueryButton).toHaveTextContent("已复制");
  });

  it("lets the user mark feature correspondences and persists the review state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    const primaryEvidenceBoard = within(await screen.findByLabelText("调查面板")).getByLabelText("当前候选证据对照");
    const featureRow = within(primaryEvidenceBoard).getByLabelText("证据对应 1");
    fireEvent.click(within(featureRow).getByRole("button", { name: "标记为不匹配" }));

    expect(within(featureRow).getByText("不匹配")).toBeInTheDocument();
    expect(within(featureRow).getByRole("button", { name: "标记为不匹配" })).toHaveAttribute("aria-pressed", "true");
    const saved = JSON.parse(localStorage.getItem("imageGeoFinder.latestInvestigation") ?? "{}") as { investigation?: Investigation };
    expect(saved.investigation?.candidates[0].featureMatches?.[0].status).toBe("mismatch");
  });

  it("refreshes the Markdown report after manual feature review", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    const investigationRail = await screen.findByLabelText("调查面板");
    const verdictPanel = within(investigationRail).getByLabelText("当前候选人工结论");
    fireEvent.change(within(verdictPanel).getByLabelText("人工结论理由"), {
      target: { value: "道路边界与原图相反，排除此候选。" }
    });
    fireEvent.click(within(verdictPanel).getByRole("button", { name: "排除候选" }));

    openAdvancedDetails();
    fireEvent.click(screen.getByText("完整 Markdown 报告"));
    const reportBlock = screen.getByText((content, element) => element?.tagName.toLowerCase() === "pre" && content.includes("人工结论：已排除"));
    expect(reportBlock).toHaveTextContent("人工结论：已排除");
    expect(reportBlock).toHaveTextContent("人工结论理由：道路边界与原图相反，排除此候选。");
    const saved = JSON.parse(localStorage.getItem("imageGeoFinder.latestInvestigation") ?? "{}") as { investigation?: Investigation };
    expect(saved.investigation?.report.fullMarkdown).toContain("人工结论：已排除");
    expect(saved.investigation?.report.fullMarkdown).toContain("人工结论理由：道路边界与原图相反，排除此候选。");
  });

  it("lets the user add a manual image-to-map evidence correspondence and persists it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    const evidenceBoard = within(await screen.findByLabelText("调查面板")).getByLabelText("当前候选证据对照");
    fireEvent.change(within(evidenceBoard).getByLabelText("新增原图特征"), {
      target: { value: "原图左上角蓝色屋顶贴着操场弯道" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("新增地图或 Earth 对应"), {
      target: { value: "Google Earth 候选点西北角蓝屋顶和椭圆跑道相邻" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("新增核验依据"), {
      target: { value: "在 Earth 历史影像中核对屋顶颜色、跑道弯道和入口道路三点关系。" }
    });
    fireEvent.click(within(evidenceBoard).getByRole("button", { name: "添加证据对应" }));

    const addedRow = within(evidenceBoard).getByLabelText("证据对应 3");
    expect(within(addedRow).getByText("原图左上角蓝色屋顶贴着操场弯道")).toBeInTheDocument();
    expect(within(addedRow).getByText("Google Earth 候选点西北角蓝屋顶和椭圆跑道相邻")).toBeInTheDocument();
    expect(within(addedRow).getByText("在 Earth 历史影像中核对屋顶颜色、跑道弯道和入口道路三点关系。")).toBeInTheDocument();
    expect(within(addedRow).getByText("待核验")).toBeInTheDocument();

    const saved = JSON.parse(localStorage.getItem("imageGeoFinder.latestInvestigation") ?? "{}") as { investigation?: Investigation };
    expect(saved.investigation?.candidates[0].featureMatches?.[2]).toEqual({
      imageFeature: "原图左上角蓝色屋顶贴着操场弯道",
      mapFeature: "Google Earth 候选点西北角蓝屋顶和椭圆跑道相邻",
      verification: "在 Earth 历史影像中核对屋顶颜色、跑道弯道和入口道路三点关系。",
      status: "unverified"
    });
  });

  it("lets the user attach map evidence source details to a manual correspondence", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    const evidenceBoard = within(await screen.findByLabelText("调查面板")).getByLabelText("当前候选证据对照");
    fireEvent.change(within(evidenceBoard).getByLabelText("新增原图特征"), {
      target: { value: "原图停车场入口与蓝顶建筑呈 L 形" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("新增地图或 Earth 对应"), {
      target: { value: "Google Earth 候选点东侧蓝顶建筑贴着停车场入口" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("新增核验依据"), {
      target: { value: "打开 Earth 历史影像，按入口道路、蓝顶建筑、停车场边界三点核验。" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("核验链接（Google Maps/Earth）"), {
      target: { value: "https://earth.google.com/web/search/35.6895,139.6917" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("地图/Earth 截图或来源"), {
      target: { value: "earth-candidate-1-2024-04.png" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("地图/Earth 影像日期"), {
      target: { value: "2024-04" }
    });
    fireEvent.click(within(evidenceBoard).getByRole("button", { name: "添加证据对应" }));

    const addedRow = within(evidenceBoard).getByLabelText("证据对应 3");
    expect(within(addedRow).getByText("https://earth.google.com/web/search/35.6895,139.6917")).toBeInTheDocument();
    expect(within(addedRow).getByText("earth-candidate-1-2024-04.png")).toBeInTheDocument();
    expect(within(addedRow).getByText("2024-04")).toBeInTheDocument();

    openAdvancedDetails();
    fireEvent.click(screen.getByText("完整 Markdown 报告"));
    const reportBlock = screen.getByText((content, element) => element?.tagName.toLowerCase() === "pre" && content.includes("原图停车场入口与蓝顶建筑呈 L 形"));
    expect(reportBlock).toHaveTextContent("核验链接：https://earth.google.com/web/search/35.6895,139.6917");
    expect(reportBlock).toHaveTextContent("地图/Earth 截图：earth-candidate-1-2024-04.png");
    expect(reportBlock).toHaveTextContent("地图/Earth 影像日期：2024-04");

    const saved = JSON.parse(localStorage.getItem("imageGeoFinder.latestInvestigation") ?? "{}") as { investigation?: Investigation };
    expect(saved.investigation?.candidates[0].featureMatches?.[2]).toEqual({
      imageFeature: "原图停车场入口与蓝顶建筑呈 L 形",
      mapFeature: "Google Earth 候选点东侧蓝顶建筑贴着停车场入口",
      verification: "打开 Earth 历史影像，按入口道路、蓝顶建筑、停车场边界三点核验。",
      evidenceLink: "https://earth.google.com/web/search/35.6895,139.6917",
      mapScreenshotUrl: "earth-candidate-1-2024-04.png",
      earthImageDate: "2024-04",
      status: "unverified"
    });
  });

  it("lets the user attach original and map annotation notes to a manual correspondence", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    const evidenceBoard = within(await screen.findByLabelText("调查面板")).getByLabelText("当前候选证据对照");
    fireEvent.change(within(evidenceBoard).getByLabelText("新增原图特征"), {
      target: { value: "原图右侧白色围墙与门口道路交汇" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("新增地图或 Earth 对应"), {
      target: { value: "Earth 截图中白色围墙与候选点入口道路交汇" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("新增核验依据"), {
      target: { value: "对比围墙转角、入口道路方向和旁边蓝顶建筑。" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("原图标注说明"), {
      target: { value: "红圈圈住右侧围墙转角，蓝线沿入口道路方向。" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("地图/Earth 标注说明"), {
      target: { value: "Earth 截图红圈圈住同一围墙转角，蓝线沿候选点入口道路。" }
    });
    fireEvent.click(within(evidenceBoard).getByRole("button", { name: "添加证据对应" }));

    const addedRow = within(evidenceBoard).getByLabelText("证据对应 3");
    expect(within(addedRow).getByText("红圈圈住右侧围墙转角，蓝线沿入口道路方向。")).toBeInTheDocument();
    expect(within(addedRow).getByText("Earth 截图红圈圈住同一围墙转角，蓝线沿候选点入口道路。")).toBeInTheDocument();

    openAdvancedDetails();
    fireEvent.click(screen.getByText("完整 Markdown 报告"));
    const reportBlock = screen.getByText((content, element) => element?.tagName.toLowerCase() === "pre" && content.includes("原图右侧白色围墙与门口道路交汇"));
    expect(reportBlock).toHaveTextContent("原图标注说明：红圈圈住右侧围墙转角，蓝线沿入口道路方向。");
    expect(reportBlock).toHaveTextContent("地图/Earth 标注说明：Earth 截图红圈圈住同一围墙转角，蓝线沿候选点入口道路。");

    const saved = JSON.parse(localStorage.getItem("imageGeoFinder.latestInvestigation") ?? "{}") as { investigation?: Investigation };
    expect(saved.investigation?.candidates[0].featureMatches?.[2]).toEqual({
      imageFeature: "原图右侧白色围墙与门口道路交汇",
      mapFeature: "Earth 截图中白色围墙与候选点入口道路交汇",
      verification: "对比围墙转角、入口道路方向和旁边蓝顶建筑。",
      imageAnnotation: "红圈圈住右侧围墙转角，蓝线沿入口道路方向。",
      mapAnnotation: "Earth 截图红圈圈住同一围墙转角，蓝线沿候选点入口道路。",
      status: "unverified"
    });
  });

  it("lets the user attach AI verification to an image-to-map evidence correspondence", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    const evidenceBoard = within(await screen.findByLabelText("调查面板")).getByLabelText("当前候选证据对照");
    fireEvent.change(within(evidenceBoard).getByLabelText("新增原图特征"), {
      target: { value: "原图左侧蓝顶建筑和跑道弯道相邻" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("新增地图或 Earth 对应"), {
      target: { value: "Earth 截图里蓝顶建筑和椭圆跑道弯道相邻" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("新增核验依据"), {
      target: { value: "对比蓝顶建筑、椭圆跑道弧线和入口道路三点关系。" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("AI 核验结论"), {
      target: { value: "supports" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("AI 核验置信度"), {
      target: { value: "high" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("AI 核验理由"), {
      target: { value: "原图与 Earth 截图中的蓝顶建筑、跑道弧线和入口道路相对位置一致。" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("AI 核验模型"), {
      target: { value: "geo-vision-v2" }
    });
    fireEvent.click(within(evidenceBoard).getByRole("button", { name: "添加证据对应" }));

    const addedRow = within(evidenceBoard).getByLabelText("证据对应 3");
    expect(within(addedRow).getByText("AI 核验：支持")).toBeInTheDocument();
    expect(within(addedRow).getByText("置信度：高置信")).toBeInTheDocument();
    expect(within(addedRow).getByText("原图与 Earth 截图中的蓝顶建筑、跑道弧线和入口道路相对位置一致。")).toBeInTheDocument();
    expect(within(addedRow).getByText("geo-vision-v2")).toBeInTheDocument();

    openAdvancedDetails();
    fireEvent.click(screen.getByText("完整 Markdown 报告"));
    const reportBlock = screen.getByText((content, element) => element?.tagName.toLowerCase() === "pre" && content.includes("原图左侧蓝顶建筑和跑道弯道相邻"));
    expect(reportBlock).toHaveTextContent("AI 核验：支持");
    expect(reportBlock).toHaveTextContent("AI 核验置信度：高置信");
    expect(reportBlock).toHaveTextContent("AI 核验理由：原图与 Earth 截图中的蓝顶建筑、跑道弧线和入口道路相对位置一致。");
    expect(reportBlock).toHaveTextContent("AI 核验模型：geo-vision-v2");

    const saved = JSON.parse(localStorage.getItem("imageGeoFinder.latestInvestigation") ?? "{}") as { investigation?: Investigation };
    expect(saved.investigation?.candidates[0].featureMatches?.[2].aiVerification).toEqual({
      status: "supports",
      confidence: "high",
      rationale: "原图与 Earth 截图中的蓝顶建筑、跑道弧线和入口道路相对位置一致。",
      model: "geo-vision-v2"
    });
  });

  it("lets the user attach a map screenshot image to a manual correspondence", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    const evidenceBoard = within(await screen.findByLabelText("调查面板")).getByLabelText("当前候选证据对照");
    fireEvent.change(within(evidenceBoard).getByLabelText("新增原图特征"), {
      target: { value: "原图左侧蓝顶建筑和跑道弯道相邻" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("新增地图或 Earth 对应"), {
      target: { value: "Earth 截图里蓝顶建筑和椭圆跑道弯道相邻" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("新增核验依据"), {
      target: { value: "用截图附件核对蓝顶建筑、跑道弯道和入口道路三点关系。" }
    });
    fireEvent.change(within(evidenceBoard).getByLabelText("地图/Earth 截图附件"), {
      target: { files: [new File(["earth-screenshot-bytes"], "earth-blue-roof.png", { type: "image/png" })] }
    });

    const preview = await within(evidenceBoard).findByAltText("待添加地图/Earth 截图附件");
    expect(preview).toHaveAttribute("src", expect.stringMatching(/^data:image\/png;base64,/));

    fireEvent.click(within(evidenceBoard).getByRole("button", { name: "添加证据对应" }));

    const addedRow = within(evidenceBoard).getByLabelText("证据对应 3");
    const thumbnail = within(addedRow).getByAltText("证据对应 3 地图/Earth 截图附件");
    expect(thumbnail).toHaveAttribute("src", expect.stringMatching(/^data:image\/png;base64,/));
    expect(within(addedRow).getByText("earth-blue-roof.png")).toBeInTheDocument();

    openAdvancedDetails();
    fireEvent.click(screen.getByText("完整 Markdown 报告"));
    const reportBlock = screen.getByText((content, element) => element?.tagName.toLowerCase() === "pre" && content.includes("原图左侧蓝顶建筑和跑道弯道相邻"));
    expect(reportBlock).toHaveTextContent("地图/Earth 截图附件：earth-blue-roof.png");

    const saved = JSON.parse(localStorage.getItem("imageGeoFinder.latestInvestigation") ?? "{}") as { investigation?: Investigation };
    const savedFeature = saved.investigation?.candidates[0].featureMatches?.[2];
    expect(savedFeature?.mapScreenshotAttachment?.name).toBe("earth-blue-roof.png");
    expect(savedFeature?.mapScreenshotAttachment?.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("lets the user set a candidate verdict with rationale and persists it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    fireEvent.change(screen.getByLabelText("上传图片"), {
      target: { files: [new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" })] }
    });
    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    const investigationRail = await screen.findByLabelText("调查面板");
    const verdictPanel = within(investigationRail).getByLabelText("当前候选人工结论");
    fireEvent.change(within(verdictPanel).getByLabelText("人工结论理由"), {
      target: { value: "道路边界与原图相反，排除此候选。" }
    });
    fireEvent.click(within(verdictPanel).getByRole("button", { name: "排除候选" }));

    expect(within(verdictPanel).getByText("人工结论：已排除")).toBeInTheDocument();
    expect(within(verdictPanel).getByRole("button", { name: "排除候选" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByLabelText("候选排行")).getByRole("button", { name: "查看候选 1 35.68950, 139.69170 已排除" })).toBeInTheDocument();
    expect(within(verdictPanel).getByText("道路边界与原图相反，排除此候选。", { selector: "p" })).toBeInTheDocument();

    const saved = JSON.parse(localStorage.getItem("imageGeoFinder.latestInvestigation") ?? "{}") as { investigation?: Investigation };
    expect(saved.investigation?.candidates[0].manualVerdict).toEqual({
      status: "excluded",
      rationale: "道路边界与原图相反，排除此候选。"
    });
  });

  it("keeps crop controls out of the sidebar", () => {
    render(<App />);

    expect(screen.queryByLabelText("分析区域")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "手动框选（后续增强）" })).not.toBeInTheDocument();
  });
});
