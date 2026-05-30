export function formatCoordinate(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function buildGoogleMapsLink(latitude: number, longitude: number) {
  const query = encodeURIComponent(`${latitude.toFixed(5)},${longitude.toFixed(5)}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function buildGoogleEarthHint(latitude: number, longitude: number) {
  return `Copy into Google Earth search: ${formatCoordinate(latitude, longitude)}`;
}
