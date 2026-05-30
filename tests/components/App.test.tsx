import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import type { Investigation } from "../../src/shared/types";

const successfulInvestigation: Investigation = {
  id: "investigation-1",
  image: {
    originalPath: "uploads/image.jpg",
    cropMode: "upper_half"
  },
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
  searchQueries: [],
  candidates: [
    {
      id: "candidate-1",
      latitude: 35.6895,
      longitude: 139.6917,
      confidence: "high",
      mapLinks: {
        googleMaps: "https://maps.example.test/?q=35.6895,139.6917",
        googleEarthHint: "Check platform geometry in Google Earth."
      },
      matchingEvidence: ["JR sign matches"],
      uncertainty: ["Image is cropped"],
      sources: [],
      earthVerificationChecklist: ["Compare tower alignment"]
    }
  ],
  report: {
    summaryMarkdown: "Summary",
    fullMarkdown: "完整报告：包含证据链",
    createdAt: "2026-05-31T00:00:00.000Z"
  }
};

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the investigation workspace", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Image Geo Finder" })).toBeInTheDocument();
    expect(screen.getByLabelText("国家")).toBeInTheDocument();
    expect(screen.getByLabelText("OCR 文字")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始分析" })).toBeInTheDocument();
  });

  it("defaults to analyzing the uploaded image as-is", () => {
    render(<App />);

    expect(screen.getByLabelText("分析区域")).toHaveValue("full");
    expect(screen.getByText("一般上传的是已裁好的上半部分画面，默认按整张图分析。")).toBeInTheDocument();
  });

  it("shows a local error and does not call fetch when no file is selected", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请先上传图片。");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the selected image, crop mode, scope fields, and manual clues", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => successfulInvestigation
    } as Response);
    render(<App />);

    const file = new File(["image-bytes"], "frame.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("上传图片"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("分析区域"), { target: { value: "full" } });
    fireEvent.change(screen.getByLabelText("国家"), { target: { value: "Japan" } });
    fireEvent.change(screen.getByLabelText("地区"), { target: { value: "Tokyo" } });
    fireEvent.change(screen.getByLabelText("设施类型"), { target: { value: "rail station" } });
    fireEvent.change(screen.getByLabelText("来源"), { target: { value: "video frame" } });
    fireEvent.change(screen.getByLabelText("时间提示"), { target: { value: "night" } });
    fireEvent.change(screen.getByLabelText("备注"), { target: { value: "near a river" } });
    fireEvent.change(screen.getByLabelText("OCR 文字"), { target: { value: "Shinjuku" } });
    fireEvent.change(screen.getByLabelText("语言"), { target: { value: "Japanese\nEnglish" } });
    fireEvent.change(screen.getByLabelText("搜索词"), { target: { value: "Tokyo JR rail platform" } });

    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/investigations", expect.any(Object)));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const formData = request.body as FormData;
    expect(request.method).toBe("POST");
    expect(formData.get("image")).toBe(file);
    expect(formData.get("cropMode")).toBe("full");
    expect(formData.get("country")).toBe("Japan");
    expect(formData.get("region")).toBe("Tokyo");
    expect(formData.get("facilityType")).toBe("rail station");
    expect(formData.get("source")).toBe("video frame");
    expect(formData.get("dateOrTimeHint")).toBe("night");
    expect(formData.get("notes")).toBe("near a river");
    expect(JSON.parse(formData.get("manualClues") as string)).toMatchObject({
      ocrText: ["Shinjuku"],
      languages: ["Japanese", "English"],
      inferredSearchTerms: ["Tokyo JR rail platform"]
    });
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
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));

    expect(await screen.findByText("35.68950, 139.69170")).toBeInTheDocument();
    expect(screen.getByText("高置信")).toBeInTheDocument();
    expect(screen.queryByText("high")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("查看证据链和核验清单"));
    expect(screen.getByText("JR sign matches")).toBeInTheDocument();
    fireEvent.click(screen.getByText("完整 Markdown 报告"));
    expect(screen.getByText("完整报告：包含证据链")).toBeInTheDocument();
  });

  it("keeps manual crop selection disabled", () => {
    render(<App />);

    expect(screen.getByRole("option", { name: "手动框选（后续增强）" })).toBeDisabled();
  });
});
