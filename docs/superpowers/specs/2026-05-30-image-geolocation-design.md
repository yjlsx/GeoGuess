# Image Geolocation Assistant Design

## Purpose

Build a local web tool that helps locate where an image was taken by combining user-provided geographic constraints, AI visual analysis, public web search, and map/Google Earth verification guidance.

The tool is designed for cases where the user often has only the upper half of a news or video screenshot. The output should not pretend to be certain when evidence is weak. It should provide candidate coordinates, confidence, source evidence, and a clear checklist for verifying each candidate in Google Earth or satellite imagery.

## Target Workflow

1. The user uploads an image.
2. The user optionally provides known scope information:
   - Country
   - Region, province, city, border area, or free-text geographic description
   - Coordinate bounding box
   - Facility type, such as railway station, airport, port, camp, training ground, or depot
   - Source, time, title, or social media context
   - Notes such as "likely Mongolia" or "only upper half of the image is available"
3. The system extracts visual and textual clues.
4. The system turns clues and scope into search hypotheses.
5. The system searches public sources and produces candidate locations.
6. The system ranks candidates and generates a report.
7. The user opens map or Google Earth links and verifies the candidates using the provided checklist.

## Product Positioning

The first version is a geolocation assistance tool, not an authoritative one-click locator.

Results are grouped by confidence:

- High confidence: multiple independent evidence types agree.
- Medium confidence: plausible match with some missing or ambiguous evidence.
- Low confidence: weak match, useful mainly as a lead.

The UI must clearly distinguish observed facts, search-derived evidence, and model inference.

## First-Version Approach

Use a hybrid approach:

- AI visual analysis for extracting clues from the image.
- Public web search for narrowing possible locations.
- User-provided scope to reduce the search area.
- Human-verifiable Google Earth and satellite-image checklists.

The system should also include a manual fallback mode. If no AI API key is configured, the user can enter OCR text, visible features, and suspected location details manually; the tool still generates search queries, candidate reports, and verification checklists.

## Core Modules

### Image Input

Responsibilities:

- Upload and preview an image.
- Support screenshots, cropped images, and video frames.
- Let the user analyze the full image, upper half, or a manually selected crop.
- Store the original image and the selected analysis region with the investigation.

### Scope Constraints

Responsibilities:

- Capture flexible user-provided location constraints.
- Support country, region, coordinate bounding box, facility type, source/time, and free-text notes.
- Treat scope as a strong hint, not an absolute truth.
- If strong evidence points outside the provided scope, report it separately as an out-of-scope candidate.

The first version should support text fields and coordinate bounding boxes. Map drawing can be added later.

### Visual Clue Extraction

Responsibilities:

- Extract OCR text.
- Detect language, visible logos, watermarks, channel identifiers, and captions.
- Describe visible geographic and built-environment features:
  - Railways
  - Roads
  - Stations and platforms
  - Industrial or military-looking buildings
  - Towers, poles, walls, yards, open ground
  - Water, mountains, fields, desert, grassland, urban density
- Describe spatial relationships that are useful for satellite verification, such as "railway runs horizontally across the foreground" or "station building appears north of the tracks."

When AI is unavailable, the UI exposes manual fields for the same clue categories.

### Search and Candidate Generation

Responsibilities:

- Convert extracted clues and scope into multilingual search queries.
- Search public web pages, images, maps, and place references where available.
- Produce 3-5 candidate locations when evidence allows.
- Preserve source links and reasoning for every candidate.

Each candidate should include:

- Latitude and longitude
- Name or description of the location
- Confidence level
- Map link
- Search/source links
- Matching evidence
- Contradicting or uncertain evidence

### Map and Google Earth Verification

Responsibilities:

- Generate Google Maps links for each coordinate.
- Provide coordinates in copyable form for Google Earth.
- Explain what the site should look like from above.
- Suggest historical imagery checks when relevant.

Verification checklists should translate image perspective into satellite-view expectations. Example checks:

- Track direction and number of tracks
- Whether a station building is north or south of the railway
- Platform length and shape
- Road and dirt-track patterns around the site
- Roof colors and building alignment
- Towers, poles, walls, open yards, or fenced areas
- Land cover such as desert, grassland, fields, or water
- Whether features appear, disappear, or change across historical imagery

### Report

Responsibilities:

- Show a concise result first.
- Let the user expand into the full investigation details.
- Export Markdown and JSON.

The concise report should show:

- Candidate coordinates
- Confidence
- One-click map links
- Top matching clues
- Main uncertainty

The expanded report should show:

- Extracted image clues
- Search queries used
- Source links
- Candidate-by-candidate evidence
- Rejected candidates and reasons
- Google Earth verification checklist
- Notes about uncertainty and assumptions

## Data Model

Each investigation is stored as one structured object:

```ts
type Investigation = {
  id: string;
  image: {
    originalPath: string;
    cropPath?: string;
    cropMode: "full" | "upper_half" | "manual";
  };
  userScope: {
    country?: string;
    region?: string;
    coordinateBox?: {
      minLat: number;
      minLon: number;
      maxLat: number;
      maxLon: number;
    };
    facilityType?: string;
    source?: string;
    dateOrTimeHint?: string;
    notes?: string;
  };
  extractedClues: {
    ocrText: string[];
    visibleLabels: string[];
    languages: string[];
    sceneFeatures: string[];
    spatialRelationships: string[];
    inferredSearchTerms: string[];
  };
  searchQueries: Array<{
    query: string;
    language?: string;
    purpose: string;
  }>;
  candidates: Array<{
    id: string;
    name?: string;
    latitude: number;
    longitude: number;
    confidence: "high" | "medium" | "low";
    mapLinks: {
      googleMaps: string;
      googleEarthHint?: string;
    };
    matchingEvidence: string[];
    uncertainty: string[];
    sources: Array<{
      title: string;
      url: string;
      note: string;
    }>;
    earthVerificationChecklist: string[];
  }>;
  report: {
    summaryMarkdown: string;
    fullMarkdown: string;
    createdAt: string;
  };
};
```

## User Interface

The first version should be a single investigation workspace.

Left side:

- Image upload and preview
- Crop mode selector: full, upper half, manual crop
- Scope fields
- Source/time/facility fields
- Manual clue fields for fallback mode
- Analyze button

Right side:

- Extracted clue summary
- Candidate list sorted by confidence
- Candidate detail panel
- Map links and copyable coordinates
- Export buttons

Candidate cards should support quick scanning. A card should show coordinate, confidence, key evidence, map link, and one main uncertainty. The expanded view should contain the full reasoning chain.

## Error Handling and Low-Confidence Behavior

The tool must avoid overclaiming.

Rules:

- If clues are too weak, do not force coordinates.
- If the user scope might be wrong, show in-scope and out-of-scope candidates separately.
- If candidates conflict, list the conflict points.
- If evidence depends on a model inference, label it as inference.
- If a source is missing or unreliable, mark that clearly.
- If satellite or historical imagery is needed to confirm a candidate, state that verification is required.

## Future Enhancements

Later versions may add:

- Map-based bounding-box drawing.
- Batch comparison of satellite tiles within a user-selected area.
- Case library for known solved examples.
- Side-by-side image and satellite-view annotation.
- Timeline comparison using historical imagery metadata where accessible.
- Team review notes and candidate voting.

