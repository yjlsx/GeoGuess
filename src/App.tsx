import { useState } from "react";
import { CandidateResults } from "./components/CandidateResults";
import { ImageInput } from "./components/ImageInput";
import { ManualCluesForm } from "./components/ManualCluesForm";
import { ScopeForm } from "./components/ScopeForm";
import { buildReports } from "./shared/reportGenerator";
import { sampleInvestigationInput } from "./shared/sampleInvestigation";
import type { CropMode, ExtractedClues, Investigation, OutputLanguage, UserScope } from "./shared/types";

const emptyClues: ExtractedClues = {
  ocrText: [],
  visibleLabels: [],
  languages: [],
  sceneFeatures: [],
  spatialRelationships: [],
  inferredSearchTerms: []
};

function buildSampleInvestigation(outputLanguage: OutputLanguage): Investigation {
  const reportInput = {
    ...sampleInvestigationInput,
    outputLanguage
  };

  return {
    id: "sample-investigation",
    outputLanguage,
    image: {
      originalPath: "local://sample-image",
      cropMode: "full"
    },
    userScope: sampleInvestigationInput.userScope,
    extractedClues: sampleInvestigationInput.extractedClues,
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
  const [file, setFile] = useState<File | null>(null);
  const [cropMode, setCropMode] = useState<CropMode>("full");
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>("zh-CN");
  const [scope, setScope] = useState<UserScope>({});
  const [manualClues, setManualClues] = useState<ExtractedClues>(emptyClues);
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      if (!file) {
        throw new Error("请先上传图片。");
      }
      const formData = new FormData();
      formData.append("image", file);
      formData.append("cropMode", cropMode);
      formData.append("outputLanguage", outputLanguage);
      for (const [key, value] of Object.entries(scope)) {
        if (typeof value === "string" && value) {
          formData.append(key, value);
        }
      }
      formData.append("manualClues", JSON.stringify(manualClues));
      const response = await fetch("/api/investigations", { method: "POST", body: formData });
      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response));
      }
      setInvestigation((await response.json()) as Investigation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "分析失败");
    } finally {
      setLoading(false);
    }
  }

  function showSampleInvestigation() {
    setError(null);
    setInvestigation(buildSampleInvestigation(outputLanguage));
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Image Geo Finder</h1>
        <p>上传截图，自动整理线索，生成候选证据链、卫星图像预览和 Google Earth 核验清单。</p>
      </header>
      <div className="workspace">
        <div className="input-column">
          <ImageInput file={file} cropMode={cropMode} onFileChange={setFile} onCropModeChange={setCropMode} />
          <section className="panel">
            <h2>输出设置</h2>
            <label className="field">
              输出语言
              <select value={outputLanguage} onChange={(event) => setOutputLanguage(event.target.value as OutputLanguage)}>
                <option value="zh-CN">中文</option>
                <option value="en-US">English</option>
              </select>
            </label>
          </section>
          <ScopeForm value={scope} onChange={setScope} />
          <ManualCluesForm value={manualClues} onChange={setManualClues} />
          <button className="primary-button" onClick={analyze} disabled={loading}>
            开始分析
          </button>
        </div>
        <CandidateResults
          investigation={investigation}
          loading={loading}
          error={error}
          onShowSample={showSampleInvestigation}
        />
      </div>
    </main>
  );
}
