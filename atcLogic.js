import { getLiveFlights } from "./infiniteFlight.js";

export async function handleATC(command) {
  if (!command) return "Say again.";

  const [action, callsign] = command.split(" ");

  if (action === "radar" && callsign) {
    const flights = await getLiveFlights();
    const flight = flights.find((f) => f.callsign === callsign);

    if (!flight) {
      return "Negative radar contact.";
    }

    return `Radar contact ${flight.callsign}, altitude ${Math.round(
      flight.altitude,
    )} feet, ground speed ${Math.round(flight.groundSpeed)} knots.`;
  }

  return "Unable to comply. Say again.";
}
