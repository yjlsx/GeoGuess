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
  fireEvent.click(screen.getByRole("button", { name: "设置" }));
}

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("renders the investigation workspace", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "GeoVerify OSINT" })).toBeInTheDocument();
    expect(screen.getByText("地理位置验证工作台")).toBeInTheDocument();
    expect(screen.getByText("模型状态")).toBeInTheDocument();
    expect(screen.getByText("分析状态")).toBeInTheDocument();
    expect(screen.getByText("候选结果")).toBeInTheDocument();
    expect(screen.getByText("开始时间")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    openSettings();
    expect(screen.getByRole("heading", { name: "配置" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "视觉模型" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存配置" })).toBeInTheDocument();
    expect(screen.getByText("自动识别 OCR / 地物 / 设施 / 空间关系")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("区域范围"), { target: { value: "country" } });
    expect(screen.getByLabelText("国家/地区")).toBeInTheDocument();
    expect(screen.getByLabelText("视觉模型 API Key")).toBeInTheDocument();
    expect(screen.queryByLabelText("视觉模型 Base URL")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("OCR 文字")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("可见标识")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("地物特征")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("空间关系")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("搜索词")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始分析" })).toBeInTheDocument();
  });

  it("defaults to analyzing the uploaded image as-is", () => {
    render(<App />);

    expect(screen.queryByLabelText("分析区域")).not.toBeInTheDocument();
    openSettings();
    expect(screen.getByLabelText("输出语言")).toHaveValue("zh-CN");
    expect(screen.getByText("可上传多张连续截图或一小段视频，系统会合并可见地物、站台、建筑、道路和视角线索。")).toBeInTheDocument();
  });

  it("saves and restores non-secret model configuration locally without a custom base URL", () => {
    const { unmount } = render(<App />);

    openSettings();
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "saved-api-key" } });
    fireEvent.change(screen.getByLabelText("视觉模型名称"), { target: { value: "vision-model" } });
    fireEvent.change(screen.getByLabelText("输出语言"), { target: { value: "en-US" } });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    expect(screen.getByText("配置已保存到本机浏览器；API Key 仅用于本次会话，不会持久保存。")).toBeInTheDocument();
    expect(localStorage.getItem("imageGeoFinder.settings")).not.toContain("saved-api-key");
    expect(localStorage.getItem("imageGeoFinder.settings")).not.toContain("baseUrl");
    unmount();
    render(<App />);
    openSettings();

    expect(screen.getByLabelText("视觉模型 API Key")).toHaveValue("");
    expect(screen.queryByLabelText("视觉模型 Base URL")).not.toBeInTheDocument();
    expect(screen.getByLabelText("视觉模型名称")).toHaveValue("vision-model");
    expect(screen.getByLabelText("输出语言")).toHaveValue("en-US");
  });

  it("ignores a stale saved custom base URL", () => {
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

    expect(screen.queryByLabelText("视觉模型 Base URL")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
    expect(localStorage.getItem("imageGeoFinder.settings")).not.toContain("baseUrl");
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
    fireEvent.click(screen.getByRole("button", { name: "获取模型列表" }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith("/api/models", expect.any(Object)));
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      apiKey: "test-api-key"
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

  it("renders the sample evidence chain without uploading an image", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "查看示例证据链" }));

    expect(await screen.findAllByText("42.25967, 112.75623")).not.toHaveLength(0);
    expect(screen.getByText("自动识别线索")).toBeInTheDocument();
    expect(screen.getByText("Google Maps 卫星图像预览")).toBeInTheDocument();
    expect(screen.getByText("打开 Google Earth")).toBeInTheDocument();
    expect(screen.getByText("外部 OSINT 核验入口")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OpenRailwayMap nearby" })).toHaveAttribute(
      "href",
      "https://www.openrailwaymap.org/?style=standard&lat=42.25967&lon=112.75623&zoom=16"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restores the latest investigation after a reload-like remount", async () => {
    const { unmount } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "查看示例证据链" }));
    expect(await screen.findAllByText("42.25967, 112.75623")).not.toHaveLength(0);

    unmount();
    render(<App />);

    expect(screen.getByText("分析完成 100%")).toBeInTheDocument();
    expect(screen.getAllByText("42.25967, 112.75623")).not.toHaveLength(0);
    expect(screen.getByText("候选位置分布")).toBeInTheDocument();
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
    openSettings();
    fireEvent.change(screen.getByLabelText("输出语言"), { target: { value: "en-US" } });
    fireEvent.change(screen.getByLabelText("区域范围"), { target: { value: "country" } });
    fireEvent.change(screen.getByLabelText("国家/地区"), { target: { value: "Japan" } });
    fireEvent.change(screen.getByLabelText("省/州/城市（可选）"), { target: { value: "Tokyo" } });
    fireEvent.change(screen.getByLabelText("设施类型"), { target: { value: "rail station" } });
    fireEvent.change(screen.getByLabelText("来源"), { target: { value: "video frame" } });
    fireEvent.change(screen.getByLabelText("时间提示"), { target: { value: "night" } });
    fireEvent.change(screen.getByLabelText("备注"), { target: { value: "near a river" } });
    fireEvent.change(screen.getByLabelText("视觉模型 API Key"), { target: { value: "test-api-key" } });
    fireEvent.change(screen.getByLabelText("视觉模型名称"), { target: { value: "vision-model" } });

    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

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
      coordinateSystem: "WGS84 (EPSG:4326)",
      terrainValidation: true
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
    expect(screen.getByText("核验工作台")).toBeInTheDocument();
    expect(screen.getByText("待核验候选（Top 1）")).toBeInTheDocument();
    expect(screen.getAllByText("Earth 截图核验位")).not.toHaveLength(0);
    expect(screen.getByText("当前候选 Earth 入口已生成（待人工核验）")).toBeInTheDocument();
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
    expect(screen.getByText("地图与 Earth 核验")).toBeInTheDocument();
    expect(screen.getByText("外部 OSINT 核验入口")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OpenRailwayMap nearby" })).toHaveAttribute(
      "href",
      "https://www.openrailwaymap.org/?style=standard&lat=35.68950&lon=139.69170&zoom=16"
    );
    expect(screen.getByRole("link", { name: "SunCalc shadow check" })).toHaveAttribute(
      "href",
      "https://www.suncalc.org/#/35.68950,139.69170,16"
    );
    const mapFrame = screen.getByTitle("当前候选 Google Maps 卫星图像预览");
    expect(mapFrame).toHaveAttribute("src", "https://maps.example.test/embed?q=35.6895,139.6917&t=k");
    expect(screen.queryByTitle("候选 1 Google Maps 卫星图像预览")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开 Google Earth" })).toHaveAttribute(
      "href",
      "https://earth.example.test/search/35.6895,139.6917"
    );
    fireEvent.click(screen.getByText("查看完整证据链"));
    expect(screen.getByText("JR sign matches")).toBeInTheDocument();
    fireEvent.click(screen.getByText("完整 Markdown 报告"));
    expect(screen.getByText("完整报告：包含证据链")).toBeInTheDocument();
  });

  it("sorts candidates by feature match score and supports manual review states", async () => {
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
    const candidateHeadings = screen.getAllByText(/候选 \d：/);
    expect(candidateHeadings[0]).toHaveTextContent("候选 1：Higher score location");
    expect(candidateHeadings[1]).toHaveTextContent("候选 2：Lower score location");
    expect(screen.getByRole("cell", { name: "91" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "red wall、blue roof" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("当前候选")).getByText("36.33330, 140.44440")).toBeInTheDocument();
    expect(screen.getByTitle("当前候选 Google Maps 卫星图像预览")).toHaveAttribute(
      "src",
      "https://maps.example.test/embed?q=36.3333,140.4444&t=k"
    );
    const distributionMap = screen.getByLabelText("候选位置分布地图");
    expect(within(distributionMap).getByRole("button", { name: "查看候选 1 Higher score location" })).toHaveTextContent("1");
    expect(within(distributionMap).getByRole("button", { name: "查看候选 2 Lower score location" })).toHaveTextContent("2");
    expect(within(distributionMap).getByRole("button", { name: "查看候选 1 Higher score location" })).toHaveClass("selected");

    const highCandidateRow = screen.getByRole("row", { name: /Higher score location/ });
    expect(highCandidateRow).toHaveAttribute("aria-selected", "true");
    expect(highCandidateRow).toHaveTextContent("待核验");
    fireEvent.click(screen.getByRole("button", { name: "确认 Higher score location" }));
    await waitFor(() => expect(screen.getByRole("row", { name: /Higher score location/ })).toHaveTextContent("已确认"));

    const lowCandidateRow = screen.getByRole("row", { name: /Lower score location/ });
    fireEvent.click(within(distributionMap).getByRole("button", { name: "查看候选 2 Lower score location" }));
    expect(lowCandidateRow).toHaveAttribute("aria-selected", "true");
    expect(within(distributionMap).getByRole("button", { name: "查看候选 2 Lower score location" })).toHaveClass("selected");
    expect(screen.getByText("当前候选（排名 2）")).toBeInTheDocument();
    expect(within(screen.getByLabelText("当前候选")).getByText("35.11110, 139.22220")).toBeInTheDocument();
    expect(screen.getByTitle("当前候选 Google Maps 卫星图像预览")).toHaveAttribute(
      "src",
      "https://maps.example.test/embed?q=35.1111,139.2222&t=k"
    );
    expect(screen.getByRole("link", { name: "打开 Google Earth" })).toHaveAttribute("href", "https://earth.example.test/search/35.1111,139.2222");

    fireEvent.click(screen.getByRole("button", { name: "排除 Lower score location" }));
    await waitFor(() => expect(lowCandidateRow).toHaveTextContent("已排除"));
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
    expect(screen.getByText("地图与 Earth 核验")).toBeInTheDocument();
    expect(screen.getByText("当前候选")).toBeInTheDocument();
    expect(screen.queryByText("当前候选（排名 0）")).not.toBeInTheDocument();
    expect(screen.getByText("尚无候选坐标，无法加载 Google Maps 卫星预览。")).toBeInTheDocument();
    expect(screen.getByText("尚无候选坐标，无法生成 Google Earth 入口。")).toBeInTheDocument();
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

  it("keeps crop controls out of the sidebar", () => {
    render(<App />);

    expect(screen.queryByLabelText("分析区域")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "手动框选（后续增强）" })).not.toBeInTheDocument();
  });
});
