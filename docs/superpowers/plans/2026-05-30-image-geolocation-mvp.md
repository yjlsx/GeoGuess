# Image Geolocation MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web MVP that accepts an image plus flexible location scope, extracts or accepts clues, generates candidate coordinates, and produces a concise/expanded Google Earth verification report.

**Architecture:** Use one TypeScript workspace with a Vite React frontend and an Express local API. Put domain types, query generation, candidate ranking, map links, and report generation in shared modules so they are testable without the browser or external APIs. AI vision and web search are provider interfaces with deterministic mock/manual fallbacks for the first working version.

**Tech Stack:** TypeScript, React, Vite, Express, Multer, Sharp, Zod, Vitest, React Testing Library, Playwright for final browser smoke tests.

---

## File Structure

- `package.json`: npm scripts and dependencies.
- `tsconfig.json`: shared TypeScript settings.
- `vite.config.ts`: frontend dev server and API proxy.
- `vitest.config.ts`: unit and component test configuration.
- `index.html`: Vite HTML shell.
- `src/main.tsx`: React entrypoint.
- `src/App.tsx`: single investigation workspace.
- `src/styles.css`: application styling.
- `src/components/ImageInput.tsx`: image upload, preview, and crop-mode control.
- `src/components/ScopeForm.tsx`: flexible country/region/bounding-box/source/facility inputs.
- `src/components/ManualCluesForm.tsx`: manual clue fallback inputs.
- `src/components/CandidateResults.tsx`: clue summary, candidate cards, expanded evidence panel, export buttons.
- `src/shared/types.ts`: investigation, clue, query, candidate, and report types.
- `src/shared/mapLinks.ts`: Google Maps and Google Earth coordinate helpers.
- `src/shared/queryPlanner.ts`: converts scope and clues into multilingual search queries.
- `src/shared/reportGenerator.ts`: builds summary and full Markdown reports.
- `src/shared/sampleInvestigation.ts`: deterministic sample used by UI and tests.
- `server/index.ts`: Express API entrypoint.
- `server/storage.ts`: local file/image storage under `.data/investigations`.
- `server/imageCrop.ts`: full/upper-half/manual crop processing with Sharp.
- `server/providers/types.ts`: vision and search provider interfaces.
- `server/providers/manualVisionProvider.ts`: builds clues from manual user input.
- `server/providers/mockSearchProvider.ts`: deterministic candidate generation for offline MVP.
- `server/providers/openaiVisionProvider.ts`: optional AI vision provider guarded by `OPENAI_API_KEY`.
- `server/investigationService.ts`: orchestrates crop, clue extraction, query generation, search, ranking, and report generation.
- `tests/shared/mapLinks.test.ts`: map link tests.
- `tests/shared/queryPlanner.test.ts`: search query tests.
- `tests/shared/reportGenerator.test.ts`: report tests.
- `tests/server/investigationService.test.ts`: end-to-end service test using manual/mock providers.
- `tests/components/App.test.tsx`: UI smoke test.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Modify: `.gitignore`

- [ ] **Step 1: Create the npm project files**

Create `package.json`:

```json
{
  "name": "image-geo-finder",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently \"npm:dev:server\" \"npm:dev:web\"",
    "dev:web": "vite --host 127.0.0.1",
    "dev:server": "tsx watch server/index.ts",
    "build": "tsc --noEmit && vite build",
    "test": "vitest",
    "test:run": "vitest run",
    "preview": "vite preview --host 127.0.0.1"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "concurrently": "^9.0.0",
    "express": "^5.0.0",
    "multer": "^2.0.0",
    "openai": "^5.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "sharp": "^0.34.0",
    "tsx": "^4.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^16.0.0",
    "@types/express": "^5.0.0",
    "@types/multer": "^2.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.0.0",
    "vite": "^7.0.0",
    "vitest": "^3.0.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "server", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  }
});
```

Create `vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["@testing-library/jest-dom/vitest"]
  }
});
```

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Image Geo Finder</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="app-shell">
      <section className="workspace">
        <h1>Image Geo Finder</h1>
        <p>上传截图，填写已知范围，生成候选坐标和 Google Earth 核验清单。</p>
      </section>
    </main>
  );
}
```

Create `src/styles.css`:

```css
:root {
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  color: #17202a;
  background: #f4f6f8;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.app-shell {
  min-height: 100vh;
  padding: 24px;
}

.workspace {
  max-width: 1180px;
  margin: 0 auto;
}
```

Update `.gitignore`:

```gitignore
.superpowers/
.data/
dist/
node_modules/
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 3: Verify scaffold builds**

Run: `npm run build`

Expected: TypeScript passes and Vite creates `dist/`.

- [ ] **Step 4: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts index.html src/main.tsx src/App.tsx src/styles.css
git commit -m "feat: scaffold image geolocation app"
```

---

### Task 2: Shared Domain Model and Map Links

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/mapLinks.ts`
- Create: `tests/shared/mapLinks.test.ts`

- [ ] **Step 1: Write the failing map link tests**

Create `tests/shared/mapLinks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGoogleEarthHint, buildGoogleMapsLink, formatCoordinate } from "../../src/shared/mapLinks";

describe("mapLinks", () => {
  it("formats coordinates with five decimal places", () => {
    expect(formatCoordinate(42.259674, 112.756231)).toBe("42.25967, 112.75623");
  });

  it("builds a Google Maps query link", () => {
    expect(buildGoogleMapsLink(42.25967, 112.75623)).toBe(
      "https://www.google.com/maps/search/?api=1&query=42.25967%2C112.75623"
    );
  });

  it("builds a Google Earth copy hint", () => {
    expect(buildGoogleEarthHint(42.25967, 112.75623)).toBe(
      "Copy into Google Earth search: 42.25967, 112.75623"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/shared/mapLinks.test.ts`

