import type { VisionModelConfig } from "./types";

type CoordinateSystem = NonNullable<VisionModelConfig["coordinateSystem"]>;

type Coordinate = {
  latitude: number;
  longitude: number;
};

const pi = Math.PI;
const axis = 6378245.0;
const eccentricity = 0.00669342162296594323;
const bdFactor = (pi * 3000.0) / 180.0;

function outOfChina(latitude: number, longitude: number) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLatitude(x: number, y: number) {
  let result = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  result += ((20.0 * Math.sin(6.0 * x * pi) + 20.0 * Math.sin(2.0 * x * pi)) * 2.0) / 3.0;
  result += ((20.0 * Math.sin(y * pi) + 40.0 * Math.sin((y / 3.0) * pi)) * 2.0) / 3.0;
  result += ((160.0 * Math.sin((y / 12.0) * pi) + 320 * Math.sin((y * pi) / 30.0)) * 2.0) / 3.0;
  return result;
}

function transformLongitude(x: number, y: number) {
  let result = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  result += ((20.0 * Math.sin(6.0 * x * pi) + 20.0 * Math.sin(2.0 * x * pi)) * 2.0) / 3.0;
  result += ((20.0 * Math.sin(x * pi) + 40.0 * Math.sin((x / 3.0) * pi)) * 2.0) / 3.0;
  result += ((150.0 * Math.sin((x / 12.0) * pi) + 300.0 * Math.sin((x / 30.0) * pi)) * 2.0) / 3.0;
  return result;
}

function wgs84ToGcj02(coordinate: Coordinate): Coordinate {
  if (outOfChina(coordinate.latitude, coordinate.longitude)) {
    return coordinate;
  }

  let deltaLatitude = transformLatitude(coordinate.longitude - 105.0, coordinate.latitude - 35.0);
  let deltaLongitude = transformLongitude(coordinate.longitude - 105.0, coordinate.latitude - 35.0);
  const radLatitude = (coordinate.latitude / 180.0) * pi;
  let magic = Math.sin(radLatitude);
  magic = 1 - eccentricity * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  deltaLatitude = (deltaLatitude * 180.0) / (((axis * (1 - eccentricity)) / (magic * sqrtMagic)) * pi);
  deltaLongitude = (deltaLongitude * 180.0) / ((axis / sqrtMagic) * Math.cos(radLatitude) * pi);

  return {
    latitude: coordinate.latitude + deltaLatitude,
    longitude: coordinate.longitude + deltaLongitude
  };
}

function gcj02ToWgs84(coordinate: Coordinate): Coordinate {
  if (outOfChina(coordinate.latitude, coordinate.longitude)) {
    return coordinate;
  }

  const gcj = wgs84ToGcj02(coordinate);
  return {
    latitude: coordinate.latitude * 2 - gcj.latitude,
    longitude: coordinate.longitude * 2 - gcj.longitude
  };
}

function bd09ToGcj02(coordinate: Coordinate): Coordinate {
  const x = coordinate.longitude - 0.0065;
  const y = coordinate.latitude - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * bdFactor);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * bdFactor);
  return {
    latitude: z * Math.sin(theta),
    longitude: z * Math.cos(theta)
  };
}

export function normalizeCoordinateToWgs84(
  coordinate: Coordinate,
  coordinateSystem: CoordinateSystem = "WGS84 (EPSG:4326)"
): Coordinate & { convertedFrom?: CoordinateSystem } {
  if (coordinateSystem === "GCJ-02") {
    if (outOfChina(coordinate.latitude, coordinate.longitude)) {
      return coordinate;
    }
    const converted = gcj02ToWgs84(coordinate);
    return { ...converted, convertedFrom: coordinateSystem };
  }

  if (coordinateSystem === "BD-09") {
    if (outOfChina(coordinate.latitude, coordinate.longitude)) {
      return coordinate;
    }
    const converted = gcj02ToWgs84(bd09ToGcj02(coordinate));
    return { ...converted, convertedFrom: coordinateSystem };
  }

  return coordinate;
}
