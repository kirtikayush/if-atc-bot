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
  getATCHistory,
} from "./infiniteFlight.js";
import { parseATIS } from "./helpers/atisParser.js";
import { buildInboundStats } from "./helpers/inbound.js";
import { formatActiveATC, hasATISFrequency } from "./helpers/atc.js";
import { ATC_RANKS, formatFlightTime } from "./helpers/user.js";
import { buildATCSession, getFrequencyNames } from "./helpers/ops.js";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const ATC_CHANNEL_ID = process.env.ATC_CHANNEL_ID;

function formatSessionTime(dateString) {
  const date = new Date(dateString);

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear()).slice(-2);

  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hh}${mm}Z`;
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
  if (commandName === "userprofile") {
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

  // =====================
  // /ops
  // =====================

  if (commandName === "ops") {
    await interaction.deferReply();

    try {
      const username = interaction.options.getString("username");

      const page = interaction.options.getInteger("page") ?? 1;

      const user = await getUserProfile(username);

      if (!user) {
        return interaction.editReply(`❌ User "${username}" not found.`);
      }

      const history = await getATCHistory(user.userId, page);

      if (!history?.data?.length) {
        return interaction.editReply("No ATC history found.");
      }

      const sessions = buildATCSession(history.data);

      const output = sessions
        .map((session, index) => {
          const hours = session.totalTime / 60;

          const opsPerHour =
            hours > 0 ? (session.totalOps / hours).toFixed(1) : "0";

          const frequencyLines = [];

          if (session.frequencyTypes.has(0)) {
            frequencyLines.push(`Ground Ops    │ ${session.groundOps}`);
          }

          if (session.frequencyTypes.has(1)) {
            frequencyLines.push(`Tower Ops     │ ${session.towerOps}`);
          }

          if (session.frequencyTypes.has(4)) {
            frequencyLines.push(`Approach Ops  │ ${session.approachOps}`);
          }

          if (session.frequencyTypes.has(5)) {
            frequencyLines.push(`Departure Ops │ ${session.departureOps}`);
          }

          if (session.frequencyTypes.has(6)) {
            frequencyLines.push(`Center Ops    │ ${session.centerOps}`);
          }

          // console.log("Page:", page);
          // console.log("Rows returned:", history.data.length);

          // const sessions = buildATCSession(history.data);

          // console.log("Sessions after grouping:", sessions.length);

          return [
            `**${index + 1}. ${session.airport}**\`\`\``,
            `Server        │ ${session.server}`,
            `Controlled    │ ${getFrequencyNames(session)}`,
            `Time          │ ${formatSessionTime(session.startTime)}`,
            `Total Ops     │ ${session.totalOps}`,
            `Ops / Hour    │ ${opsPerHour}`,
            ...frequencyLines,
            `Violations    │ ${session.violations}`,
            `Duration      │ ${Math.round(session.totalTime)}m`,
            "```",
          ].join("\n");
        })
        .join("\n");

      return interaction.editReply(
        `# ${user.discourseUsername}\nPage ${page}\n\n${output}`,
      );
    } catch (err) {
      console.error(err);

      return interaction.editReply("⚠️ Failed to fetch ATC stats.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
