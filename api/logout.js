import { clearSessionCookie } from "../lib/auth.js";
import { BASE_URL } from "../lib/constants.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.status(200).end();

  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
}
