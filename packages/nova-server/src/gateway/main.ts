#!/usr/bin/env node
// nova-gateway : le gardien du Hub. Seul point d'entrée vers les sources de l'entreprise.
// Lance les connecteurs MCP, applique droits et autonomie, tient le journal, fait travailler les agents
// et répond aux questions. Écoute uniquement sur 127.0.0.1 ; les postes passent par leur nova-daemon.
//
// Variables d'environnement :
//   NOVA_COMPANY          JSON généré depuis company.nix (obligatoire)
//   NOVA_DATA             dossier data/ de l'entreprise (obligatoire)
//   NOVA_GATEWAY_PORT     port d'écoute (7700 par défaut)
//   NOVA_MODEL_QUESTION   modèle des questions (claude-sonnet-5-5 par défaut, D-017)
//   NOVA_DEMO, NOVA_DEMO_SPEED   scénarios de démonstration
//   ANTHROPIC_API_KEY     clé d'API (fichier secret sops) ; sans elle, les questions sont désactivées
//   NOVA_MAIL_*, NOVA_AGENDA_*   fournisseurs réels des connecteurs (voir connectors/)
//   NOVA_SKILLS           dossier des métiers (verticals/), où vivent les skills des agents

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { fileJournal } from "../core/journal.js";
import type { AskEvent, Autonomy, CompanyConfig } from "../core/types.js";
import { ask } from "./ask.js";
import { Bus, Forbidden, READ_ALL } from "./bus.js";
import { Conflict, Engine, NotFound } from "./engine.js";
import { startDemo } from "./demo.js";
import { loadSkill, type Skill } from "./skills.js";
import { Triggers } from "./triggers.js";
import { costs, readReleves, saveReleve } from "./mesures.js";
import { Acces, cePoste, retourArriere } from "./flotte.js";

const env = process.env;
const cfg: CompanyConfig = JSON.parse(readFileSync(required("NOVA_COMPANY"), "utf8"));
const data = required("NOVA_DATA");
const port = Number(env.NOVA_GATEWAY_PORT ?? 7700);
const model = env.NOVA_MODEL_QUESTION ?? "claude-sonnet-5-5";
const demo = env.NOVA_DEMO === "1";
const journal = fileJournal(join(data, "journal"));

const connectorEnv = Object.fromEntries(Object.entries(env).filter(([k]) => /^NOVA_(MAIL|AGENDA|TODAY)_?/.test(k)) as [string, string][]);
const bus = new Bus(journal, { ...connectorEnv, NOVA_DATA: data });
await bus.start();

const acces = new Acces(data);
const engine = new Engine(cfg, journal, { demo, speed: Number(env.NOVA_DEMO_SPEED ?? 1), me: "", bus });
const claude = env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN ? new Anthropic() : undefined;

// Les agents : avec une clé d'API, de vrais agents Claude travaillent sur les données de l'entreprise
// (y compris en démonstration). Sans clé, la démonstration joue des scénarios écrits d'avance.
const skills = new Map<string, Skill>();
for (const [id, a] of Object.entries(cfg.agents)) {
  const first = a.skills?.[0];
  if (first && env.NOVA_SKILLS) skills.set(id, loadSkill(env.NOVA_SKILLS, first));
}
const memory = () => {
  try {
    return readFileSync(join(data, "memory", "regles.md"), "utf8");
  } catch {
    return "";
  }
};
const triggers = claude && skills.size ? new Triggers({ engine, bus, journal, create: (p) => claude.beta.messages.create(p), cfg, skills, data, memory }) : undefined;
if (triggers) {
  triggers.start();
  engine.on("change", () => triggers.drain());
} else if (demo) startDemo(engine);

// ---------- Diffusion en direct (SSE) ----------

