import { createCanvas } from "canvas";
import fs from "fs";

export async function createProfileCard(user, totalViolations, atcRank) {
  const canvas = createCanvas(1200, 700);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px Arial";
  ctx.fillText(user.discourseUsername, 40, 60);

  const cards = [
    ["Grade", user.grade],
    ["Flights", user.onlineFlights.toLocaleString()],
    ["Landings", user.landingCount.toLocaleString()],
    [
      "Flight Time",
      `${Math.floor(user.flightTime / 60)}h ${user.flightTime % 60}m`,
    ],
    ["XP", user.xp.toLocaleString()],
    ["ATC Rank", atcRank],
    ["ATC Ops", user.atcOperations.toLocaleString()],
    ["Violations", totalViolations],
  ];

  let x = 40;
  let y = 100;

  cards.forEach((card, i) => {
    ctx.fillStyle = "#1e293b";
    ctx.roundRect(x, y, 250, 140, 20);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px Arial";
    ctx.fillText(String(card[1]), x + 20, y + 55);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "24px Arial";
    ctx.fillText(card[0], x + 20, y + 105);

    x += 280;

    if ((i + 1) % 4 === 0) {
      x = 40;
      y += 180;
    }
  });

  const path = "./profile-card.png";

  fs.writeFileSync(path, canvas.toBuffer("image/png"));

  return path;
}
