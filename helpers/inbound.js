import { getAirportCoords, distanceNm } from "./airport.js";
import { getGTADS } from "./atc.js";

export async function buildInboundStats(world, flights, getAirportInfo) {
  const flightMap = new Map(flights.map((f) => [f.flightId, f]));

  const candidates = world
    .filter((a) => a.inboundFlightsCount > 0)
    .sort((a, b) => b.inboundFlightsCount - a.inboundFlightsCount)
    .slice(0, 20);

  const stats = [];

  for (const airport of candidates) {
    const coords = await getAirportCoords(airport.airportIcao, getAirportInfo);

    if (!coords) continue;

    let next20 = 0;
    let next60 = 0;

    for (const flightId of airport.inboundFlights) {
      const flight = flightMap.get(flightId);

      if (!flight) continue;
      if (flight.speed < 100) continue;

      const distance = distanceNm(
        flight.latitude,
        flight.longitude,
        coords.lat,
        coords.lon,
      );

      const eta = (distance / flight.speed) * 60;

      if (eta <= 20) next20++;
      else if (eta <= 60) next60++;
    }

    stats.push({
      icao: airport.airportIcao,
      inbound: airport.inboundFlightsCount,
      outbound: airport.outboundFlightsCount,
      next20,
      next60,
      gtads: getGTADS(airport.atcFacilities),
    });
  }

  return stats;
}