const clients = new Map<ServerResponse, string>();
let pending: NodeJS.Timeout | undefined;
engine.on("change", () => {
  pending ??= setTimeout(() => {
    pending = undefined;
    for (const [res, person] of clients) res.write(`event: state\ndata: ${JSON.stringify(engine.state(name(person)))}\n\n`);
  }, 50);
});
setInterval(() => {
  for (const res of clients.keys()) res.write(": ping\n\n");
}, 15000).unref();

// ---------- Routes ----------

const AUTONOMY: Autonomy[] = ["je-valide-tout", "je-valide-l-important", "autonome"];
type Handler = (m: RegExpMatchArray, body: any, who: string) => unknown;

const routes: [string, RegExp, Handler][] = [
  ["GET", /^\/api\/moi$/, (_m, _b, who) => ({ role: cfg.people[who.replace(/^humain:/, "")]?.role, agentsActifs: Boolean(triggers) })],
  ["GET", /^\/api\/tools$/, () => bus.tools(READ_ALL).map(({ name, connector, title, right }) => ({ name, connector, title, right }))],
  ["POST", /^\/api\/approvals\/(\w+)\/valider$/, (m, _b, who) => engine.approve(m[1]!, who)],
  ["POST", /^\/api\/approvals\/(\w+)\/refuser$/, (m, _b, who) => engine.refuse(m[1]!, who)],
  ["POST", /^\/api\/tasks\/(\w+)\/annuler$/, (m, _b, who) => engine.cancel(m[1]!, who)],
  ["POST", /^\/api\/tasks\/(\w+)\/arreter$/, (m, _b, who) => engine.stop(m[1]!, who)],
  ["POST", /^\/api\/agents\/([\w-]+)\/pause$/, (m, _b, who) => engine.pause(m[1]!, who)],
  [
    "POST",
    /^\/api\/agents\/([\w-]+)\/lancer$/,
    (m, _b, who) => {
      if (!triggers) throw new Conflict("Les agents Claude ne sont pas encore activés : il manque la clé d'API Anthropic sur le Hub.");
      engine.agent(m[1]!);
      journal.write({ qui: who, quoi: "lancer", agent: m[1] });
      triggers.runNow(m[1]!);
    },
  ],
  ["GET", /^\/api\/couts$/, (_m, _b, who) => (dirigeant(who), costs(join(data, "journal"), new Date()))],
  ["GET", /^\/api\/releves$/, () => readReleves(data)],
  [
    "GET",
    /^\/api\/flotte$/,
    (_m, _b, who) => (
      dirigeant(who),
      {
        postes: [cePoste(cfg.version)],
        personnes: Object.entries(cfg.people).map(([id, p]) => ({ id, nom: p.name, role: p.role, revoque: acces.estRevoque(id) })),
      }
    ),
  ],
  [
    "POST",
    /^\/api\/flotte\/retour$/,
    async (_m, _b, who) => {
      dirigeant(who);
      journal.write({ qui: who, quoi: "flotte.retour", pourquoi: "Revenir à la version précédente du système" });
      await retourArriere();
    },
  ],
  [
    "POST",
    /^\/api\/flotte\/(revoquer|retablir)\/([\w-]+)$/,
    async (m, _b, who) => {
      dirigeant(who);
      const person = m[2]!;
      if (!cfg.people[person]) throw new NotFound("Personne inconnue.");
      if (`humain:${person}` === who) throw new Conflict("Tu ne peux pas révoquer ton propre accès.");
      journal.write({ qui: who, quoi: `flotte.${m[1]}`, pourquoi: person });
      await (m[1] === "revoquer" ? acces.revoquer(person) : acces.retablir(person));
    },
  ],
  ["POST", /^\/api\/releves$/, (_m, body, who) => (dirigeant(who), saveReleve(data, body, who))],
  ["POST", /^\/api\/agents\/([\w-]+)\/reprendre$/, (m, _b, who) => engine.resume(m[1]!, who)],
  [
    "POST",
    /^\/api\/agents\/([\w-]+)\/autonomie$/,
    (m, body, who) => {
      if (!AUTONOMY.includes(body?.level)) throw new BadRequest("Niveau d'autonomie inconnu.");
      engine.setAutonomy(m[1]!, body.level, who);
    },
  ],
];

