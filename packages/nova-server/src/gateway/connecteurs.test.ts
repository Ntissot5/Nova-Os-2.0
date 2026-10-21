// Connecteurs ajoutés : un vrai serveur MCP distant (Streamable HTTP) qui ne connaît rien de Nova,
// branché, utilisé, réglé et retiré comme le ferait le dirigeant depuis l'écran Connecteurs.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { decide } from "../core/autonomy.js";
import type { CompanyConfig } from "../core/types.js";
import { Bus, Forbidden } from "./bus.js";
import { adresse, Connecteurs, identifiant, Invalide } from "./connecteurs.js";

const JETON = "secret-crm";
const crees: string[] = [];
let http: Server;
let url: string;
let dir: string;
let bus: Bus;
let cfg: CompanyConfig;
let c: Connecteurs;

/** Un CRM tiers : un outil de lecture déclaré, un outil d'écriture, réponses en texte seul. */
function crm() {
  const s = new McpServer({ name: "crm", version: "1.0.0" });
  s.registerTool("chercher_client", { description: "Cherche un client", inputSchema: { nom: z.string() }, annotations: { readOnlyHint: true } }, async ({ nom }) => ({
    content: [{ type: "text", text: `Client ${nom} : actif depuis 2019` }],
  }));
  s.registerTool("creer_client", { description: "Crée un client", inputSchema: { nom: z.string() } }, async ({ nom }) => {
    crees.push(nom);
    return { content: [{ type: "text", text: `Créé : ${nom}` }] };
  });
  return s;
}

before(async () => {
  http = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${JETON}`) return void res.writeHead(401).end();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => void transport.close());
    await crm().connect(transport);
    await transport.handleRequest(req, res);
  });
  await new Promise<void>((ok) => http.listen(0, "127.0.0.1", ok));
  url = `http://127.0.0.1:${(http.address() as { port: number }).port}/mcp`;

  dir = mkdtempSync(join(tmpdir(), "nova-connecteurs-"));
  bus = new Bus({ write: () => {} }, { NOVA_DATA: join(dir, "data") });
  await bus.start(["fichiers"]);
  cfg = {
    version: "0.1",
    company: { name: "Régie", address: "tu" },
    brand: { accent: "#0A6CFF" },
    people: { noa: { name: "Noa", role: "dirigeant" } },
    apps: [],
    limits: { paymentApprovalAboveCHF: 500, undoDelaySeconds: 120 },
    agents: { locataires: { name: "Locataires", description: "", autonomy: "autonome", connectors: { fichiers: ["read"] } } },
  };
  c = new Connecteurs(bus, cfg, join(dir, "data"), join(dir, "secrets"));
  await c.start();
});
after(async () => {
  await bus.stop();
  http.close();
});

test("un mauvais jeton : rien n'est enregistré", async () => {
  await assert.rejects(c.ajouter({ nom: "CRM", url, jeton: "faux" }, "humain:noa"), (e: Error) => e instanceof Invalide && /jeton/.test(e.message));
  assert.equal(c.liste().length, 0);
  assert.ok(!existsSync(join(dir, "secrets/connecteurs/crm.jeton")));
});

test("ajouter un service MCP : ses outils arrivent, le jeton reste hors de data/", async () => {
  const e = await c.ajouter({ nom: "CRM", url, jeton: JETON, agents: ["locataires", "inconnu"], acces: "actions" }, "humain:noa");
  assert.equal(e.etat, "branche");
  assert.deepEqual(
    e.outils.map((o) => [o.nom, o.lecture]),
    [
      ["chercher_client", true],
      ["creer_client", false],
    ],
  );
  assert.deepEqual(e.agents, ["locataires"]);
  assert.equal(e.toujoursValider, true);
  const enregistre = readFileSync(join(dir, "data/connecteurs/ajoutes.json"), "utf8");
  assert.ok(!enregistre.includes(JETON));
  assert.equal(statSync(join(dir, "secrets/connecteurs/crm.jeton")).mode & 0o777, 0o600);
  assert.deepEqual(cfg.agents.locataires!.connectors, { fichiers: ["read"], crm: ["read", "write"] });
});

