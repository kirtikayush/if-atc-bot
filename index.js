import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import {
  getATIS,
  getActiveATC,
  getSessionId,
  getWorldOverview,
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

function formatInboundWithOutbound(worldData) {
  return worldData
    .filter((a) => a.inboundFlightsCount > 0)
    .sort((a, b) => b.inboundFlightsCount - a.inboundFlightsCount)
    .slice(0, 10)
    .map(
      (a, i) =>
        `**${i + 1}. ${a.airportIcao}** — ✈️ In: ${a.inboundFlightsCount} | Out: ${a.outboundFlightsCount}`,
    )
    .join("\n");
}

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
    const sessionId = await getSessionId();
    const world = await getWorldOverview(sessionId);

    if (!world.length) {
      return interaction.editReply("📊 No traffic data available.");
    }

    return interaction.editReply(
      `📊 **Top 10 Airports by Inbound Traffic**\n\n${formatInboundWithOutbound(world)}`,
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