const server = createServer(async (req, res) => {
  try {
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? "")) return send(res, 403, { erreur: "Hôte refusé." });
    const url = new URL(req.url ?? "/", "http://localhost");
    const person = String(req.headers["x-nova-person"] ?? "");
    if (!cfg.people[person]) return send(res, 401, { erreur: "Personne inconnue." });
    if (acces.estRevoque(person)) return send(res, 403, { erreur: "Ton accès a été révoqué. Adresse-toi à la direction." });
    const who = `humain:${person}`;

    if (url.pathname === "/api/state") return send(res, 200, engine.state(name(person)));
    if (url.pathname === "/api/live") return live(req, res, person);
    if (url.pathname === "/api/ask" && req.method === "POST") return question(res, (await readJson(req))?.question, who);

    for (const [method, re, fn] of routes) {
      const m = url.pathname.match(re);
      if (m && req.method === method) return send(res, 200, (await fn(m, method === "POST" ? await readJson(req) : undefined, who)) ?? { ok: true });
    }
    send(res, 404, { erreur: "Route inconnue." });
  } catch (e) {
    const status = e instanceof NotFound ? 404 : e instanceof Conflict ? 409 : e instanceof BadRequest ? 400 : e instanceof Forbidden ? 403 : 500;
    if (status === 500) console.error(e);
    send(res, status, { erreur: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(port, "127.0.0.1", () => console.log(`nova-gateway : http://127.0.0.1:${port}${demo ? " (démo)" : ""}, questions ${claude ? `avec ${model}` : "désactivées (pas de clé d'API)"}`));

for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => void bus.stop().finally(() => process.exit(0)));

function live(req: IncomingMessage, res: ServerResponse, person: string) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
  res.write(`event: state\ndata: ${JSON.stringify(engine.state(name(person)))}\n\n`);
  clients.set(res, person);
  req.on("close", () => clients.delete(res));
}

/** Une question : la réponse arrive en flux (SSE), étape par étape. */
async function question(res: ServerResponse, q: unknown, who: string) {
  if (typeof q !== "string" || !q.trim() || q.length > 2000) return send(res, 400, { erreur: "Question vide ou trop longue." });
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
  const emit = (e: AskEvent) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  if (!claude) {
    emit({ type: "erreur", text: "Les questions ne sont pas encore activées : il manque la clé d'API Anthropic sur le Hub." });
    return res.end();
  }
  try {
    await ask(q.trim(), {
      create: (p) => claude.beta.messages.create(p),
      bus,
      rights: READ_ALL,
      caller: who,
      company: cfg.company.name,
      today: new Date().toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      model,
      journal,
      onEvent: emit,
    });
  } catch (e) {
    console.error(e);
    const text =
      e instanceof Anthropic.AuthenticationError
        ? "La clé d'API Anthropic est refusée. Vérifie-la sur le Hub."
        : e instanceof Anthropic.RateLimitError
          ? "Trop de questions en même temps. Réessaie dans un instant."
          : e instanceof Anthropic.APIConnectionError
            ? "Le Hub n'arrive pas à joindre le service d'IA. Vérifie la connexion internet."
            : "Une erreur est survenue. Réessaie dans un instant.";
    emit({ type: "erreur", text });
  }
  res.end();
}

function dirigeant(who: string) {
  if (cfg.people[who.replace(/^humain:/, "")]?.role !== "dirigeant") throw new Forbidden("Réservé au dirigeant.");
}

function name(person: string) {
  return cfg.people[person]?.name ?? "";
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
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

function required(n: string): string {
  const v = env[n];
  if (!v) {
    console.error(`Variable ${n} manquante.`);
    process.exit(2);
  }
  return v;
}

class BadRequest extends Error {}
