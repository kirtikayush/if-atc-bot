import axios from "axios";

const BASE_URL = "https://api.infiniteflight.com/public/v2";

export async function getServers() {
  const res = await axios.get(`${BASE_URL}/servers`, {
    headers: {
      Authorization: `Bearer ${process.env.IF_API_KEY}`,
    },
  });

  return res.data.result;
}
