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
