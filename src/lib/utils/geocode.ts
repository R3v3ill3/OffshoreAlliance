interface GeocodingResult {
  lat: number;
  lng: number;
  displayName: string;
}

export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  const query = encodeURIComponent(address + ", Australia");
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&countrycodes=au&limit=1`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "OffshoreAllianceDB/1.0" },
    });
    const data = await response.json();
    if (data.length === 0) return null;

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  } catch {
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "OffshoreAllianceDB/1.0" },
    });
    const data = await response.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}

export async function batchGeocode(
  addresses: { id: number; address: string }[]
): Promise<{ id: number; lat: number; lng: number; displayName: string }[]> {
  const results: { id: number; lat: number; lng: number; displayName: string }[] = [];

  for (const item of addresses) {
    const result = await geocodeAddress(item.address);
    if (result) {
      results.push({ id: item.id, ...result });
    }
    // Nominatim rate limit: max 1 request per second
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  return results;
}
