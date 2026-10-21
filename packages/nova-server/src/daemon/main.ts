#!/usr/bin/env node
// nova-daemon : l'API locale du poste. Sert l'interface (nova-home) et relaie /api vers nova-gateway,
// en y ajoutant l'identité de la personne du poste. Écoute uniquement sur 127.0.0.1.
//
// Variables d'environnement :
//   NOVA_GATEWAY   adresse du gardien (http://127.0.0.1:7700 par défaut)
//   NOVA_PERSON    identifiant de la personne du poste (clé de nova.people ; le nom d'utilisateur)
//   NOVA_HOME_DIR  interface construite (nova-home/dist)
//   NOVA_THEME_CSS thème de l'entreprise, généré au build
//   NOVA_PORT      port d'écoute (7777 par défaut)
//   NOVA_HOTES     suffixes d'hôtes acceptés en plus de localhost, séparés par des virgules
//                  (ex. « .app.github.dev » pour un essai dans GitHub Codespaces ; jamais sur un poste)

import { createServer, request, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { userInfo } from "node:os";
import { publishBadges } from "./badges.js";
import type { State } from "../core/types.js";

const env = process.env;
const port = Number(env.NOVA_PORT ?? 7777);
const gateway = new URL(env.NOVA_GATEWAY ?? "http://127.0.0.1:7700");
const person = env.NOVA_PERSON ?? userInfo().username;
const homeDir = env.NOVA_HOME_DIR ? resolve(env.NOVA_HOME_DIR) : undefined;
const theme = env.NOVA_THEME_CSS ? readFileSync(env.NOVA_THEME_CSS, "utf8") : "";
const hotes = (env.NOVA_HOTES ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter((h) => h.startsWith(".") && h.length > 4);

/** localhost, ou un hôte qui finit par un suffixe déclaré (le point initial évite « evil-app.github.dev »). */
export function hoteAccepte(host: string) {
  if (/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return true;
  const nom = host.toLowerCase().replace(/:\d+$/, "");
  return hotes.some((h) => nom.endsWith(h));
}

const server = createServer((req, res) => {
  // Protection contre les sites web qui tenteraient de parler au daemon local.
  if (!hoteAccepte(req.headers.host ?? "")) return send(res, 403, { erreur: "Hôte refusé." });
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/theme.css") return send(res, 200, theme, "text/css; charset=utf-8");
  if (!url.pathname.startsWith("/api/")) return serveStatic(url.pathname, res);
  if (req.method === "POST" && req.headers["x-nova"] !== "1") return send(res, 403, { erreur: "En-tête X-Nova manquant." });

  const upstream = request(
    { host: gateway.hostname, port: gateway.port, method: req.method, path: url.pathname + url.search, headers: { "content-type": req.headers["content-type"] ?? "application/json", host: `127.0.0.1:${gateway.port}`, "x-nova-person": person } },
    (up) => {
      res.writeHead(up.statusCode ?? 502, { "content-type": up.headers["content-type"] ?? "application/json", "cache-control": "no-store" });
      up.pipe(res);
    },
  );
  upstream.on("error", (e) => (console.error("relais :", e.message), send(res, 502, { erreur: "Le Hub ne répond pas. Il redémarre tout seul ; réessaie dans un instant." })));
  res.on("close", () => upstream.destroy()); // le client est parti : on coupe aussi le flux vers le Hub
  req.pipe(upstream);
});

server.listen(port, "127.0.0.1", () => console.log(`nova-daemon : http://127.0.0.1:${port} → ${gateway.origin} (${person})`));

// Pastilles du dock : le daemon suit l'état en direct et met à jour les icônes des agents.
function followBadges() {
  const req = request({ host: gateway.hostname, port: gateway.port, path: "/api/live", headers: { host: `127.0.0.1:${gateway.port}`, "x-nova-person": person } }, (res) => {
    let buf = "";
    res.setEncoding("utf8");
    res.on("data", (chunk: string) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = block.split("\n").find((l) => l.startsWith("data: "));
        if (block.startsWith("event: state") && data) publishBadges(JSON.parse(data.slice(6)) as State);
      }
    });
    res.on("end", () => setTimeout(followBadges, 2000));
  });
  req.on("error", () => setTimeout(followBadges, 2000));
  req.end();
}
followBadges();

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
};

function serveStatic(pathname: string, res: ServerResponse) {
  if (!homeDir) return send(res, 404, "Interface non installée.", "text/plain; charset=utf-8");
  const file = resolve(homeDir, "." + normalize(decodeURIComponent(pathname)));
  const target = file.startsWith(homeDir + sep) && existsSync(file) && statSync(file).isFile() ? file : join(homeDir, "index.html");
  const immutable = target.startsWith(join(homeDir, "assets") + sep);
  res.writeHead(200, { "content-type": TYPES[extname(target)] ?? "application/octet-stream", "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
  res.end(readFileSync(target));
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
