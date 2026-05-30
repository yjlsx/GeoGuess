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
