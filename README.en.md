# GeoGuess

**GeoGuess** is a local web workbench for OSINT-style image geolocation verification. It accepts images or videos, combines EXIF metadata, vision-model clue extraction, search-query planning, map candidates, and report export tools to help investigators reason about and verify where a scene may have been captured.

> Important: GeoGuess is an investigation assistant, not an authority for final coordinates. AI outputs must be manually verified with maps, satellite imagery, historical imagery, and public sources before being treated as conclusions.

## Features

- **Image and video analysis**
  - Upload images or video assets.
  - Extract representative frames from videos as evidence.
  - Read EXIF GPS, capture time, and camera metadata when available.

- **Vision-model clue extraction**
  - Supports OpenAI-compatible APIs.
  - Extracts OCR text, visible labels, languages, scene features, spatial relationships, and inferred search terms.
  - Prioritizes map-verifiable physical evidence such as buildings, roofs, walls, roads, tracks, platforms, terrain, water bodies, shadows, and camera viewpoints.

- **Candidate geolocation and map verification**
  - Generates candidate coordinates, confidence, match scores, uncertainty, and verification checklists.
  - Provides Google Maps and Google Earth entry points.
  - Separates media watermarks/source text from real location evidence, reducing the risk of over-trusting logos or news-source labels.

- **Professional dark UI**
  - OSINT-inspired dark theme.
  - Status bar for asset name, model readiness, analysis progress, candidate count, start time, and elapsed time.

- **Report export and sharing**
  - Print / export to PDF.
  - Download Markdown reports.
  - Download standalone HTML reports.
  - Copy report content to the clipboard.

- **History management**
  - Stores recent investigation snapshots locally.
  - Reopen previous investigations, compare them with the current one, delete individual records, or clear all history.
  - History is stored in browser localStorage and is not uploaded remotely.

## Tech Stack

- Frontend: React 19, Vite, TypeScript
- Backend: Express, Multer, tsx
- Image processing: Sharp, exifr
- AI interface: OpenAI SDK / OpenAI-compatible APIs
- Testing: Vitest, Testing Library

## Requirements

Use a Node.js version compatible with the project:

```bash
Node.js ^20.19.0 or >=22.12.0
```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start development mode

```bash
npm run dev
```

This starts both:

- the Vite frontend server
- the Express backend API server

The backend listens on:

```text
127.0.0.1:8787
```

### 3. Open the app

Open the local URL printed by Vite in your browser.

## Workflow

1. Upload an image or video asset.
2. Configure the API Key, Base URL, and model name in the model settings panel.
3. Choose output language, geographic scope, and investigation constraints.
4. Click **Start Analysis**.
5. Review candidate locations, matched evidence, map links, and verification checklists.
6. Manually verify candidates with maps, satellite imagery, Google Earth, and public sources.
7. Export the report as PDF, Markdown, or HTML.

## Scripts

```bash
npm run dev        # Start frontend and backend development servers
npm run dev:web    # Start only the Vite frontend
npm run dev:server # Start only the backend API
npm run build      # Run TypeScript checks and build the frontend
npm run test       # Run tests
npm run test:run   # Run tests in CI-style mode
npm run preview    # Preview the production build
```

## API Key and Privacy Notes

- API keys are used only in the current browser session.
- Saved settings do not persist the API key or Base URL.
- Private OpenAI-compatible endpoints can be configured with the backend `OPENAI_BASE_URL` environment variable, or entered temporarily in the page settings.
- Uploaded assets are processed by the local backend.
- Investigation history is stored locally in browser localStorage.
- If you connect a third-party OpenAI-compatible service, images and prompts will be sent to that provider. Review the provider's privacy and data handling policies before use.

## Project Structure

```text
GeoGuess/
├── server/                 # Express backend, upload handling, video frames, investigation pipeline
│   ├── providers/          # Vision model, web candidate search, metadata providers
│   ├── imageAnalysis.ts
│   ├── investigationService.ts
│   └── index.ts
├── src/                    # React frontend and shared logic
│   ├── components/         # UI components
│   ├── shared/             # Types, reports, map links, query planning, etc.
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   └── theme-dark.css
├── package.json
├── README.md
└── README.en.md
```

## Safety and Compliance

GeoGuess is intended for learning, research, and legally authorized OSINT investigations. Do not use it for privacy invasion, stalking, harassment, unlawful surveillance, or other illegal activities. For military, government, corporate, or personal materials, follow applicable laws, platform policies, and ethical guidelines.

## Chinese README

中文说明请查看 [README.md](README.md).
