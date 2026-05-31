import { describe, expect, it } from "vitest";
import {
  buildGoogleEarthHint,
  buildGoogleEarthWebUrl,
  buildGoogleMapsEmbedUrl,
  buildGoogleMapsLink,
  formatCoordinate
} from "../../src/shared/mapLinks";

describe("mapLinks", () => {
  it("formats coordinates with five decimal places", () => {
    expect(formatCoordinate(42.259674, 112.756231)).toBe("42.25967, 112.75623");
  });

  it("builds a Google Maps query link", () => {
    expect(buildGoogleMapsLink(42.25967, 112.75623)).toBe(
      "https://www.google.com/maps/search/?api=1&query=42.25967%2C112.75623"
    );
  });

  it("builds a Google Earth copy hint", () => {
    expect(buildGoogleEarthHint(42.25967, 112.75623)).toBe(
      "复制到 Google Earth 搜索：42.25967, 112.75623"
    );
  });

  it("builds embeddable Google Maps and Google Earth verification URLs", () => {
    expect(buildGoogleMapsEmbedUrl(42.25967, 112.75623)).toBe(
      "https://maps.google.com/maps?q=42.25967%2C112.75623&t=k&z=16&output=embed"
    );
    expect(buildGoogleEarthWebUrl(42.25967, 112.75623)).toBe(
      "https://earth.google.com/web/search/42.25967%2C112.75623"
    );
  });
});
