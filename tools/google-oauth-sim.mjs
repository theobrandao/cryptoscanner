/**
 * Simulador local dos endpoints de token do Google para testar o callback sem conta Google.
 *   node tools/google-oauth-sim.mjs 3999  → POST /token devolve id_token "sim"; GET /tokeninfo devolve as claims
 *   definidas em SIM_EMAIL / SIM_SUB / SIM_NAME (aud = SIM_AUD).
 */
import { createServer } from "node:http";
const port = Number(process.argv[2] ?? 3999);
createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  res.setHeader("content-type", "application/json");
  if (req.method === "POST" && url.pathname === "/token") return res.end(JSON.stringify({ id_token: "sim", access_token: "a", token_type: "Bearer" }));
  if (url.pathname === "/tokeninfo")
    return res.end(JSON.stringify({ aud: process.env.SIM_AUD ?? "sim-client", iss: "https://accounts.google.com", sub: process.env.SIM_SUB ?? "sub-1", email: process.env.SIM_EMAIL ?? "sim@example.com", email_verified: "true", name: process.env.SIM_NAME ?? "Sim Google", exp: String(Math.floor(Date.now() / 1000) + 3600) }));
  res.statusCode = 404;
  res.end("{}");
}).listen(port, () => console.log(`google-oauth-sim em http://localhost:${port}`));
