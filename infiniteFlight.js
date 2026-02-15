import axios from "axios";

const BASE_URL = "https://api.infiniteflight.com/public/v2";
let cachedSessionId = null;

// =====================
// SESSION RESOLUTION
// =====================

export async function getSessionId() {
  if (cachedSessionId) return cachedSessionId;

  const res = await axios.get(`${BASE_URL}/sessions`, {
    headers: {
      Authorization: `Bearer ${process.env.IF_API_KEY}`,
    },
  });

  const target = process.env.IF_SERVER_NAME.toLowerCase();
  const session = res.data.result.find((s) => s.name.toLowerCase() === target);

  if (!session) {
    throw new Error(
      `Infinite Flight session not found: ${process.env.IF_SERVER_NAME}`,
    );
  }

  cachedSessionId = session.id;
  return cachedSessionId;
}

// =====================
// ATIS (CORRECT HANDLING)
// =====================

export async function getATIS(icao) {
  const sessionId = await getSessionId();

  const res = await axios.get(
    `${BASE_URL}/sessions/${sessionId}/airport/${icao}/atis`,
    {
      headers: {
        Authorization: `Bearer ${process.env.IF_API_KEY}`,
      },

      // ✅ Allow IF's weird 404 = "ATIS empty"
      validateStatus: (status) => status === 200 || status === 404,
    },
  );

  // 404 means ATIS frequency exists but no message
  if (res.status === 404) {
    return [];
  }

  return res.data?.result ?? [];
}

// =====================
// ACTIVE ATC
// =====================

export async function getActiveATC(sessionId) {
  const res = await axios.get(`${BASE_URL}/sessions/${sessionId}/atc`, {
    headers: {
      Authorization: `Bearer ${process.env.IF_API_KEY}`,
    },
  });

  return res.data?.result ?? [];
}

// =====================
// WORLD OVERVIEW
// =====================

export async function getWorldOverview(sessionId) {
  const res = await axios.get(`${BASE_URL}/sessions/${sessionId}/world`, {
    headers: {
      Authorization: `Bearer ${process.env.IF_API_KEY}`,
    },
  });

  return res.data?.result ?? [];
}
