export const ATC_RANKS = {
  0: "Observer",
  1: "ATC Trainee",
  2: "ATC Apprentice",
  3: "ATC Specialist",
  4: "ATC Officer",
  5: "ATC Supervisor",
  6: "ATC Recruiter",
  7: "ATC Manager",
};

export function formatFlightTime(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return `${hrs}h ${mins}m`;
}
