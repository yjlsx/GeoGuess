import { describe, expect, it } from "vitest";
import { normalizeCoordinateToWgs84 } from "../../src/shared/coordinateSystems";

describe("normalizeCoordinateToWgs84", () => {
  it("keeps WGS84 coordinates unchanged", () => {
    const coordinate = normalizeCoordinateToWgs84(
      { latitude: 35.6895, longitude: 139.6917 },
      "WGS84 (EPSG:4326)"
    );

    expect(coordinate.latitude).toBe(35.6895);
    expect(coordinate.longitude).toBe(139.6917);
    expect(coordinate.convertedFrom).toBeUndefined();
  });

  it("converts GCJ-02 coordinates in China to WGS84", () => {
    const coordinate = normalizeCoordinateToWgs84({ latitude: 39.910226, longitude: 116.403713 }, "GCJ-02");

    expect(coordinate.latitude).toBeCloseTo(39.90882, 4);
    expect(coordinate.longitude).toBeCloseTo(116.39747, 4);
    expect(coordinate.convertedFrom).toBe("GCJ-02");
  });

  it("converts BD-09 coordinates in China to WGS84", () => {
    const coordinate = normalizeCoordinateToWgs84({ latitude: 39.916566, longitude: 116.410086 }, "BD-09");

    expect(coordinate.latitude).toBeCloseTo(39.90882, 3);
    expect(coordinate.longitude).toBeCloseTo(116.39747, 3);
    expect(coordinate.convertedFrom).toBe("BD-09");
  });

  it("does not mark out-of-China GCJ-02 or BD-09 coordinates as converted", () => {
    const gcjCoordinate = normalizeCoordinateToWgs84({ latitude: 35.6895, longitude: 139.6917 }, "GCJ-02");
    const bdCoordinate = normalizeCoordinateToWgs84({ latitude: 35.6895, longitude: 139.6917 }, "BD-09");

    expect(gcjCoordinate).toMatchObject({ latitude: 35.6895, longitude: 139.6917 });
    expect(gcjCoordinate.convertedFrom).toBeUndefined();
    expect(bdCoordinate).toMatchObject({ latitude: 35.6895, longitude: 139.6917 });
    expect(bdCoordinate.convertedFrom).toBeUndefined();
  });
});
