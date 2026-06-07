import { describe, expect, it } from "vitest";
import { sampleInvestigationInput } from "../../src/shared/sampleInvestigation";
import { buildReports } from "../../src/shared/reportGenerator";

describe("buildReports", () => {
  it("creates a concise report with coordinates and uncertainty", () => {
    const report = buildReports(sampleInvestigationInput);
    expect(report.summaryMarkdown).toContain("42.25967, 112.75623");
    expect(report.summaryMarkdown).toContain("高置信");
    expect(report.summaryMarkdown).toContain("卫星影像日期可能与视频日期不同");
    expect(report.summaryMarkdown).toContain("关键证据：");
    expect(report.summaryMarkdown).not.toContain("High confidence");
    expect(report.summaryMarkdown).not.toContain("Key evidence:");
  });

  it("creates a full report with queries, sources, and Google Earth checklist", () => {
    const report = buildReports(sampleInvestigationInput);
    expect(report.fullMarkdown).toContain("# 图片定位候选报告");
    expect(report.fullMarkdown).toContain("不要把候选坐标视为已确认地理位置");
    expect(report.fullMarkdown).toContain("## 提取到的线索");
    expect(report.fullMarkdown).toContain("## 搜索过程");
    expect(report.fullMarkdown).toContain("## 季节与历史影像核验");
    expect(report.fullMarkdown).toContain("Google Maps 卫星图像预览");
    expect(report.fullMarkdown).toContain("铁路在画面前景横向延伸");
    expect(report.fullMarkdown).toContain("复制到 Google Earth 搜索");
    expect(report.fullMarkdown).not.toContain("## Extracted Clues");
  });

  it("formats scope coordinate boxes and empty lists readably", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      userScope: {
        ...sampleInvestigationInput.userScope,
        coordinateBox: {
          minLat: 42,
          minLon: 112,
          maxLat: 43,
          maxLon: 113
        },
        dateOrTimeHint: ""
      },
      extractedClues: {
        ...sampleInvestigationInput.extractedClues,
        ocrText: []
      }
    });

    expect(report.fullMarkdown).toContain("坐标范围：42.00000, 112.00000 到 43.00000, 113.00000");
    expect(report.fullMarkdown).not.toContain("[object Object]");
    expect(report.fullMarkdown).not.toContain("dateOrTimeHint:");
    expect(report.fullMarkdown).toContain("- 未提供");
  });

  it("normalizes reversed coordinate boxes in reports", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      userScope: {
        ...sampleInvestigationInput.userScope,
        coordinateBox: {
          minLat: 43,
          minLon: 113,
          maxLat: 42,
          maxLon: 112
        }
      }
    });

    expect(report.fullMarkdown).toContain("坐标范围：42.00000, 112.00000 到 43.00000, 113.00000");
    expect(report.fullMarkdown).not.toContain("坐标范围：43.00000, 113.00000 到 42.00000, 112.00000");
  });

  it("formats custom polygon scope values for manual boundary review", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      userScope: {
        ...sampleInvestigationInput.userScope,
        regionScope: "custom",
        boundaryMode: "polygon",
        polygonCoordinates: ["41.900000, 111.900000", "42.300000, 112.400000"].join("\n")
      }
    });

    expect(report.fullMarkdown).toContain("区域范围：用户自定义范围");
    expect(report.fullMarkdown).toContain("范围类型：多边形边界");
    expect(report.fullMarkdown).toContain("多边形坐标：顶点 1: 41.900000, 111.900000；顶点 2: 42.300000, 112.400000");
    expect(report.fullMarkdown).not.toContain("区域范围：custom");
    expect(report.fullMarkdown).not.toContain("范围类型：polygon");
  });

  it("can generate an English evidence-chain report when requested", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      outputLanguage: "en-US"
    });

    expect(report.fullMarkdown).toContain("# Image Geolocation Candidate Report");
    expect(report.fullMarkdown).toContain("Do not treat coordinates as confirmed");
    expect(report.fullMarkdown).toContain("## Search Process");
    expect(report.fullMarkdown).toContain("## Season and Historical Imagery Check");
    expect(report.summaryMarkdown).toContain("High confidence");
  });

  it("includes external OSINT verification links when candidates provide them", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      candidates: [
        {
          ...sampleInvestigationInput.candidates[0],
          osintLinks: [
            {
              title: "OpenRailwayMap nearby",
              url: "https://www.openrailwaymap.org/?style=standard&lat=42.25967&lon=112.75623&zoom=16",
              note: "Check railway infrastructure."
            }
          ]
        }
      ]
    });

    expect(report.fullMarkdown).toContain("外部 OSINT 核验入口");
    expect(report.fullMarkdown).toContain("OpenRailwayMap nearby");
    expect(report.fullMarkdown).toContain("https://www.openrailwaymap.org/");
  });

  it("includes structured feature match evidence for manual map comparison", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      candidates: [
        {
          ...sampleInvestigationInput.candidates[0],
          featureMatches: [
            {
              imageFeature: "原图中道路后方可见红色跑道",
              mapFeature: "候选点北侧椭圆操场跑道",
              verification: "在 Google Earth 中对比跑道弧线、入口道路和建筑相对位置。",
              status: "matched"
            },
            {
              imageFeature: "原图里建筑和围墙关系被字幕遮挡",
              mapFeature: "卫星图中疑似围墙和长条建筑",
              verification: "切换历史影像确认建筑是否同一时期存在。",
              status: "partial"
            },
            {
              imageFeature: "原图右侧道路边界与候选点相反",
              mapFeature: "卫星图道路边界出现在左侧",
              verification: "如果旋转地图后仍然相反，应排除此候选。",
              status: "mismatch"
            }
          ]
        }
      ]
    });

    expect(report.fullMarkdown).toContain("证据对照");
    expect(report.fullMarkdown).toContain("原图中道路后方可见红色跑道");
    expect(report.fullMarkdown).toContain("候选点北侧椭圆操场跑道");
    expect(report.fullMarkdown).toContain("已匹配");
    expect(report.fullMarkdown).toContain("切换历史影像确认建筑是否同一时期存在。");
    expect(report.fullMarkdown).toContain("部分匹配");
    expect(report.fullMarkdown).toContain("不匹配");
    expect(report.fullMarkdown).toContain("如果旋转地图后仍然相反，应排除此候选。");
  });

  it("includes map evidence source details for feature correspondences", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      candidates: [
        {
          ...sampleInvestigationInput.candidates[0],
          featureMatches: [
            {
              imageFeature: "原图停车场入口与蓝顶建筑呈 L 形",
              mapFeature: "Google Earth 候选点东侧蓝顶建筑贴着停车场入口",
              verification: "打开 Earth 历史影像，按入口道路、蓝顶建筑、停车场边界三点核验。",
              evidenceLink: "https://earth.google.com/web/search/35.6895,139.6917",
              mapScreenshotUrl: "earth-candidate-1-2024-04.png",
              earthImageDate: "2024-04",
              status: "unverified"
            }
          ]
        }
      ]
    });

    expect(report.fullMarkdown).toContain("核验链接：https://earth.google.com/web/search/35.6895,139.6917");
    expect(report.fullMarkdown).toContain("地图/Earth 截图：earth-candidate-1-2024-04.png");
    expect(report.fullMarkdown).toContain("地图/Earth 影像日期：2024-04");
  });

  it("includes original and map annotation notes for feature correspondences", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      candidates: [
        {
          ...sampleInvestigationInput.candidates[0],
          featureMatches: [
            {
              imageFeature: "原图右侧白色围墙与门口道路交汇",
              mapFeature: "Earth 截图中白色围墙与候选点入口道路交汇",
              verification: "对比围墙转角、入口道路方向和旁边蓝顶建筑。",
              imageAnnotation: "红圈圈住右侧围墙转角，蓝线沿入口道路方向。",
              mapAnnotation: "Earth 截图红圈圈住同一围墙转角，蓝线沿候选点入口道路。",
              status: "unverified"
            }
          ]
        }
      ]
    });

    expect(report.fullMarkdown).toContain("原图标注说明：红圈圈住右侧围墙转角，蓝线沿入口道路方向。");
    expect(report.fullMarkdown).toContain("地图/Earth 标注说明：Earth 截图红圈圈住同一围墙转角，蓝线沿候选点入口道路。");
  });

  it("includes map screenshot attachments for feature correspondences", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      candidates: [
        {
          ...sampleInvestigationInput.candidates[0],
          featureMatches: [
            {
              imageFeature: "原图左侧蓝顶建筑和跑道弯道相邻",
              mapFeature: "Earth 截图里蓝顶建筑和椭圆跑道弯道相邻",
              verification: "用截图附件核对蓝顶建筑、跑道弯道和入口道路三点关系。",
              mapScreenshotAttachment: {
                name: "earth-blue-roof.png",
                dataUrl: "data:image/png;base64,ZXhhbXBsZQ==",
                mediaType: "image/png"
              },
              status: "unverified"
            }
          ]
        }
      ]
    });

    expect(report.fullMarkdown).toContain("地图/Earth 截图附件：earth-blue-roof.png");
  });

  it("includes AI verification results for feature correspondences", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      candidates: [
        {
          ...sampleInvestigationInput.candidates[0],
          featureMatches: [
            {
              imageFeature: "原图左侧蓝顶建筑和跑道弯道相邻",
              mapFeature: "Earth 截图里蓝顶建筑和椭圆跑道弯道相邻",
              verification: "用截图附件核对蓝顶建筑、跑道弯道和入口道路三点关系。",
              aiVerification: {
                status: "supports",
                confidence: "high",
                rationale: "原图与 Earth 截图中的蓝顶建筑、跑道弧线和入口道路相对位置一致。",
                model: "geo-vision-v2",
                checkedAt: "2026-06-07T15:00:00.000Z"
              },
              status: "unverified"
            }
          ]
        }
      ]
    });

    expect(report.fullMarkdown).toContain("AI 核验：支持");
    expect(report.fullMarkdown).toContain("AI 核验置信度：高置信");
    expect(report.fullMarkdown).toContain("AI 核验理由：原图与 Earth 截图中的蓝顶建筑、跑道弧线和入口道路相对位置一致。");
    expect(report.fullMarkdown).toContain("AI 核验模型：geo-vision-v2");
    expect(report.fullMarkdown).toContain("AI 核验时间：2026-06-07T15:00:00.000Z");
  });

  it("includes manual candidate verdicts and rationale in the evidence chain", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      candidates: [
        {
          ...sampleInvestigationInput.candidates[0],
          manualVerdict: {
            status: "excluded",
            rationale: "道路边界与原图相反，排除此候选。"
          }
        }
      ]
    });

    expect(report.fullMarkdown).toContain("人工结论");
    expect(report.fullMarkdown).toContain("已排除");
    expect(report.fullMarkdown).toContain("道路边界与原图相反，排除此候选。");
    expect(report.summaryMarkdown).toContain("人工结论：已排除");
  });

  it("keeps local evidence scoring visible in candidate summaries", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      candidates: [
        {
          ...sampleInvestigationInput.candidates[0],
          matchingEvidence: [
            "Satellite map shows the rail platform",
            "Blue roof is visible beside the platform",
            "Utility poles align with the street view",
            "本地证据评分 82/100：3 map-verifiable feature matches；public source link is attached"
          ],
          uncertainty: [
            "Historical imagery date may differ",
            "Tree cover hides part of the siding",
            "本地证据评分扣分项：1 unresolved or missing feature checks"
          ]
        }
      ]
    });

    expect(report.summaryMarkdown).toContain("本地证据评分 82/100");
    expect(report.summaryMarkdown).toContain("本地证据评分扣分项");
    expect(report.summaryMarkdown).not.toContain("Utility poles align with the street view");
  });

  it("renders newer search query purposes with readable labels", () => {
    const report = buildReports({
      ...sampleInvestigationInput,
      searchQueries: [
        {
          query: "station satellite map rail platform",
          purpose: "map-imagery-verification"
        },
        {
          query: "station camera viewpoint tracks foreground",
          purpose: "viewpoint-geometry"
        }
      ]
    });

    expect(report.fullMarkdown).toContain("地图影像核验");
    expect(report.fullMarkdown).toContain("视角几何核验");
    expect(report.fullMarkdown).not.toContain("map-imagery-verification");
    expect(report.fullMarkdown).not.toContain("viewpoint-geometry");
  });
});
