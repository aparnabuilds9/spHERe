/**
 * src/utils/geoService.js
 * 
 * Geocoding, reverse geocoding, and routing services.
 * Features:
 * - Debounced Nominatim queries (enforces >= 1000ms between calls to respect OSM usage policy)
 * - Safe district extraction from reverse geocoding
 * - OSRM route fetching with alternatives=true
 * - Resilient fallback route generation for Kanpur test corridors if OSRM is offline
 */

let lastNominatimCallTime = 0;

/**
 * Enforces a minimum delay of 1000ms between consecutive Nominatim requests.
 */
async function rateLimitNominatim() {
  const now = Date.now();
  const timeSinceLast = now - lastNominatimCallTime;
  if (timeSinceLast < 1050) {
    await new Promise((resolve) => setTimeout(resolve, 1050 - timeSinceLast));
  }
  lastNominatimCallTime = Date.now();
}

/**
 * Common Kanpur preset locations for quick selection and instant testing.
 */
export const KANPUR_PRESETS = [
  {
    name: 'Kanpur Central Railway Station',
    lat: 26.4539,
    lng: 80.3512,
    district: 'Kanpur Nagar',
  },
  {
    name: 'Rawatpur (via GT Road / Jarib Chowki)',
    lat: 26.478,
    lng: 80.312,
    district: 'Kanpur Nagar',
  },
  {
    name: 'Kakadeo Coaching Hub',
    lat: 26.483,
    lng: 80.298,
    district: 'Kanpur Nagar',
  },
  {
    name: 'IIT Kanpur Main Gate',
    lat: 26.5123,
    lng: 80.2329,
    district: 'Kanpur Nagar',
  },
  {
    name: 'Z Square Mall / Civil Lines',
    lat: 26.472,
    lng: 80.349,
    district: 'Kanpur Nagar',
  },
  {
    name: 'Govind Nagar Market',
    lat: 26.435,
    lng: 80.305,
    district: 'Kanpur Nagar',
  },
  {
    name: 'Rania Industrial Area (Kanpur Dehat)',
    lat: 26.448,
    lng: 80.125,
    district: 'Kanpur Dehat',
  },
];

/**
 * Searches Nominatim with rate limiting.
 */
export async function searchAddress(query) {
  if (!query || query.trim().length < 2) return [];

  try {
    await rateLimitNominatim();
    const endpoint = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}&addressdetails=1&limit=5&countrycodes=in`;

    const res = await fetch(endpoint, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) throw new Error(`Geocoding failed with status ${res.status}`);
    const data = await res.json();

    return data.map((item) => ({
      displayName: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      district:
        item.address?.state_district ||
        item.address?.county ||
        item.address?.city_district ||
        item.address?.city ||
        null,
    }));
  } catch (err) {
    console.warn('Nominatim search failed or offline:', err.message);
    // Return matching Kanpur presets as reliable offline fallback
    const qLower = query.toLowerCase();
    return KANPUR_PRESETS.filter((p) => p.name.toLowerCase().includes(qLower)).map(
      (p) => ({
        displayName: `${p.name}, Uttar Pradesh`,
        lat: p.lat,
        lng: p.lng,
        district: p.district,
      })
    );
  }
}

/**
 * Reverse geocodes lat/lng to detect district.
 */
export async function reverseGeocode(lat, lng) {
  try {
    await rateLimitNominatim();
    const endpoint = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;

    const res = await fetch(endpoint, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) throw new Error(`Reverse geocoding failed: ${res.status}`);
    const data = await res.json();
    const address = data.address || {};

    const detectedDistrict =
      address.state_district ||
      address.county ||
      address.city_district ||
      address.city ||
      null;

    return {
      displayName: data.display_name,
      district: detectedDistrict,
      address,
    };
  } catch (err) {
    console.warn('Reverse geocoding failed:', err.message);
    // Boundary check for Kanpur Nagar vs Dehat
    if (lat >= 26.35 && lat <= 26.65 && lng >= 80.20 && lng <= 80.50) {
      return { displayName: 'Kanpur, Uttar Pradesh', district: 'Kanpur Nagar' };
    }
    if (lat >= 26.20 && lat <= 26.65 && lng >= 79.70 && lng < 80.20) {
      return { displayName: 'Kanpur Dehat, Uttar Pradesh', district: 'Kanpur Dehat' };
    }
    return { displayName: 'Location', district: null };
  }
}

/**
 * Builds realistic synthetic routes between coordinates if OSRM is unreachable.
 * Ensures the primary route passes through the demo red cluster (Jarib Chowki / GT Road)
 * while the alternative takes the safer bypass route (Mall Road / Civil Lines).
 */
function generateFallbackRoutes(start, end) {
  // Direct route via GT Road / Jarib Chowki
  const directPath = [
    [start.lat, start.lng],
    [26.4550, 80.3420],
    [26.4582, 80.3285], // Center of red demo cluster
    [26.4600, 80.3270],
    [26.4635, 80.3180],
    [26.4710, 80.3140],
    [end.lat, end.lng],
  ];

  // Alternative safer route via Civil Lines / VIP Road
  const saferPath = [
    [start.lat, start.lng],
    [26.4620, 80.3530],
    [26.4710, 80.3500], // Civil Lines (safe, green)
    [26.4780, 80.3380], // VIP Road (safe, green)
    [26.4810, 80.3200], // Swaroop Nagar
    [26.4790, 80.3130],
    [end.lat, end.lng],
  ];

  return [
    {
      id: 'route-0',
      name: 'Primary: via GT Road (Direct)',
      coordinates: directPath,
      distanceMeters: 6200,
      durationSeconds: 960, // 16 mins
      isFallback: true,
    },
    {
      id: 'route-1',
      name: 'Alternative: via Civil Lines / VIP Rd',
      coordinates: saferPath,
      distanceMeters: 7400,
      durationSeconds: 1200, // 20 mins (+4 mins, +1.2 km)
      isFallback: true,
    },
  ];
}

/**
 * Fetches driving routes from the public OSRM API with alternatives=true.
 */
export async function fetchOsrmRoutes(start, end) {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&alternatives=true&steps=true`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`OSRM responded with status ${res.status}`);
    }

    const data = await res.json();
    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes found by OSRM');
    }

    return data.routes.map((r, index) => {
      // OSRM GeoJSON is [lng, lat], convert to Leaflet's [lat, lng]
      const latLngCoords = r.geometry.coordinates.map((c) => [c[1], c[0]]);
      return {
        id: `route-${index}`,
        name: index === 0 ? 'Fastest Route' : `Alternative Route ${index}`,
        coordinates: latLngCoords,
        distanceMeters: Math.round(r.distance),
        durationSeconds: Math.round(r.duration),
        isFallback: false,
      };
    });
  } catch (err) {
    console.warn('OSRM routing failed or timed out. Using built-in local route model:', err.message);
    return generateFallbackRoutes(start, end);
  }
}
