import { buildSearchQueries } from "../src/shared/queryPlanner";
import { buildReports } from "../src/shared/reportGenerator";
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