test("la lecture passe tout de suite ; l'écriture est sensible et attend un humain, même en autonome", async () => {
  const r = cfg.agents.locataires!.connectors;
  const out = await bus.call("agent:locataires", r, "crm__chercher_client", { nom: "Muller" }, "test");
  assert.match(String(out.texte), /Muller : actif/);

  await assert.rejects(bus.call("agent:locataires", r, "crm__creer_client", { nom: "Rossi" }, "test"), Forbidden);
  const p = await bus.preview("agent:locataires", r, "crm__creer_client", { nom: "Rossi" });
  assert.match(p.summary, /CRM : creer_client \(nom = Rossi\)/);
  const d = decide({ tool: "crm__creer_client", summary: p.summary, sensitive: true, toujoursValider: p.toujoursValider, why: { rule: "", sources: [] } }, "autonome", cfg.limits);
  assert.equal(d.kind, "validation");
  assert.deepEqual(crees, []);

  await bus.call("agent:locataires", r, "crm__creer_client", { nom: "Rossi" }, "validé", true);
  assert.deepEqual(crees, ["Rossi"]);
});

test("une question (lecture) voit le connecteur ; un agent sans droit, non", () => {
  assert.ok(bus.tools(bus.readAll()).some((t) => t.name === "crm__chercher_client"));
  assert.ok(!bus.tools(bus.readAll()).some((t) => t.name === "crm__creer_client"));
  assert.ok(!bus.tools({ fichiers: ["read"] }).some((t) => t.connector === "crm"));
});

test("régler : lecture seule et autonomie de l'agent", async () => {
  const e = await c.regler("crm", { acces: "lecture", toujoursValider: false });
  assert.equal(e?.etat, "branche");
  assert.deepEqual(cfg.agents.locataires!.connectors.crm, ["read"]);
  const p = await bus.preview("agent:locataires", { crm: ["read", "write"] }, "crm__creer_client", { nom: "X" });
  assert.equal(p.toujoursValider, undefined);
});

test("au redémarrage, le connecteur est rebranché avec son jeton", async () => {
  const bus2 = new Bus({ write: () => {} }, { NOVA_DATA: join(dir, "data") });
  await bus2.start(["fichiers"]);
  const cfg2 = structuredClone(cfg);
  cfg2.agents.locataires!.connectors = { fichiers: ["read"] };
  const c2 = new Connecteurs(bus2, cfg2, join(dir, "data"), join(dir, "secrets"));
  await c2.start();
  assert.equal(c2.liste()[0]?.etat, "branche");
  assert.deepEqual(cfg2.agents.locataires!.connectors.crm, ["read"]);
  await bus2.stop();
});

test("un jeton perdu (après un import) se redonne depuis Régler", async () => {
  const c2 = new Connecteurs(bus, cfg, join(dir, "data"), join(dir, "secrets-neufs"));
  await bus.removeRemote("crm");
  await c2.start();
  assert.equal(c2.liste()[0]?.etat, "erreur");
  assert.equal((await c2.regler("crm", { jeton: JETON }))?.etat, "branche");
  await bus.removeRemote("crm");
  await c.start();
});

test("retirer : outils, droits et jeton disparaissent", async () => {
  await c.retirer("crm");
  assert.equal(c.liste().length, 0);
  assert.ok(!bus.tools(bus.readAll()).some((t) => t.connector === "crm"));
  assert.deepEqual(cfg.agents.locataires!.connectors, { fichiers: ["read"] });
  assert.ok(!existsSync(join(dir, "secrets/connecteurs/crm.jeton")));
});

test("adresses refusées et identifiants", () => {
  assert.throws(() => adresse("http://crm.example.ch/mcp"), /https/);
  assert.throws(() => adresse("https://moi:pass@crm.example.ch/mcp"), /identifiant/);
  assert.throws(() => adresse("pas une adresse"), Invalide);
  assert.equal(adresse("https://crm.example.ch/mcp"), "https://crm.example.ch/mcp");
  assert.equal(identifiant("Microsoft 365", []), "microsoft-365");
  assert.equal(identifiant("Gérance", ["gerance"]), "gerance-2");
  assert.equal(identifiant("Mail", ["mail"]), "mail-2");
});
