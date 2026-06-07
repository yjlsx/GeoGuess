import { describe, expect, it } from "vitest";
import {
  hasMapVerifiableWord,
  isMediaOverlayOnly,
  isSourceOnlyClue,
  mediaSourceLabel,
  sourceOnlyLabel
} from "../../src/shared/clueClassification";

describe("clueClassification", () => {
  it("normalizes known media source labels", () => {
    expect(mediaSourceLabel("cctv-7")).toBe("CCTV 7");
    expect(mediaSourceLabel("CCTV.com lower-right bug")).toBe("CCTV.com");
    expect(mediaSourceLabel("国防军事频道")).toBe("国防军事");
  });

  it("separates media overlays from map-verifiable physical clues", () => {
    expect(isMediaOverlayOnly("top-left logo bug")).toBe(true);
    expect(isMediaOverlayOnly("lower-right timestamp overlays the road")).toBe(true);
    expect(isMediaOverlayOnly("rail platform beside blue warehouse")).toBe(false);
    expect(hasMapVerifiableWord("rail platform beside blue warehouse")).toBe(true);
    expect(hasMapVerifiableWord("same broadcast clip")).toBe(false);
  });

  it("labels source-only clues without excluding physical evidence", () => {
    expect(sourceOnlyLabel("CCTV 7")).toBe("CCTV 7");
    expect(sourceOnlyLabel("right-corner watermark over road")).toBe("right-corner watermark over road");
    expect(isSourceOnlyClue("CCTV 7")).toBe(true);
    expect(isSourceOnlyClue("CCTV 7 report showing rail platform")).toBe(false);
  });
});
