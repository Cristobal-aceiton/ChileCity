// ── Sesión firmada en el servidor ────────────────────────────────────────────
// Antes, el frontend mandaba su propio "discord_id" en cada petición y las
// APIs confiaban en ese valor a ciegas. Cualquiera podía editar localStorage
// o la URL y hacerse pasar por otro usuario (incluido el super admin).
//
// Ahora, al hacer login con Discord se firma una cookie httpOnly con HMAC-SHA256
// (usando SESSION_SECRET). El navegador no puede leerla ni modificarla sin
// invalidar la firma, y cada endpoint la valida en el servidor antes de
// confiar en la identidad del usuario.

import crypto from "crypto";

const COOKIE_NAME = "cc_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 días

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "Falta la variable de entorno SESSION_SECRET en Vercel. Defínela con un valor largo y aleatorio."
    );
  }
  return secret;
}

function base64url(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64").toString("utf8");
}

function sign(payload) {
  const secret = getSecret();
  const body = base64url(JSON.stringify({ ...payload, exp: Date.now() + MAX_AGE_SECONDS * 1000 }));
  const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `${body}.${sig}`;
}

function verify(token) {
  try {
    const secret = getSecret();
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;

    const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null; // firma inválida → cookie falsificada o manipulada
    }

    const payload = JSON.parse(base64urlDecode(body));
    if (!payload.exp || payload.exp < Date.now()) return null; // sesión vencida
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers?.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

/** Devuelve el usuario de la sesión (o null si no hay cookie válida). */
export function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verify(token); // { id, name, tag, avatar, exp }
}

/** Firma y setea la cookie de sesión httpOnly tras un login exitoso. */
export function setSessionCookie(res, payload) {
  const token = sign(payload);
  const isProd = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  const cookie = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SECONDS}`,
    isProd ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
  res.setHeader("Set-Cookie", cookie);
}

/** Borra la cookie de sesión (logout). */
export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

/**
 * Exige sesión válida. Si no existe, responde 401 y devuelve null
 * (el handler que llama a esto debe hacer `return` inmediatamente si recibe null).
 */
export function requireSession(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Debes iniciar sesión con Discord." });
    return null;
  }
  return user;
}
