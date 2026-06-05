import type { SearchProvider } from "./types";

export const mockSearchProvider: SearchProvider = {
  async findCandidates() {
    return [];
  }
};
