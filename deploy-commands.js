import { REST, Routes, SlashCommandBuilder } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const commands = [
  new SlashCommandBuilder()
    .setName("atis")
    .setDescription("Get ATIS for an airport")
    .addStringOption((option) =>
      option
        .setName("icao")
        .setDescription("Airport ICAO code")
        .setRequired(true),
    ),

  new SlashCommandBuilder().setName("atc").setDescription("Show active ATC"),

  new SlashCommandBuilder()
    .setName("inbound")
    .setDescription("Inbound traffic statistics")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Sort mode")
        .setRequired(false)
        .addChoices(
          { name: "Hour", value: "hour" },
          { name: "Total", value: "total" },
        ),
    ),

  new SlashCommandBuilder()
    .setName("userprofile")
    .setDescription("Get Infinite Flight user profile")
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("IFC Username")
        .setRequired(true),
    ),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🔁 Registering slash commands...");

    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands,
    });

    console.log("✅ Slash commands registered.");
  } catch (err) {
    console.error(err);
  }
})();
