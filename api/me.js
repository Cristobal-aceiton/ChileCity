import { getSessionUser } from "../lib/auth.js";
import { SUPER_ADMIN_ID, BASE_URL } from "../lib/constants.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.status(200).end();

  const user = getSessionUser(req);
  if (!user) return res.status(200).json({ autenticado: false });

  return res.status(200).json({
    autenticado: true,
    id: user.id,
    name: user.name,
    tag: user.tag,
    avatar: user.avatar,
    esSuperAdmin: user.id === SUPER_ADMIN_ID,
  });
}
