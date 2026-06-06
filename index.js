import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import {
  getATIS,
  getActiveATC,
  getSessionId,
  getWorldOverview,
  getFlights,
  getAirportInfo,
  getUserProfile,
} from "./infiniteFlight.js";
import { parseATIS } from "./helpers/atisParser.js";
import { buildInboundStats } from "./helpers/inbound.js";
import { formatActiveATC, hasATISFrequency } from "./helpers/atc.js";
import { ATC_RANKS, formatFlightTime } from "./helpers/user.js";
import { createProfileCard } from "./helpers/profileCard.js";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const ATC_CHANNEL_ID = process.env.ATC_CHANNEL_ID;

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
  if (commandName === "testatis") {
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
  if (commandName === "testatc") {
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
  if (commandName === "testinbound") {
    await interaction.deferReply();

    try {
      const mode = interaction.options.getString("mode") ?? "hour";

      const sessionId = await getSessionId();

      const [world, flights] = await Promise.all([
        getWorldOverview(sessionId),
        getFlights(sessionId),
      ]);

      const stats = await buildInboundStats(world, flights, getAirportInfo);

      if (mode === "total") {
        stats.sort((a, b) => b.inbound - a.inbound);
      } else {
        stats.sort((a, b) => b.next20 + b.next60 - (a.next20 + a.next60));
      }

      const top10 = stats.slice(0, 10);

      const output = top10
        .map((a, i) => {
          const atc = a.gtads === "—" ? "⚫" : `🟢 ${a.gtads}`;

          if (mode === "total") {
            return (
              `**${i + 1} ${a.icao} - ${atc}\n**` +
              `20m: ${String(a.next20).padStart(3)} | ` +
              `60m: ${String(a.next60).padStart(3)} | ` +
              `Total: ${String(a.inbound).padStart(3)}`
            );
          }

          return (
            `**${i + 1} ${a.icao} - ${atc}\n**` +
            `20m: ${String(a.next20).padStart(3)} | ` +
            `60m: ${String(a.next60).padStart(3)} | ` +
            `Total: ${String(a.inbound).padStart(3)}`
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

  // =====================
  // /userprofile
  // =====================
  if (commandName === "testuserprofile") {
    await interaction.deferReply();

    try {
      const username = interaction.options.getString("username");

      const user = await getUserProfile(username);

      if (!user) {
        return interaction.editReply(`❌ User "${username}" not found.`);
      }

      const totalViolations =
        (user.violationCountByLevel?.level1 ?? 0) +
        (user.violationCountByLevel?.level2 ?? 0) +
        (user.violationCountByLevel?.level3 ?? 0);

      const profile = [
        `# ${user.discourseUsername}`,
        `${ATC_RANKS[user.atcRank]} • Grade ${user.grade}`,
        "",
        "```",
        `Flights      │ ${user.onlineFlights.toLocaleString()}`,
        `Landings     │ ${user.landingCount.toLocaleString()}`,
        `Flight Time  │ ${formatFlightTime(user.flightTime)}`,
        `ATC Ops      │ ${user.atcOperations.toLocaleString()}`,
        `XP           │ ${user.xp.toLocaleString()}`,
        `Violations   │ ${totalViolations}`,
        "```",
      ].join("\n");

      return interaction.editReply(profile);
    } catch (err) {
      console.error(err);
      return interaction.editReply("⚠️ Failed to fetch user profile.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
