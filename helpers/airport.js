const airportCache = new Map();

export async function getAirportCoords(icao, getAirportInfo) {
  const key = icao.toUpperCase();

  if (airportCache.has(key)) {
    return airportCache.get(key);
  }

  const airport = await getAirportInfo(key);

  if (!airport) return null;

  const coords = {
    lat: airport.latitude,
    lon: airport.longitude,
  };

  airportCache.set(key, coords);

  return coords;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

export function distanceNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065;

  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
