import { getSessionUser, clearSessionCookie } from "../lib/auth.js";
import { SUPER_ADMIN_ID, BASE_URL } from "../lib/constants.js";

// ── Sesión ────────────────────────────────────────────────────────────────
// Fusiona lo que antes eran dos funciones serverless separadas (/api/me y
// /api/logout) en una sola. Vercel Hobby permite máximo 12 Serverless
// Functions por deployment, y este proyecto ya estaba al límite (13), así
// que en vez de borrar funcionalidad se combinan estas dos rutas — ambas
// pequeñas y relacionadas con el estado de sesión — en un solo archivo.
// El enrutamiento real sigue viviendo en vercel.json: tanto /api/me como
// /api/logout apuntan a este mismo archivo físico.
//
// Se sumó acá también /api/discord-stats (contador de gente en línea del
// landing): el frontend NO puede pedirle esto directo a discord.com porque
// el Content-Security-Policy del sitio (connect-src 'self') se lo bloquea
// de entrada, sin importar si Discord permite CORS o no. Server-to-server
// no tiene esa restricción, así que este archivo hace el fetch por el
// usuario y le devuelve solo lo que necesita. Por el mismo límite de 12
// functions se agregó acá en vez de un archivo nuevo.
const DISCORD_INVITE_CODE = "8HgHpYDBWW";
let discordStatsCache = null; // { online, total, ts } — vive mientras la function esté "caliente"

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.status(200).end();

  const ruta = req.query?.ruta;

  if (ruta === "discord-stats") {
    // Cache de 60s en memoria: evita pegarle a la API de Discord en cada
    // carga del landing si la function sigue caliente entre invocaciones.
    if (discordStatsCache && Date.now() - discordStatsCache.ts < 60000) {
      return res.status(200).json({ online: discordStatsCache.online, total: discordStatsCache.total });
    }
    try {
      const r = await fetch(`https://discord.com/api/v10/invites/${DISCORD_INVITE_CODE}?with_counts=true`);
      if (!r.ok) return res.status(200).json({ online: null, total: null });
      const d = await r.json();
      const online = d.approximate_presence_count ?? null;
      const total  = d.approximate_member_count  ?? null;
      discordStatsCache = { online, total, ts: Date.now() };
      return res.status(200).json({ online, total });
    } catch {
      return res.status(200).json({ online: null, total: null });
    }
  }

  // El query param "ruta" lo agrega vercel.json al reescribir /api/logout y
  // /api/me hacia este mismo archivo (más confiable que inspeccionar
  // req.url, cuyo comportamiento con rewrites puede variar).
  const esLogout = ruta === "logout";

  if (esLogout) {
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  }

  // Por defecto (o /api/me): devolver el estado de sesión actual.
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
