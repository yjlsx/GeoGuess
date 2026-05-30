export type CropMode = "full" | "upper_half" | "manual";
export type Confidence = "high" | "medium" | "low";
export type OutputLanguage = "zh-CN" | "en-US";

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

export type SearchProcessStep = {
  title: string;
  query?: string;
  rationale: string;
  status: "planned" | "previewed" | "needs-earth-check";
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
  mapPreview: {
    googleMapsEmbedUrl: string;
    googleEarthWebUrl: string;
    screenshotStatus: string;
    notes: string[];
  };
  matchingEvidence: string[];
  uncertainty: string[];
  sources: SourceEvidence[];
  earthVerificationChecklist: string[];
};

export type ImageAnalysis = {
  recognitionMode: "local-metadata" | "vision-model";
  observations: string[];
  limitations: string[];
};

export type SeasonalAnalysis = {
  captureDateHint: string;
  inferredSeason: string;
  confidence: Confidence;
  reasoning: string[];
  mapComparisonNotes: string[];
};

export type ReportInput = {
  outputLanguage?: OutputLanguage;
  userScope: UserScope;
  extractedClues: ExtractedClues;
  searchQueries: SearchQuery[];
  searchProcess?: SearchProcessStep[];
  imageAnalysis?: ImageAnalysis;
  seasonalAnalysis?: SeasonalAnalysis;
  candidates: Candidate[];
};

export type Investigation = {
  id: string;
  outputLanguage: OutputLanguage;
  image: {
    originalPath: string;
    cropPath?: string;
    cropMode: CropMode;
  };
  userScope: UserScope;
  extractedClues: ExtractedClues;
  searchQueries: SearchQuery[];
  searchProcess: SearchProcessStep[];
  imageAnalysis: ImageAnalysis;
  seasonalAnalysis: SeasonalAnalysis;
  candidates: Candidate[];
  report: {
    summaryMarkdown: string;
    fullMarkdown: string;
    createdAt: string;
  };
};
