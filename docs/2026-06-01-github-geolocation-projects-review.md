# GitHub Geolocation Projects Review

Date: 2026-06-01

## Goal

Improve ImageGeoFinder from a single-pass image-to-search prototype into a usable image/video geolocation workbench that can produce several map-verifiable candidate coordinates, even when exact identification is uncertain.

## Reviewed Projects

### GeoCLIP

Repository: https://github.com/VicenteVivan/geo-clip

Useful idea: run an image geolocation model as a prior generator. GeoCLIP exposes a `predict(image_path, top_k=5)` API that returns top GPS predictions and probabilities. This is a good fit for a sidecar provider because ImageGeoFinder is Node/TypeScript while GeoCLIP is Python/PyTorch.

Fusion plan:

- Add an optional `GeoPriorProvider` interface returning coarse GPS priors.
- Call it before web search.
- Use the top priors to constrain search by country/region or radius when the user does not provide scope.
- Never present model priors as final truth; convert them into candidate seeds with low confidence until map/search evidence matches.

Why not copy directly: the repo is a research/Python package and model runtime dependency is heavy for the current web app. A sidecar keeps the product usable without forcing GPU/PyTorch into the main server.

### PIGEON

Repository: https://github.com/LukasHaas/PIGEON

Useful idea: semantic geocells and geocell refinement. PIGEON/PIGEOTTO treat location prediction as coarse-to-fine classification and refinement rather than direct exact-coordinate guessing. The GitHub release is mainly for academic validation and does not ship the weights/datasets needed for drop-in production use.

Fusion plan:

- Add a `geoPrior` object to investigations with country/region/geocell hypotheses.
- Group candidate coordinates by region/geocell before ranking.
- Make the UI show "coarse prior -> searched candidates -> verified evidence" so users understand when coordinates are model guesses versus sourced candidates.

Why not copy directly: the repository itself says geocell shapes, coordinates, datasets, and weights are not provided, so it is not a practical drop-in dependency.

### REVERSE

Repository: https://github.com/yonglleee/REVERSE

Useful idea: agentic evidence search. REVERSE describes an iterative workflow: zoom into image regions, search with image crops, query text search engines, and synthesize evidence into GPS predictions. This matches the product gap in ImageGeoFinder: our current pipeline extracts global clues and runs web search, but it does not yet choose high-value crop regions or reject distractor evidence strongly enough.

Fusion plan:

- Implement "evidence regions" for each uploaded image/video frame:
  - platform/road/track/roof/signage/object crops
  - OCR/sign crops
  - skyline or terrain crops
- For each region, produce:
  - crop path
  - detected feature labels
  - search queries
  - search observations
  - whether the region supports or contradicts each candidate
- Rank candidates by region-level support instead of only by global prompt output.

Why not copy directly: REVERSE is a training/evaluation research stack around verl, offline search caches, SFT/RL data, and Python tooling. We should borrow the workflow, not import the stack.

### OSINT Image Research Lists

Repositories:

- https://github.com/The-Osint-Toolbox/Image-Research-OSINT
- https://github.com/jivoi/awesome-osint
- https://github.com/topics/reverse-image-search

Useful idea: geolocation is rarely solved by one model call. Practical workflows combine EXIF/metadata, reverse image search, source tracing, map layers, Street View/Mapillary/KartaView, historical imagery, and manual evidence notes.

Fusion plan:

- Add an `OsintLinkSet` per investigation:
  - Google Lens / Bing / Yandex / TinEye URLs for uploaded frames or crops when a public URL is available.
  - EXIF/GPS/date extraction when metadata exists.
  - Mapillary/KartaView/OpenStreetMap/OpenRailwayMap links derived from candidate coordinates.
  - SunCalc link when shadows or capture time are available.
- Add "manual external evidence" fields so users can paste links found from reverse search and attach them to candidates.

Why not copy directly: many tools are web services or browser extensions. ImageGeoFinder should orchestrate and record their outputs rather than scraping fragile third-party pages by default.

## Recommended Architecture

### Phase 1: Candidate Discovery Backbone

Add provider interfaces:

- `MetadataProvider`: extracts EXIF GPS/date/camera data from images and selected video frames.
- `GeoPriorProvider`: optional coarse AI prior from GeoCLIP or another model.
- `RegionEvidenceProvider`: creates important crop regions and labels them.
- `ExternalSearchProvider`: runs text/image/crop searches and returns observations.
- `CandidateFusionProvider`: merges priors, searches, and evidence regions into ranked candidates.

Keep existing OpenAI web search as one implementation of `ExternalSearchProvider`, not the whole product.

### Phase 2: Evidence Regions

Move from "one image -> one clue blob" to "many regions -> evidence matrix":

- Whole frame: scene type, terrain, architecture.
- Text/sign region: OCR and language.
- Infrastructure region: roads, tracks, stations, poles, fences.
- Building region: roof color, facade, footprint clues.
- Foreground/background relation: camera direction and relative layout.

Every candidate should show which regions support it, which contradict it, and which are unverified.

### Phase 3: Coarse-To-Fine Search

Use this flow:

1. Metadata first: if GPS exists, show it as direct metadata evidence.
2. Geo prior second: predict coarse countries/regions/geocells.
3. Text/web search third: search visual features within coarse scope.
4. Region/crop search fourth: search distinctive crops and signs.
5. Candidate fusion fifth: output 3-5 candidates with scores and missing checks.
6. Human verification last: user marks candidates kept/excluded/confirmed.

### Phase 4: Practical OSINT Workbench

Add external verification helpers:

- reverse image search launch links
- OpenStreetMap/OpenRailwayMap nearby feature links
- Mapillary/KartaView street-level imagery links
- SunCalc/shadow check links
- manual evidence attachment per candidate

## Immediate Implementation Order

1. Metadata provider: cheap, deterministic, high signal when GPS/date exists.
2. Region evidence model: generate named crop regions and attach them to clue extraction.
3. Candidate fusion scoring: move scoring out of the LLM-only response into deterministic weighted scoring.
4. Optional GeoCLIP sidecar: add only after deterministic backbone is in place.
5. Reverse image/crop search launch links: useful even before full API automation.

## Product Principle

The app should not claim exact location unless evidence proves it. When exact proof is absent, it should still produce useful candidate coordinates by clearly separating:

- direct metadata
- model prior
- map-verifiable visual matches
- OCR/source hints
- unresolved contradictions
- manual verification status
