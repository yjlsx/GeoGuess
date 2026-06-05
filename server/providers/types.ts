import type {
  Candidate,
  ExtractedClues,
  MapFeatureProfile,
  MetadataEvidence,
  SearchQuery,
  UserScope,
  VisionModelConfig
} from "../../src/shared/types";

export type VisionRequest = {
  imagePath: string;
  userScope: UserScope;
  manualClues?: ExtractedClues;
  visionConfig?: VisionModelConfig;
};

export type VisionProvider = {
  extractClues(request: VisionRequest): Promise<ExtractedClues>;
};

export type SearchProvider = {
  findCandidates(args: {
    userScope: UserScope;
    clues: ExtractedClues;
    mapFeatureProfile: MapFeatureProfile;
    queries: SearchQuery[];
  }): Promise<Candidate[]>;
};

export type MetadataRequest = {
  mediaPaths: string[];
};

export type MetadataProvider = {
  extractMetadata(request: MetadataRequest): Promise<MetadataEvidence[]>;
};
