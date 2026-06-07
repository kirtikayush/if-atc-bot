const FACILITY_MAP = {
  0: "G",

  1: "T",

  4: "A",

  5: "D",

  6: "CTR",
};

const SERVER_MAP = {
  0: "Solo",
  1: "Casual",
  2: "Training",
  3: "Expert",
  4: "IFATC",
};

export function getFrequencyNames(session) {
  const names = [];

  if (session.frequencyTypes.has(0)) names.push("Ground");
  if (session.frequencyTypes.has(1)) names.push("Tower");
  if (session.frequencyTypes.has(4)) names.push("Approach");
  if (session.frequencyTypes.has(5)) names.push("Departure");
  if (session.frequencyTypes.has(6)) names.push("Center");

  return names.join(", ");
}

export function buildATCSession(data) {
  const groups = new Map();

  for (const row of data) {
    const groupId = row.atcSessionGroupId;

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        airport:
          row.facility.airportIcao ??
          (row.facility.frequencyType === 6 ? "CENTER" : "Unknown"),

        facilities: new Set(),
        frequencyTypes: new Set(),
        totalOps: 0,
        groundOps: 0,
        towerOps: 0,
        approachOps: 0,
        departureOps: 0,
        centerOps: 0,
        violations: 0,
        totalTime: 0,
        server: SERVER_MAP[row.worldType] ?? "Unknown",
        startTime: row.created,
      });
    }

    const session = groups.get(groupId);

    if (new Date(row.created) < new Date(session.startTime)) {
      session.startTime = row.created;
    }

    const type = row.facility.frequencyType;

    if ([0, 1, 4, 5, 6].includes(type)) {
      session.frequencyTypes.add(type);
    }

    if (FACILITY_MAP[type]) {
      session.facilities.add(FACILITY_MAP[type]);
    }

    session.totalOps += row.operations;
    session.violations += row.violationsIssued;

    if (row.totalTime > session.totalTime) {
      session.totalTime = row.totalTime;
    }

    if (type === 0) session.groundOps += row.operations;
    if (type === 1) session.towerOps += row.operations;
    if (type === 4) session.approachOps += row.operations;
    if (type === 5) session.departureOps += row.operations;
    if (type === 6) session.centerOps += row.operations;
  }

  return [...groups.values()];
}
