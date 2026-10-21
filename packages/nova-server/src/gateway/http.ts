#!/usr/bin/env node
// nova-daemon : l'API locale du poste. Seule source de données de l'interface (nova-home).
// Écoute uniquement sur 127.0.0.1.
//
// Variables d'environnement :
//   NOVA_COMPANY   fichier JSON généré depuis company.nix (obligatoire)
//   NOVA_HOME_DIR  dossier de l'interface construite (nova-home/dist)
//   NOVA_THEME_CSS thème de l'entreprise, généré au build (design/build.mjs theme)
//   NOVA_DATA      dossier data/ de l'entreprise (journal), facultatif
//   NOVA_PORT      port d'écoute (7777 par défaut)
//   NOVA_DEMO      1 pour jouer les scénarios de démonstration
//   NOVA_DEMO_SPEED accélération des scénarios (1 par défaut)
//   NOVA_PERSON    identifiant de la personne du poste (clé de nova.people)

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { userInfo } from "node:os";
import { Conflict, Engine, NotFound } from "./engine.js";
import { fileJournal, nullJournal } from "../core/journal.js";
import { startDemo } from "./demo.js";
import { publishBadges } from "../daemon/badges.js";
import type { Autonomy, CompanyConfig } from "../core/types.js";

const env = process.env;
const port = Number(env.NOVA_PORT ?? 7777);
const cfg: CompanyConfig = JSON.parse(readFileSync(required("NOVA_COMPANY"), "utf8"));
const homeDir = env.NOVA_HOME_DIR ? resolve(env.NOVA_HOME_DIR) : undefined;
const theme = env.NOVA_THEME_CSS ? readFileSync(env.NOVA_THEME_CSS, "utf8") : "";
const journal = env.NOVA_DATA ? fileJournal(join(env.NOVA_DATA, "journal")) : nullJournal;
const demo = env.NOVA_DEMO === "1";
const who = `humain:${userInfo().username}`;

// La personne du poste : NOVA_PERSON (posé par Nix), sinon le dirigeant déclaré.
const person = cfg.people[env.NOVA_PERSON ?? ""] ?? Object.values(cfg.people).find((p) => p.role === "dirigeant");
const engine = new Engine(cfg, journal, { demo, speed: Number(env.NOVA_DEMO_SPEED ?? 1), me: person?.name ?? "" });
if (demo) startDemo(engine);

// Diffusion en direct : chaque changement d'état part vers toutes les fenêtres ouvertes (SSE).
const clients = new Set<ServerResponse>();
let pendingPush: NodeJS.Timeout | undefined;
engine.on("change", () => {
  pendingPush ??= setTimeout(() => {
    pendingPush = undefined;
    const st = engine.state();
    const data = `event: state\ndata: ${JSON.stringify(st)}\n\n`;
    for (const c of clients) c.write(data);
    publishBadges(st);
  }, 50);
});
setInterval(() => {
  for (const c of clients) c.write(": ping\n\n");
}, 15000).unref();

const AUTONOMY: Autonomy[] = ["je-valide-tout", "je-valide-l-important", "autonome"];

const routes: [string, RegExp, (m: RegExpMatchArray, body: any) => unknown][] = [
  ["GET", /^\/api\/state$/, () => engine.state()],
  ["POST", /^\/api\/approvals\/(\w+)\/valider$/, (m) => engine.approve(m[1]!, who)],
  ["POST", /^\/api\/approvals\/(\w+)\/refuser$/, (m) => engine.refuse(m[1]!, who)],
  ["POST", /^\/api\/tasks\/(\w+)\/annuler$/, (m) => engine.cancel(m[1]!, who)],
  ["POST", /^\/api\/tasks\/(\w+)\/arreter$/, (m) => engine.stop(m[1]!, who)],
  ["POST", /^\/api\/agents\/([\w-]+)\/pause$/, (m) => engine.pause(m[1]!, who)],
  ["POST", /^\/api\/agents\/([\w-]+)\/reprendre$/, (m) => engine.resume(m[1]!, who)],
  [
    "POST",
    /^\/api\/agents\/([\w-]+)\/autonomie$/,
    (m, body) => {
      if (!AUTONOMY.includes(body?.level)) throw new BadRequest("Niveau d'autonomie inconnu.");
      engine.setAutonomy(m[1]!, body.level, who);
    },
  ],
];

const server = createServer(async (req, res) => {
  try {
    // Protection contre les sites web qui tenteraient de parler au daemon local.
    const host = req.headers.host ?? "";
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return send(res, 403, { erreur: "Hôte refusé." });
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/api/live") return live(req, res);
    if (url.pathname === "/theme.css") return send(res, 200, theme, "text/css; charset=utf-8");

    if (url.pathname.startsWith("/api/")) {
      if (req.method === "POST" && req.headers["x-nova"] !== "1") return send(res, 403, { erreur: "En-tête X-Nova manquant." });
      for (const [method, re, fn] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) {
          const body = req.method === "POST" ? await readJson(req) : undefined;
          const out = fn(m, body);
          return send(res, 200, out ?? { ok: true });
        }
      }
      return send(res, 404, { erreur: "Route inconnue." });
    }

    return serveStatic(url.pathname, res);
  } catch (e) {
    const status = e instanceof NotFound ? 404 : e instanceof Conflict ? 409 : e instanceof BadRequest ? 400 : 500;
    if (status === 500) console.error(e);
    send(res, status, { erreur: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(port, "127.0.0.1", () => console.log(`nova-daemon : http://127.0.0.1:${port}${demo ? " (démo)" : ""}`));

function live(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
  res.write(`event: state\ndata: ${JSON.stringify(engine.state())}\n\n`);
  clients.add(res);
  req.on("close", () => clients.delete(res));
}

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
  const immutable = target.includes(`${join(homeDir, "assets")}`);
  res.writeHead(200, { "content-type": TYPES[extname(target)] ?? "application/octet-stream", "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
  res.end(readFileSync(target));
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((ok, ko) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 64_000) ko(new BadRequest("Requête trop grande."));
    });
    req.on("end", () => {
      try {
        ok(raw ? JSON.parse(raw) : {});
      } catch {
        ko(new BadRequest("JSON invalide."));
      }
    });
  });
}

function required(name: string): string {
  const v = env[name];
  if (!v) {
    console.error(`Variable ${name} manquante.`);
    process.exit(2);
  }
  return v;
}

class BadRequest extends Error {}