Expected: FAIL because `src/shared/mapLinks.ts` does not exist.

- [ ] **Step 3: Add shared types**

Create `src/shared/types.ts`:

```ts
export type CropMode = "full" | "upper_half" | "manual";
export type Confidence = "high" | "medium" | "low";

export type CoordinateBox = {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
};

export type UserScope = {
  country?: string;
  region?: string;
  coordinateBox?: CoordinateBox;
  facilityType?: string;
  source?: string;
  dateOrTimeHint?: string;
  notes?: string;
};

export type ExtractedClues = {
  ocrText: string[];
  visibleLabels: string[];
  languages: string[];
  sceneFeatures: string[];
  spatialRelationships: string[];
  inferredSearchTerms: string[];
};

export type SearchQuery = {
  query: string;
  language?: string;
  purpose: string;
};

export type SourceEvidence = {
  title: string;
  url: string;
  note: string;
};

export type Candidate = {
  id: string;
  name?: string;
  latitude: number;
  longitude: number;
  confidence: Confidence;
  mapLinks: {
    googleMaps: string;
    googleEarthHint?: string;
  };
  matchingEvidence: string[];
  uncertainty: string[];
  sources: SourceEvidence[];
  earthVerificationChecklist: string[];
};

export type Investigation = {
  id: string;
  image: {
    originalPath: string;
    cropPath?: string;
    cropMode: CropMode;
  };
  userScope: UserScope;
  extractedClues: ExtractedClues;
  searchQueries: SearchQuery[];
  candidates: Candidate[];
  report: {
    summaryMarkdown: string;
    fullMarkdown: string;
    createdAt: string;
  };
};
```

- [ ] **Step 4: Add map link helpers**

Create `src/shared/mapLinks.ts`:

```ts
export function formatCoordinate(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function buildGoogleMapsLink(latitude: number, longitude: number) {
  const query = encodeURIComponent(formatCoordinate(latitude, longitude));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function buildGoogleEarthHint(latitude: number, longitude: number) {
  return `Copy into Google Earth search: ${formatCoordinate(latitude, longitude)}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --run tests/shared/mapLinks.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/mapLinks.ts tests/shared/mapLinks.test.ts
git commit -m "feat: add investigation domain model"
```

---

### Task 3: Query Planning

**Files:**
- Create: `src/shared/queryPlanner.ts`
- Create: `tests/shared/queryPlanner.test.ts`

- [ ] **Step 1: Write the failing query planner tests**

Create `tests/shared/queryPlanner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSearchQueries } from "../../src/shared/queryPlanner";
import type { ExtractedClues, UserScope } from "../../src/shared/types";

const scope: UserScope = {
  country: "Mongolia",
  region: "Dornogovi",
  facilityType: "railway station",
  source: "CCTV 7",
  notes: "China Mongolia joint training"
};

const clues: ExtractedClues = {
  ocrText: ["中蒙 草原伙伴 2026 陆军联合训练"],
  visibleLabels: ["CCTV 7"],
  languages: ["Chinese"],
  sceneFeatures: ["railway", "station building", "grassland"],
  spatialRelationships: ["railway runs horizontally in foreground", "station building behind tracks"],
  inferredSearchTerms: ["China Mongolia joint exercise", "railway station"]
};

