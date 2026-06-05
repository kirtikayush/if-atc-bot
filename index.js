import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import {
  getATIS,
  getActiveATC,
  getSessionId,
  getWorldOverview,
  getFlights,
  getAirportInfo,
} from "./infiniteFlight.js";
import { parseATIS } from "./atisParser.js";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const ATC_CHANNEL_ID = process.env.ATC_CHANNEL_ID;

const airportCache = new Map();

async function getAirportCoords(icao) {
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

function distanceNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065;

  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getGTADS(atcFacilities = []) {
  const types = atcFacilities.map((f) => f.type);

  let result = "";

  if (types.includes(0)) result += "G";
  if (types.includes(1)) result += "T";
  if (types.includes(4)) result += "A";
  if (types.includes(5)) result += "D";

  return result || "—";
}
// =====================
// ATC HELPERS
// =====================

const ATC_TYPE_MAP = {
  0: "GND",
  1: "TWR",
  2: "UNICOM",
  3: "CLR",
  4: "APP",
  5: "DEP",
  6: "CTR",
  7: "ATIS",
};

function formatDuration(startTime) {
  const start = new Date(startTime);
  const diff = Date.now() - start;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  return hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
}

function formatActiveATC(atcList) {
  const grouped = {};
  const centers = [];

  for (const atc of atcList) {
    const facility = ATC_TYPE_MAP[atc.type] ?? "UNK";
    const name = atc.username ?? "Unknown";
    const duration = formatDuration(atc.startTime);

    if (atc.type === 6 || !atc.airportName) {
      centers.push(`• **${facility}** — ${name} (${duration})`);
      continue;
    }

    grouped[atc.airportName] ??= [];
    grouped[atc.airportName].push(`• **${facility}** — ${name} (${duration})`);
  }

  const airportLines = Object.entries(grouped)
    .sort()
    .flatMap(([icao, lines]) => [`**${icao}**`, ...lines, ""]);

  const centerLines = centers.length ? ["**CENTER ATC**", ...centers] : [];

  return [...airportLines, ...centerLines].join("\n").trim();
}

function hasATISFrequency(atcList, icao) {
  return atcList.some((a) => a.airportName === icao && a.type === 7);
}

function formatParsedATIS(parsed) {
  return [
    `INFO: ${parsed.information}`,
    `Landing RWY: ${parsed.landingRunway}`,
    `Departure RWY: ${parsed.departureRunway}`,
    `Approach: ${parsed.expectApproach}`,
    `Arrival Proc: ${parsed.arrivalProcedures}`,
    `Departure Proc: ${parsed.departureProcedures}`,
    `Remarks: ${parsed.remarks}`,
  ].join("\n");
}

// function formatInboundWithOutbound(worldData) {
//   return worldData
//     .filter((a) => a.inboundFlightsCount > 0)
//     .sort((a, b) => b.inboundFlightsCount - a.inboundFlightsCount)
//     .slice(0, 10)
//     .map(
//       (a, i) =>
//         `**${i + 1}. ${a.airportIcao}** — ✈️ In: ${a.inboundFlightsCount} | Out: ${a.outboundFlightsCount}`,
//     )
//     .join("\n");
// }

// =====================
// BOT READY
// =====================

client.once("ready", async () => {
  console.log(`🟢 ATC Bot online as ${client.user.tag}`);

  setInterval(publishActiveATC, 30 * 60 * 1000);
  await publishActiveATC();
});

// =====================
// AUTO ATC PUBLISHER
// =====================

async function publishActiveATC() {
  if (!ATC_CHANNEL_ID) return;

  const channel = await client.channels.fetch(ATC_CHANNEL_ID);
  if (!channel) return;

  const sessionId = await getSessionId();
  const atcList = await getActiveATC(sessionId);

  if (!atcList.length) {
    return channel.send("📡 **Active ATC**\nNo ATC online.");
  }

  return channel.send(
    `📡 **Active ATC (Auto Update)**\n\n${formatActiveATC(atcList)}`,
  );
}

// =====================
// SLASH COMMAND HANDLER
// =====================

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // =====================
  // /atis
  // =====================
  if (commandName === "atis") {
    await interaction.deferReply();

    try {
      const icao = interaction.options.getString("icao")?.toUpperCase();
      if (!icao) {
        return interaction.editReply("❌ ICAO code missing.");
      }

      const sessionId = await getSessionId();
      const atcList = await getActiveATC(sessionId);

      // Airport not controlled
      if (!atcList.some((a) => a.airportName === icao)) {
        return interaction.editReply(
          `📡 **${icao}**\nAirport not currently controlled.`,
        );
      }

      // ATIS frequency not open
      if (!hasATISFrequency(atcList, icao)) {
        return interaction.editReply(
          `📡 **${icao}**\nATIS frequency not active.`,
        );
      }

      // Fetch ATIS
      const rawAtis = await getATIS(icao);
      const cleaned = (Array.isArray(rawAtis) ? rawAtis : [rawAtis])
        .map((l) => l?.trim())
        .filter(Boolean);

      if (!cleaned.length) {
        return interaction.editReply(
          `📡 **${icao}**\nATIS active, but no message published yet.`,
        );
      }

      const parsed = parseATIS(cleaned.join(" "));
      if (!parsed) {
        return interaction.editReply(
          `📡 **ATIS for ${icao}**\n\`\`\`\n${cleaned.join(" ")}\n\`\`\``,
        );
      }

      return interaction.editReply(
        `📡 **ATIS for ${icao}**\n\`\`\`\n${formatParsedATIS(parsed)}\n\`\`\``,
      );
    } catch (err) {
      console.error("ATIS error:", err);
      return interaction.editReply("⚠️ Failed to fetch ATIS.");
    }
  }

  // =====================
  // /atc
  // =====================
  if (commandName === "atc") {
    await interaction.deferReply();
    const sessionId = await getSessionId();
    const atcList = await getActiveATC(sessionId);

    if (!atcList.length) {
      return interaction.editReply("📡 No ATC online.");
    }

    return interaction.editReply(
      `📡 **Active ATC**\n\n${formatActiveATC(atcList)}`,
    );
  }

  // =====================
  // /inbound
  // =====================
  if (commandName === "inbound") {
    await interaction.deferReply();

    try {
      const mode = interaction.options.getString("mode") ?? "hour";

      const sessionId = await getSessionId();

      const [world, flights] = await Promise.all([
        getWorldOverview(sessionId),
        getFlights(sessionId),
      ]);

      const flightMap = new Map(flights.map((f) => [f.flightId, f]));

      const candidates = world
        .filter((a) => a.inboundFlightsCount > 0)
        .sort((a, b) => b.inboundFlightsCount - a.inboundFlightsCount)
        .slice(0, 20);

      const stats = [];

      for (const airport of candidates) {
        const coords = await getAirportCoords(
          airport.airportIcao.toUpperCase(),
        );

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

          const etaMinutes = (distance / flight.speed) * 60;

          if (etaMinutes <= 20) {
            next20++;
          } else if (etaMinutes <= 60) {
            next60++;
          }
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

      if (mode === "total") {
        stats.sort((a, b) => b.inbound - a.inbound);
      } else {
        stats.sort((a, b) => b.next20 + b.next60 - (a.next20 + a.next60));
      }

      const top10 = stats.slice(0, 10);

      const output = top10
        .map((a, i) => {
          const atc = a.gtads === "—" ? "⚫ Uncontrolled" : `🟢 ${a.gtads}`;

          if (mode === "total") {
            return (
              `**${i + 1}. ${a.icao}** ${atc}\n` +
              `📥 Inbound: ${a.inbound}\n` +
              `📤 Outbound: ${a.outbound}`
            );
          }

          return (
            `**${i + 1}. ${a.icao}** ${atc}\n` +
            `🕒 <20 min: ${a.next20}\n` +
            `🕓 20-60 min: ${a.next60}\n` +
            `📥 Total Inbound: ${a.inbound}`
          );
        })
        .join("\n\n");

      return interaction.editReply(
        `📊 **${
          mode === "total"
            ? "Top Airports by Total Inbound"
            : "Top Airports by Next-Hour Arrivals"
        }**\n\n${output}`,
      );
    } catch (err) {
      console.error(err);

      return interaction.editReply("⚠️ Failed to fetch inbound traffic.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
