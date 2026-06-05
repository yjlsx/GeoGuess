import { describe, expect, it } from "vitest";
import { buildCandidateOsintLinks, buildReverseImageSearchLinks } from "../../src/shared/osintLinks";

describe("osintLinks", () => {
  it("builds map and street-level verification links for candidate coordinates", () => {
    const links = buildCandidateOsintLinks({
      latitude: 42.25967,
      longitude: 112.75623,
      label: "railway station"
    });

    expect(links.map((link) => link.title)).toEqual([
      "OpenStreetMap nearby",
      "OpenRailwayMap nearby",
      "Mapillary street-level imagery",
      "KartaView street-level imagery",
      "SunCalc shadow check"
    ]);
    expect(links[0].url).toContain("openstreetmap.org");
    expect(links[0].url).toContain("mlat=42.25967");
    expect(links[1].url).toContain("openrailwaymap.org");
    expect(links[2].url).toContain("mapillary.com");
    expect(links[3].url).toContain("kartaview.org");
    expect(links[4].url).toContain("suncalc.org");
    expect(links.every((link) => link.note.toLowerCase().includes("railway station"))).toBe(true);
  });

  it("builds reverse image search launch links when an image URL is public", () => {
    const links = buildReverseImageSearchLinks("https://example.test/frame.jpg");

    expect(links.map((link) => link.title)).toEqual([
      "Google Lens reverse image search",
      "Bing Visual Search",
      "Yandex Images",
      "TinEye reverse image search"
    ]);
    expect(links[0].url).toContain(encodeURIComponent("https://example.test/frame.jpg"));
    expect(links[3].url).toContain("tineye.com");
  });
});