describe("buildSearchQueries", () => {
  it("combines scope, source, OCR, and facility clues", () => {
    const queries = buildSearchQueries(scope, clues);
    expect(queries[0]).toEqual({
      query: "Mongolia Dornogovi railway station CCTV 7 China Mongolia joint training",
      language: "en",
      purpose: "scope-source-facility"
    });
    expect(queries.map((item) => item.query)).toContain(
      "中蒙 草原伙伴 2026 陆军联合训练 Mongolia railway station"
    );
  });

  it("deduplicates repeated queries", () => {
    const queries = buildSearchQueries(scope, {
      ...clues,
      inferredSearchTerms: ["railway station", "railway station"]
    });
    const unique = new Set(queries.map((item) => item.query));
    expect(unique.size).toBe(queries.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/shared/queryPlanner.test.ts`

Expected: FAIL because `src/shared/queryPlanner.ts` does not exist.

- [ ] **Step 3: Implement query planner**

Create `src/shared/queryPlanner.ts`:

```ts
import type { ExtractedClues, SearchQuery, UserScope } from "./types";

function compact(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
}

function pushUnique(queries: SearchQuery[], seen: Set<string>, item: SearchQuery) {
  const key = `${item.language ?? ""}:${item.query}`;
  if (!seen.has(key)) {
    seen.add(key);
    queries.push(item);
  }
}

export function buildSearchQueries(scope: UserScope, clues: ExtractedClues): SearchQuery[] {
  const queries: SearchQuery[] = [];
  const seen = new Set<string>();
  const place = compact([scope.country, scope.region]).join(" ");
  const facility = scope.facilityType ?? clues.sceneFeatures.find((feature) => feature.includes("station"));

  pushUnique(queries, seen, {
    query: compact([place, facility, scope.source, scope.notes]).join(" "),
    language: "en",
    purpose: "scope-source-facility"
  });

  for (const text of clues.ocrText.slice(0, 3)) {
    pushUnique(queries, seen, {
      query: compact([text, scope.country, facility]).join(" "),
      language: clues.languages.includes("Chinese") ? "zh" : undefined,
      purpose: "ocr-scope"
    });
  }

  for (const term of clues.inferredSearchTerms.slice(0, 6)) {
    pushUnique(queries, seen, {
      query: compact([scope.country, scope.region, term]).join(" "),
      language: "en",
      purpose: "inferred-term"
    });
  }

  return queries.filter((item) => item.query.length > 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/shared/queryPlanner.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/queryPlanner.ts tests/shared/queryPlanner.test.ts
git commit -m "feat: generate geolocation search queries"
```

---

### Task 4: Report Generation

**Files:**
- Create: `src/shared/reportGenerator.ts`
- Create: `src/shared/sampleInvestigation.ts`
- Create: `tests/shared/reportGenerator.test.ts`

- [ ] **Step 1: Write the failing report tests**

Create `tests/shared/reportGenerator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sampleInvestigationInput } from "../../src/shared/sampleInvestigation";
import { buildReports } from "../../src/shared/reportGenerator";

describe("buildReports", () => {
  it("creates a concise report with coordinates and uncertainty", () => {
    const report = buildReports(sampleInvestigationInput);
    expect(report.summaryMarkdown).toContain("42.25967, 112.75623");
    expect(report.summaryMarkdown).toContain("High confidence");
    expect(report.summaryMarkdown).toContain("satellite imagery date may differ");
  });

  it("creates a full report with queries, sources, and Google Earth checklist", () => {
    const report = buildReports(sampleInvestigationInput);
    expect(report.fullMarkdown).toContain("## Extracted Clues");
    expect(report.fullMarkdown).toContain("railway runs horizontally");
    expect(report.fullMarkdown).toContain("Copy into Google Earth search");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/shared/reportGenerator.test.ts`

Expected: FAIL because report files do not exist.

- [ ] **Step 3: Add sample investigation input**

Create `src/shared/sampleInvestigation.ts`:

```ts
import { buildGoogleEarthHint, buildGoogleMapsLink } from "./mapLinks";
import type { Candidate, ExtractedClues, SearchQuery, UserScope } from "./types";

export type ReportInput = {
  userScope: UserScope;
  extractedClues: ExtractedClues;
  searchQueries: SearchQuery[];
  candidates: Candidate[];
};

export const sampleInvestigationInput: ReportInput = {
  userScope: {
    country: "Mongolia",
    region: "Dornogovi",
    facilityType: "railway station",
    source: "CCTV 7",
    notes: "China Mongolia joint training"
  },
  extractedClues: {
    ocrText: ["中蒙 草原伙伴 2026 陆军联合训练"],
    visibleLabels: ["CCTV 7"],
    languages: ["Chinese"],
    sceneFeatures: ["railway", "station building", "grassland", "communication tower"],
    spatialRelationships: ["railway runs horizontally in foreground", "station building behind tracks"],
    inferredSearchTerms: ["China Mongolia joint training railway station"]
  },
  searchQueries: [
    {
      query: "Mongolia Dornogovi railway station CCTV 7 China Mongolia joint training",
      language: "en",
      purpose: "scope-source-facility"
    }
  ],
  candidates: [
    {
      id: "candidate-1",
      name: "Railway station near training area",
      latitude: 42.25967,
      longitude: 112.75623,
      confidence: "high",
      mapLinks: {
        googleMaps: buildGoogleMapsLink(42.25967, 112.75623),
        googleEarthHint: buildGoogleEarthHint(42.25967, 112.75623)
      },
      matchingEvidence: [
        "railway runs horizontally in the image and at the candidate site",
        "station building appears behind the tracks",
        "open grassland/desert surroundings match the screenshot"
      ],
      uncertainty: ["satellite imagery date may differ from the video date"],
      sources: [
        {
          title: "User-provided image context",
          url: "local://uploaded-image",
          note: "Manual/sample evidence for offline MVP"
        }
      ],
      earthVerificationChecklist: [
        "Confirm railway alignment and number of visible tracks",
        "Check whether station buildings sit north of the tracks",
        "Compare tower and road positions with the screenshot",
        "Use historical imagery to check construction changes"
      ]
    }
  ]
};
```

- [ ] **Step 4: Add report generator**

Create `src/shared/reportGenerator.ts`:

```ts
import { formatCoordinate } from "./mapLinks";
import type { ReportInput } from "./sampleInvestigation";

function confidenceLabel(confidence: string) {
  return `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence`;
}

function list(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

export function buildReports(input: ReportInput) {
  const summaryMarkdown = input.candidates
    .map((candidate, index) => {
      return [
        `### Candidate ${index + 1}: ${confidenceLabel(candidate.confidence)}`,
        `${formatCoordinate(candidate.latitude, candidate.longitude)}`,
        candidate.mapLinks.googleMaps,
        "",
        "Key evidence:",
        list(candidate.matchingEvidence.slice(0, 3)),
        "",
        "Main uncertainty:",
        list(candidate.uncertainty.slice(0, 2))
      ].join("\n");
    })
    .join("\n\n");

  const fullMarkdown = [
    "# Image Geolocation Report",
    "",
    "## User Scope",
    list(Object.entries(input.userScope).map(([key, value]) => `${key}: ${value}`)),
    "",
    "## Extracted Clues",
    "OCR:",
    list(input.extractedClues.ocrText),
    "Scene features:",
    list(input.extractedClues.sceneFeatures),
    "Spatial relationships:",
    list(input.extractedClues.spatialRelationships),
    "",
    "## Search Queries",
    list(input.searchQueries.map((query) => `${query.query} (${query.purpose})`)),
    "",
    "## Candidates",
    ...input.candidates.map((candidate, index) =>
      [
        `### Candidate ${index + 1}: ${candidate.name ?? "Unnamed location"}`,
        `Coordinates: ${formatCoordinate(candidate.latitude, candidate.longitude)}`,
        `Confidence: ${confidenceLabel(candidate.confidence)}`,
        `Maps: ${candidate.mapLinks.googleMaps}`,
        candidate.mapLinks.googleEarthHint ?? "",
        "",
        "Matching evidence:",
        list(candidate.matchingEvidence),
        "Uncertainty:",
        list(candidate.uncertainty),
        "Sources:",
        list(candidate.sources.map((source) => `${source.title} - ${source.url} - ${source.note}`)),
        "Google Earth verification checklist:",
        list(candidate.earthVerificationChecklist)
      ].join("\n")
    )
  ].join("\n");

  return {
    summaryMarkdown,
    fullMarkdown,
    createdAt: new Date().toISOString()
  };
}
```

- [ ] **Step 5: Run report tests**

Run: `npm test -- --run tests/shared/reportGenerator.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/reportGenerator.ts src/shared/sampleInvestigation.ts tests/shared/reportGenerator.test.ts
git commit -m "feat: generate geolocation reports"
```

---

### Task 5: Local Investigation Service

**Files:**
- Create: `server/providers/types.ts`
- Create: `server/providers/manualVisionProvider.ts`
- Create: `server/providers/mockSearchProvider.ts`
- Create: `server/investigationService.ts`
- Create: `tests/server/investigationService.test.ts`

- [ ] **Step 1: Write the failing service test**

Create `tests/server/investigationService.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runInvestigation } from "../../server/investigationService";

describe("runInvestigation", () => {
  it("runs the manual/mock path and returns a report", async () => {
    const result = await runInvestigation({
      image: {
        originalPath: "local://sample",
        cropMode: "upper_half"
      },
      userScope: {
        country: "Mongolia",
        region: "Dornogovi",
        facilityType: "railway station",
        source: "CCTV 7",
        notes: "China Mongolia joint training"
      },
      manualClues: {
        ocrText: ["中蒙 草原伙伴 2026 陆军联合训练"],
        visibleLabels: ["CCTV 7"],
        languages: ["Chinese"],
        sceneFeatures: ["railway", "station building", "grassland"],
        spatialRelationships: ["railway runs horizontally in foreground"],
        inferredSearchTerms: ["China Mongolia joint training railway station"]
      }
    });

    expect(result.searchQueries.length).toBeGreaterThan(0);
    expect(result.candidates[0].latitude).toBe(42.25967);
    expect(result.report.summaryMarkdown).toContain("High confidence");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/server/investigationService.test.ts`

Expected: FAIL because `server/investigationService.ts` does not exist.

- [ ] **Step 3: Add provider interfaces**

Create `server/providers/types.ts`:

```ts
import type { Candidate, ExtractedClues, SearchQuery, UserScope } from "../../src/shared/types";

export type VisionRequest = {
  imagePath: string;
  userScope: UserScope;
  manualClues?: ExtractedClues;
};

export type VisionProvider = {
  extractClues(request: VisionRequest): Promise<ExtractedClues>;
};

export type SearchProvider = {
  findCandidates(args: {
    userScope: UserScope;
    clues: ExtractedClues;
    queries: SearchQuery[];
  }): Promise<Candidate[]>;
};
```

- [ ] **Step 4: Add manual vision provider**

Create `server/providers/manualVisionProvider.ts`:

```ts
import type { ExtractedClues } from "../../src/shared/types";
import type { VisionProvider } from "./types";

const emptyClues: ExtractedClues = {
  ocrText: [],
  visibleLabels: [],
  languages: [],
  sceneFeatures: [],
  spatialRelationships: [],
  inferredSearchTerms: []
};

export const manualVisionProvider: VisionProvider = {
  async extractClues(request) {
    return request.manualClues ?? emptyClues;
  }
};
```

- [ ] **Step 5: Add mock search provider**

Create `server/providers/mockSearchProvider.ts`:

```ts
import { buildGoogleEarthHint, buildGoogleMapsLink } from "../../src/shared/mapLinks";
import type { SearchProvider } from "./types";

export const mockSearchProvider: SearchProvider = {
  async findCandidates(args) {
    const hasRailway = args.clues.sceneFeatures.some((feature) => feature.toLowerCase().includes("rail"));
    const confidence = hasRailway ? "high" : "medium";

    return [
      {
        id: "mock-candidate-1",
        name: "Mock railway candidate for offline MVP",
        latitude: 42.25967,
        longitude: 112.75623,
        confidence,
        mapLinks: {
          googleMaps: buildGoogleMapsLink(42.25967, 112.75623),
          googleEarthHint: buildGoogleEarthHint(42.25967, 112.75623)
        },
        matchingEvidence: [
          "manual/mock candidate keeps the full report flow testable without external APIs",
          ...args.clues.spatialRelationships.slice(0, 2),
          ...args.clues.sceneFeatures.slice(0, 3).map((feature) => `visible feature: ${feature}`)
        ],
        uncertainty: ["mock provider is not an authoritative location search result"],
        sources: [
          {
            title: "Offline mock search provider",
            url: "local://mock-search",
            note: `Generated from ${args.queries.length} planned search queries`
          }
        ],
        earthVerificationChecklist: [
          "Confirm railway alignment and number of tracks",
          "Compare station building position relative to tracks",
          "Check roads, open ground, towers, and roof colors",
          "Use historical imagery to confirm whether features changed"
        ]
      }
    ];
  }
};
```

- [ ] **Step 6: Add investigation service**

Create `server/investigationService.ts`:

```ts
import { buildReports } from "../src/shared/reportGenerator";
import { buildSearchQueries } from "../src/shared/queryPlanner";
import type { CropMode, ExtractedClues, Investigation, UserScope } from "../src/shared/types";
import { manualVisionProvider } from "./providers/manualVisionProvider";
import { mockSearchProvider } from "./providers/mockSearchProvider";
import type { SearchProvider, VisionProvider } from "./providers/types";

export type RunInvestigationInput = {
  image: {
    originalPath: string;
    cropPath?: string;
    cropMode: CropMode;
  };
  userScope: UserScope;
  manualClues?: ExtractedClues;
  providers?: {
    vision?: VisionProvider;
    search?: SearchProvider;
  };
};

export async function runInvestigation(input: RunInvestigationInput): Promise<Investigation> {
  const vision = input.providers?.vision ?? manualVisionProvider;
  const search = input.providers?.search ?? mockSearchProvider;
  const extractedClues = await vision.extractClues({
    imagePath: input.image.cropPath ?? input.image.originalPath,
    userScope: input.userScope,
    manualClues: input.manualClues
  });
  const searchQueries = buildSearchQueries(input.userScope, extractedClues);
  const candidates = await search.findCandidates({
    userScope: input.userScope,
    clues: extractedClues,
    queries: searchQueries
  });
  const report = buildReports({
    userScope: input.userScope,
    extractedClues,
    searchQueries,
    candidates
  });

  return {
    id: `investigation-${Date.now()}`,
    image: input.image,
    userScope: input.userScope,
    extractedClues,
    searchQueries,
    candidates,
    report
  };
}
```

- [ ] **Step 7: Run service test**

Run: `npm test -- --run tests/server/investigationService.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/providers/types.ts server/providers/manualVisionProvider.ts server/providers/mockSearchProvider.ts server/investigationService.ts tests/server/investigationService.test.ts
git commit -m "feat: add local investigation service"
```

---

### Task 6: Express API, Storage, and Image Crop

**Files:**
- Create: `server/storage.ts`
- Create: `server/imageCrop.ts`
- Create: `server/index.ts`

- [ ] **Step 1: Create storage helper**

Create `server/storage.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = path.resolve(".data", "investigations");

export async function createInvestigationDir(id = `investigation-${Date.now()}`) {
  const dir = path.join(dataDir, id);
  await mkdir(dir, { recursive: true });
  return { id, dir };
}

export async function saveUploadedImage(args: { dir: string; originalName: string; buffer: Buffer }) {
  const safeName = args.originalName.replace(/[^a-zA-Z0-9._-]/g, "_") || "upload.jpg";
  const outputPath = path.join(args.dir, safeName);
  await writeFile(outputPath, args.buffer);
  return outputPath;
}
```

- [ ] **Step 2: Create image crop helper**

Create `server/imageCrop.ts`:

```ts
import path from "node:path";
import sharp from "sharp";
import type { CropMode } from "../src/shared/types";

export type ManualCrop = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export async function createAnalysisCrop(args: {
  imagePath: string;
  cropMode: CropMode;
  manualCrop?: ManualCrop;
}) {
  if (args.cropMode === "full") {
    return args.imagePath;
  }

  const image = sharp(args.imagePath);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read image dimensions");
  }

  const extract =
    args.cropMode === "upper_half"
      ? { left: 0, top: 0, width: metadata.width, height: Math.floor(metadata.height / 2) }
      : args.manualCrop;

  if (!extract) {
    throw new Error("Manual crop is required when cropMode is manual");
  }

  const parsed = path.parse(args.imagePath);
  const outputPath = path.join(parsed.dir, `${parsed.name}-${args.cropMode}${parsed.ext || ".jpg"}`);
  await sharp(args.imagePath).extract(extract).toFile(outputPath);
  return outputPath;
}
```

- [ ] **Step 3: Create Express API**

Create `server/index.ts`:

```ts
import express from "express";
import multer from "multer";
import { z } from "zod";
import { createAnalysisCrop } from "./imageCrop";
import { runInvestigation } from "./investigationService";
import { createInvestigationDir, saveUploadedImage } from "./storage";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const bodySchema = z.object({
  cropMode: z.enum(["full", "upper_half", "manual"]).default("upper_half"),
  country: z.string().optional(),
  region: z.string().optional(),
  facilityType: z.string().optional(),
  source: z.string().optional(),
  dateOrTimeHint: z.string().optional(),
  notes: z.string().optional(),
  manualClues: z
    .object({
      ocrText: z.array(z.string()).default([]),
      visibleLabels: z.array(z.string()).default([]),
      languages: z.array(z.string()).default([]),
      sceneFeatures: z.array(z.string()).default([]),
      spatialRelationships: z.array(z.string()).default([]),
      inferredSearchTerms: z.array(z.string()).default([])
    })
    .optional()
});

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/investigations", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "image file is required" });
      return;
    }

    const parsed = bodySchema.parse({
      ...req.body,
      manualClues: req.body.manualClues ? JSON.parse(req.body.manualClues) : undefined
    });

    const { dir } = await createInvestigationDir();
    const originalPath = await saveUploadedImage({
      dir,
      originalName: req.file.originalname,
      buffer: req.file.buffer
    });
    const cropPath = await createAnalysisCrop({
      imagePath: originalPath,
      cropMode: parsed.cropMode
    });

    const investigation = await runInvestigation({
      image: { originalPath, cropPath, cropMode: parsed.cropMode },
      userScope: {
        country: parsed.country,
        region: parsed.region,
        facilityType: parsed.facilityType,
        source: parsed.source,
        dateOrTimeHint: parsed.dateOrTimeHint,
        notes: parsed.notes
      },
      manualClues: parsed.manualClues
    });

    res.json(investigation);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown server error";
  res.status(500).json({ error: message });
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, "127.0.0.1", () => {
  console.log(`Image Geo Finder API listening on http://127.0.0.1:${port}`);
});
```

- [ ] **Step 4: Verify API compiles**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts server/imageCrop.ts server/index.ts
git commit -m "feat: add local investigation API"
```

---

### Task 7: React Workspace UI

**Files:**
- Create: `src/components/ImageInput.tsx`
- Create: `src/components/ScopeForm.tsx`
- Create: `src/components/ManualCluesForm.tsx`
- Create: `src/components/CandidateResults.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `tests/components/App.test.tsx`

- [ ] **Step 1: Write the failing UI test**

Create `tests/components/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../../src/App";

describe("App", () => {
  it("renders the investigation workspace", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Image Geo Finder" })).toBeInTheDocument();
    expect(screen.getByLabelText("国家")).toBeInTheDocument();
    expect(screen.getByLabelText("OCR 文字")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始分析" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/components/App.test.tsx`

Expected: FAIL because form fields are not implemented.

- [ ] **Step 3: Add image input component**

Create `src/components/ImageInput.tsx`:

```tsx
import type { CropMode } from "../shared/types";

type Props = {
  file: File | null;
  cropMode: CropMode;
  onFileChange: (file: File | null) => void;
  onCropModeChange: (mode: CropMode) => void;
};

export function ImageInput({ file, cropMode, onFileChange, onCropModeChange }: Props) {
  return (
    <section className="panel">
      <h2>图片</h2>
      <label className="field">
        上传图片
        <input
          type="file"
          accept="image/*"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
      </label>
      {file ? <p className="hint">已选择：{file.name}</p> : <p className="hint">支持截图、裁切图和视频帧。</p>}
      <label className="field">
        分析区域
        <select value={cropMode} onChange={(event) => onCropModeChange(event.target.value as CropMode)}>
          <option value="upper_half">上半张</option>
          <option value="full">整张</option>
          <option value="manual">手动框选（后续增强）</option>
        </select>
      </label>
    </section>
  );
}
```

- [ ] **Step 4: Add scope form**

Create `src/components/ScopeForm.tsx`:

```tsx
import type { UserScope } from "../shared/types";

type Props = {
  value: UserScope;
  onChange: (value: UserScope) => void;
};

function update(value: UserScope, key: keyof UserScope, next: string): UserScope {
  return { ...value, [key]: next || undefined };
}

export function ScopeForm({ value, onChange }: Props) {
  return (
    <section className="panel">
      <h2>已知范围</h2>
      <label className="field">
        国家
        <input value={value.country ?? ""} onChange={(event) => onChange(update(value, "country", event.target.value))} />
      </label>
      <label className="field">
        地区
        <input value={value.region ?? ""} onChange={(event) => onChange(update(value, "region", event.target.value))} />
      </label>
      <label className="field">
        设施类型
        <input
          value={value.facilityType ?? ""}
          onChange={(event) => onChange(update(value, "facilityType", event.target.value))}
        />
      </label>
      <label className="field">
        来源
        <input value={value.source ?? ""} onChange={(event) => onChange(update(value, "source", event.target.value))} />
      </label>
      <label className="field">
        备注
        <textarea value={value.notes ?? ""} onChange={(event) => onChange(update(value, "notes", event.target.value))} />
      </label>
    </section>
  );
}
```

- [ ] **Step 5: Add manual clues form**

Create `src/components/ManualCluesForm.tsx`:

```tsx
import type { ExtractedClues } from "../shared/types";

type Props = {
  value: ExtractedClues;
  onChange: (value: ExtractedClues) => void;
};

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function joinLines(value: string[]) {
  return value.join("\n");
}

export function ManualCluesForm({ value, onChange }: Props) {
  function set(key: keyof ExtractedClues, next: string) {
    onChange({ ...value, [key]: splitLines(next) });
  }

  return (
    <section className="panel">
      <h2>手动线索</h2>
      <label className="field">
        OCR 文字
        <textarea value={joinLines(value.ocrText)} onChange={(event) => set("ocrText", event.target.value)} />
      </label>
      <label className="field">
        可见标识
        <textarea value={joinLines(value.visibleLabels)} onChange={(event) => set("visibleLabels", event.target.value)} />
      </label>
      <label className="field">
        地物特征
        <textarea value={joinLines(value.sceneFeatures)} onChange={(event) => set("sceneFeatures", event.target.value)} />
      </label>
      <label className="field">
        空间关系
        <textarea
          value={joinLines(value.spatialRelationships)}
          onChange={(event) => set("spatialRelationships", event.target.value)}
        />
      </label>
      <label className="field">
        搜索词
        <textarea
          value={joinLines(value.inferredSearchTerms)}
          onChange={(event) => set("inferredSearchTerms", event.target.value)}
        />
      </label>
    </section>
  );
}
```

- [ ] **Step 6: Add candidate results component**

Create `src/components/CandidateResults.tsx`:

```tsx
import type { Investigation } from "../shared/types";
import { formatCoordinate } from "../shared/mapLinks";

type Props = {
  investigation: Investigation | null;
  loading: boolean;
  error: string | null;
};

export function CandidateResults({ investigation, loading, error }: Props) {
  if (loading) {
    return <section className="panel result-panel">正在分析...</section>;
  }

  if (error) {
    return <section className="panel result-panel error">{error}</section>;
  }

  if (!investigation) {
    return <section className="panel result-panel">结果会显示候选坐标、证据链和 Google Earth 核验清单。</section>;
  }

  return (
    <section className="panel result-panel">
      <h2>候选结果</h2>
      <div className="clues">
        <h3>线索摘要</h3>
        <p>{investigation.extractedClues.sceneFeatures.join(" / ") || "没有地物线索"}</p>
      </div>
      <div className="candidate-list">
        {investigation.candidates.map((candidate, index) => (
          <article className="candidate" key={candidate.id}>
            <div className="candidate-header">
              <strong>候选 {index + 1}</strong>
              <span>{candidate.confidence}</span>
            </div>
            <p>{formatCoordinate(candidate.latitude, candidate.longitude)}</p>
            <a href={candidate.mapLinks.googleMaps} target="_blank" rel="noreferrer">
              打开 Google Maps
            </a>
            <details>
              <summary>查看证据链和核验清单</summary>
              <h4>为什么像</h4>
              <ul>{candidate.matchingEvidence.map((item) => <li key={item}>{item}</li>)}</ul>
              <h4>不确定点</h4>
              <ul>{candidate.uncertainty.map((item) => <li key={item}>{item}</li>)}</ul>
              <h4>Google Earth 核验</h4>
              <p>{candidate.mapLinks.googleEarthHint}</p>
              <ul>{candidate.earthVerificationChecklist.map((item) => <li key={item}>{item}</li>)}</ul>
            </details>
          </article>
        ))}
      </div>
      <details className="report">
        <summary>完整 Markdown 报告</summary>
        <pre>{investigation.report.fullMarkdown}</pre>
      </details>
    </section>
  );
}
```

- [ ] **Step 7: Wire components in App**

Replace `src/App.tsx` with:

```tsx
import { useState } from "react";
import { CandidateResults } from "./components/CandidateResults";
import { ImageInput } from "./components/ImageInput";
import { ManualCluesForm } from "./components/ManualCluesForm";
import { ScopeForm } from "./components/ScopeForm";
import type { CropMode, ExtractedClues, Investigation, UserScope } from "./shared/types";

const emptyClues: ExtractedClues = {
  ocrText: [],
  visibleLabels: [],
  languages: [],
  sceneFeatures: [],
  spatialRelationships: [],
  inferredSearchTerms: []
};

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [cropMode, setCropMode] = useState<CropMode>("upper_half");
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
      for (const [key, value] of Object.entries(scope)) {
        if (typeof value === "string" && value) {
          formData.append(key, value);
        }
      }
      formData.append("manualClues", JSON.stringify(manualClues));
      const response = await fetch("/api/investigations", { method: "POST", body: formData });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setInvestigation((await response.json()) as Investigation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "分析失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Image Geo Finder</h1>
        <p>上传截图，填写已知范围，生成候选坐标和 Google Earth 核验清单。</p>
      </header>
      <div className="workspace">
        <div className="input-column">
          <ImageInput file={file} cropMode={cropMode} onFileChange={setFile} onCropModeChange={setCropMode} />
          <ScopeForm value={scope} onChange={setScope} />
          <ManualCluesForm value={manualClues} onChange={setManualClues} />
          <button className="primary-button" onClick={analyze} disabled={loading}>
            开始分析
          </button>
        </div>
        <CandidateResults investigation={investigation} loading={loading} error={error} />
      </div>
    </main>
  );
}
```

- [ ] **Step 8: Add workspace styles**

Replace `src/styles.css` with:

```css
:root {
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  color: #17202a;
  background: #f4f6f8;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button,
input,
select,
textarea {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  padding: 24px;
}

.app-header,
.workspace {
  max-width: 1240px;
  margin: 0 auto;
}

.app-header {
  margin-bottom: 20px;
}

.app-header h1 {
  margin: 0 0 6px;
  font-size: 32px;
}

.app-header p {
  margin: 0;
  color: #5d6d7e;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.input-column {
  display: grid;
  gap: 14px;
}

.panel {
  background: #ffffff;
  border: 1px solid #d7dee6;
  border-radius: 8px;
  padding: 16px;
}

.panel h2 {
  margin: 0 0 12px;
  font-size: 18px;
}

.field {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 650;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  border: 1px solid #c7d0da;
  border-radius: 6px;
  padding: 9px 10px;
  background: #fbfcfd;
}

.field textarea {
  min-height: 72px;
  resize: vertical;
}

.hint {
  color: #6b7886;
  font-size: 13px;
}

.primary-button {
  border: 0;
  border-radius: 7px;
  padding: 12px 16px;
  background: #1864ab;
  color: #ffffff;
  font-weight: 700;
  cursor: pointer;
}

.primary-button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.result-panel {
  min-height: 520px;
}

.error {
  border-color: #e57373;
  color: #9f1d1d;
}

.candidate-list {
  display: grid;
  gap: 12px;
}

.candidate {
  border: 1px solid #d7dee6;
  border-radius: 8px;
  padding: 14px;
}

.candidate-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.report pre {
  white-space: pre-wrap;
  overflow-x: auto;
  background: #f6f8fa;
  border-radius: 6px;
  padding: 12px;
}

@media (max-width: 900px) {
  .workspace {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 9: Run UI test**

Run: `npm test -- --run tests/components/App.test.tsx`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx src/styles.css src/components/ImageInput.tsx src/components/ScopeForm.tsx src/components/ManualCluesForm.tsx src/components/CandidateResults.tsx tests/components/App.test.tsx
git commit -m "feat: build investigation workspace UI"
```

---

### Task 8: Optional OpenAI Vision Provider Guard

**Files:**
- Create: `server/providers/openaiVisionProvider.ts`
- Modify: `server/investigationService.ts`
- Create: `tests/server/providerSelection.test.ts`

- [ ] **Step 1: Write provider selection test**

Create `tests/server/providerSelection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { selectVisionProviderName } from "../../server/investigationService";

describe("selectVisionProviderName", () => {
  it("uses manual vision when no OpenAI API key is configured", () => {
    expect(selectVisionProviderName({ OPENAI_API_KEY: undefined })).toBe("manual");
  });

  it("uses OpenAI vision when an OpenAI API key is configured", () => {
    expect(selectVisionProviderName({ OPENAI_API_KEY: "sk-test" })).toBe("openai");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/server/providerSelection.test.ts`

Expected: FAIL because `selectVisionProviderName` does not exist.

- [ ] **Step 3: Add OpenAI provider wrapper**

Create `server/providers/openaiVisionProvider.ts`:

```ts
import OpenAI from "openai";
import type { ExtractedClues } from "../../src/shared/types";
import type { VisionProvider } from "./types";

const cluePrompt = `Analyze this geolocation image crop. Return JSON with arrays:
ocrText, visibleLabels, languages, sceneFeatures, spatialRelationships, inferredSearchTerms.
Focus on map-verifiable features such as railways, roads, buildings, terrain, towers, water, fields, and spatial relationships.`;

export function createOpenAIVisionProvider(apiKey: string): VisionProvider {
  const client = new OpenAI({ apiKey });

  return {
    async extractClues(request): Promise<ExtractedClues> {
      const fs = await import("node:fs/promises");
      const imageBase64 = await fs.readFile(request.imagePath, { encoding: "base64" });
      const response = await client.responses.create({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: cluePrompt },
              { type: "input_image", image_url: `data:image/jpeg;base64,${imageBase64}` }
            ]
          }
        ]
      });
      const text = response.output_text;
      const parsed = JSON.parse(text) as Partial<ExtractedClues>;
      return {
        ocrText: parsed.ocrText ?? [],
        visibleLabels: parsed.visibleLabels ?? [],
        languages: parsed.languages ?? [],
        sceneFeatures: parsed.sceneFeatures ?? [],
        spatialRelationships: parsed.spatialRelationships ?? [],
        inferredSearchTerms: parsed.inferredSearchTerms ?? []
      };
    }
  };
}
```

- [ ] **Step 4: Add provider selection**

Modify `server/investigationService.ts` so it exports this helper and uses it only when no provider override is passed:

```ts
import { createOpenAIVisionProvider } from "./providers/openaiVisionProvider";

export function selectVisionProviderName(env: Pick<NodeJS.ProcessEnv, "OPENAI_API_KEY">) {
  return env.OPENAI_API_KEY ? "openai" : "manual";
}

function defaultVisionProvider() {
  return selectVisionProviderName(process.env) === "openai"
    ? createOpenAIVisionProvider(process.env.OPENAI_API_KEY!)
    : manualVisionProvider;
}
```

Then change:

```ts
const vision = input.providers?.vision ?? manualVisionProvider;
```

to:

```ts
const vision = input.providers?.vision ?? defaultVisionProvider();
```

- [ ] **Step 5: Run provider selection test**

Run: `npm test -- --run tests/server/providerSelection.test.ts`

Expected: PASS.

- [ ] **Step 6: Run full tests**

Run: `npm test -- --run`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/providers/openaiVisionProvider.ts server/investigationService.ts tests/server/providerSelection.test.ts
git commit -m "feat: add optional OpenAI vision provider"
```

---

### Task 9: Final Verification and Local Run

**Files:**
- Modify only files needed to fix verification failures.

- [ ] **Step 1: Run all tests**

Run: `npm test -- --run`

Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS and `dist/` exists.

- [ ] **Step 3: Start the dev server**

Run: `npm run dev`

Expected:

- API prints `Image Geo Finder API listening on http://127.0.0.1:8787`.
- Vite prints a local URL, normally `http://127.0.0.1:5173/`.

- [ ] **Step 4: Browser smoke test**

Open `http://127.0.0.1:5173/` and verify:

- The app renders without console errors.
- Uploading a local image is accepted.
- Filling country, region, OCR, scene features, and spatial relationships enables a manual/mock investigation.
- The result panel shows candidate coordinate `42.25967, 112.75623`.
- The Google Maps link opens a map query.
- The expanded report includes a Google Earth checklist.

- [ ] **Step 5: Commit fixes if needed**

If verification required fixes:

```bash
git add <fixed-files>
git commit -m "fix: stabilize image geolocation MVP"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Image upload, crop modes, and upper-half analysis are covered in Tasks 1, 6, and 7.
- Flexible scope inputs are covered in Tasks 3 and 7.
- Manual fallback is covered in Tasks 5 and 7.
- AI visual analysis is covered as an optional provider in Task 8.
- Public search is represented by a provider interface and deterministic mock provider in Task 5; a real web search provider is intentionally deferred until the MVP has a stable flow and a chosen search API key.
- Candidate coordinates, map links, confidence, evidence, uncertainty, and Google Earth checklists are covered in Tasks 2, 4, 5, and 7.
- Markdown/JSON report output is covered by the investigation API response and report generator in Tasks 4, 6, and 7.

Scope note:

- The plan produces a complete local MVP with mock/manual search. Real web search integration should be the next plan after choosing a search provider, because API choice affects credentials, rate limits, result parsing, and cost.

Red-flag scan:

- The plan contains concrete file paths, commands, and implementation snippets for each task.

Type consistency:

- `Investigation`, `ExtractedClues`, `SearchQuery`, `Candidate`, `UserScope`, and `CropMode` are introduced in Task 2 and reused consistently in later tasks.
