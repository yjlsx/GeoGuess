export function formatCoordinate(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function buildGoogleMapsLink(latitude: number, longitude: number) {
  const query = encodeURIComponent(`${latitude.toFixed(5)},${longitude.toFixed(5)}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function buildGoogleMapsEmbedUrl(latitude: number, longitude: number) {
  const query = encodeURIComponent(`${latitude.toFixed(5)},${longitude.toFixed(5)}`);
  return `https://maps.google.com/maps?q=${query}&z=16&output=embed`;
}

export function buildGoogleEarthHint(latitude: number, longitude: number) {
  return `复制到 Google Earth 搜索：${formatCoordinate(latitude, longitude)}`;
}

export function buildGoogleEarthWebUrl(latitude: number, longitude: number) {
  const query = encodeURIComponent(`${latitude.toFixed(5)},${longitude.toFixed(5)}`);
  return `https://earth.google.com/web/search/${query}`;
}
