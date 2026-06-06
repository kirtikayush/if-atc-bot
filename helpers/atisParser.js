export function parseATIS(text) {
  if (!text) return null;

  const extract = (regex) => {
    const m = text.match(regex);
    return m ? m[1].trim() : "—";
  };

  const extractRunways = (keyword) => {
    const regex = new RegExp(
      `${keyword}\\s+(?:runways?|rwys?|rwy)\\s+([0-9]{1,2}[LRC]?(?:\\s*,\\s*[0-9]{1,2}[LRC]?)*(?:\\s*and\\s*[0-9]{1,2}[LRC]?)?)`,
      "i",
    );

    const match = text.match(regex);
    if (!match) return "—";

    return match[1]
      .replace(/\s+and\s+/gi, ", ")
      .replace(/\s+/g, " ")
      .trim();
  };

  return {
    information: extract(/information\s+([a-z]+)/i),
    landingRunway: extractRunways("landing"),
    departureRunway: extractRunways("departing"),
    expectApproach: extract(/expect\s+([a-z\s]+?)\s+approach/i),
    remarks: extract(
      /remarks?,\s*(.+?)(?=(landing|departing|recommended|advise))/i,
    ),
    departureProcedures: extract(
      /recommended departure procedures[,:]\s*(.+?)(?=recommended arrival|advise|$)/i,
    ),
    arrivalProcedures: extract(
      /recommended arrival procedures[,:]\s*(.+?)(?=advise|$)/i,
    ),
  };
}
