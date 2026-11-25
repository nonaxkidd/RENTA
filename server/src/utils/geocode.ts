export interface MapPoint {
  lat: number;
  lng: number;
}

/** Places the public pin on the barangay in Calapan, so owners do not type coordinates. */
export async function geocodeInCalapan(barangay: string): Promise<MapPoint | null> {
  const query = `${barangay}, Calapan City, Oriental Mindoro, Philippines`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "RENTA-Calapan/1.0 (student capstone; admin@renta.local)",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Geocoder responded with ${response.status}`);
  }

  const results = (await response.json()) as { lat?: string; lon?: string }[];
  const hit = results[0];
  if (!hit?.lat || !hit?.lon) return null;

  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}
