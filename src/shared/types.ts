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
  regionScope?: "custom" | "global" | "country";
  boundaryMode?: "rectangle" | "polygon";
  country?: string;
  region?: string;
  coordinateBox?: CoordinateBox;
  polygonCoordinates?: string;
  facilityType?: string;
  source?: string;
  dateOrTimeHint?: string;
  notes?: string;
};

export type VisionModelConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  matchingThreshold?: number;
  maxCandidates?: number;
  showLowConfidenceCandidates?: boolean;
  maxLowConfidenceCandidates?: number;
  coordinateSystem?: "WGS84 (EPSG:4326)" | "GCJ-02" | "BD-09";
};

export type VisionConfigProfile = {
  id: string;
  name: string;
  config: VisionModelConfig;
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

export type MapFeatureProfile = {
  primaryFeatures: string[];
  spatialRelationships: string[];
  viewpointConstraints: string[];
  auxiliaryTextClues: string[];
  excludedSourceOnlyClues: string[];
  searchInstruction: string;
};

export type MetadataEvidence = {
  sourcePath: string;
  gps?: {
    latitude: number;
    longitude: number;
  };
  capturedAt?: string;
  camera?: string;
  evidenceType: "exif";
  notes: string[];
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

export type EvidenceImageAttachment = {
  name: string;
  dataUrl: string;
  mediaType: string;
};

export type FeatureMatchAiVerification = {
  status: "supports" | "contradicts" | "inconclusive";
  confidence: Confidence;
  rationale: string;
  checkedAt?: string;
  model?: string;
};

export type FeatureMatch = {
  imageFeature: string;
  mapFeature: string;
  verification: string;
  imageAnnotation?: string;
  mapAnnotation?: string;
  evidenceLink?: string;
  mapScreenshotUrl?: string;
  mapScreenshotAttachment?: EvidenceImageAttachment;
  earthImageDate?: string;
  aiVerification?: FeatureMatchAiVerification;
  status: "matched" | "partial" | "unverified" | "mismatch";
};

export type CandidateManualVerdict = {
  status: "unreviewed" | "confirmed" | "kept" | "excluded";
  rationale?: string;
};

export type OsintLink = {
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
  matchScore?: number;
  matchedFeatures?: string[];
  featureMatches?: FeatureMatch[];
  manualVerdict?: CandidateManualVerdict;
  missingOrUnverifiedFeatures?: string[];
  viewpointNotes?: string[];
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
  osintLinks?: OsintLink[];
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
  mapFeatureProfile?: MapFeatureProfile;
  metadataEvidence?: MetadataEvidence[];
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
    sourcePaths?: string[];
    evidencePaths?: string[];
  };
  userScope: UserScope;
  extractedClues: ExtractedClues;
  mapFeatureProfile: MapFeatureProfile;
  metadataEvidence: MetadataEvidence[];
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
