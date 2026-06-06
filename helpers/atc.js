export const ATC_TYPE_MAP = {
  0: "GND",
  1: "TWR",
  2: "UNICOM",
  3: "CLR",
  4: "APP",
  5: "DEP",
  6: "CTR",
  7: "ATIS",
};

export function getGTADS(atcFacilities = []) {
  const types = atcFacilities.map((f) => f.type);

  let result = "";

  if (types.includes(0)) result += "G";
  if (types.includes(1)) result += "T";
  if (types.includes(4)) result += "A";
  if (types.includes(5)) result += "D";
  if (types.includes(7)) result += "S";

  return result || "—";
}

export function formatDuration(startTime) {
  const start = new Date(startTime);
  const diff = Date.now() - start;

  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);

  return hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
}

export function formatActiveATC(atcList) {
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

export function hasATISFrequency(atcList, icao) {
  return atcList.some((a) => a.airportName === icao && a.type === 7);
}
