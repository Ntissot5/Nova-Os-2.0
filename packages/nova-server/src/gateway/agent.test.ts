// Scénarios de bout en bout rejouables (Phase 2) : les vrais agents, les vrais connecteurs sur les données
// de démonstration, et un faux Claude scripté à la place du modèle.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import type { CompanyConfig, Task } from "../core/types.js";
import type { Create } from "./ask.js";
import { Bus } from "./bus.js";
import { Engine } from "./engine.js";
import { loadSkill } from "./skills.js";
import { Triggers } from "./triggers.js";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const lines: Record<string, any>[] = [];
const journal = { write: (e: Record<string, unknown>) => void lines.push(e) };
let data: string;
let bus: Bus;

const cfg: CompanyConfig = {
  version: "0.1",
  company: { name: "Régie Démo SA", address: "tu" },
  brand: { accent: "#0A6CFF" },
  people: { noa: { name: "Noa", role: "dirigeant" } },
  apps: [],
  limits: { paymentApprovalAboveCHF: 500, undoDelaySeconds: 120 },
  agents: {
    locataires: { name: "Locataires", description: "", autonomy: "je-valide-l-important", connectors: { mail: ["read", "draft", "send"], fichiers: ["read"] }, skills: ["gerance/tri-demandes"] },
    compta: { name: "Compta", description: "", autonomy: "autonome", connectors: { compta: ["read", "payment"], mail: ["read"] }, skills: ["gerance/comptabilite"] },
  },
};
const NOW = () => new Date("2026-10-21T09:00:00+02:00");

before(async () => {
  data = mkdtempSync(join(tmpdir(), "nova-agents-"));
  cpSync(join(root, "companies/demo/data"), data, { recursive: true });
  bus = new Bus(journal, { NOVA_DATA: data, NOVA_TODAY: "2026-10-21" });
  await bus.start();
});
after(() => bus.stop());

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
const usage = { input_tokens: 2000, output_tokens: 150, cache_read_input_tokens: 1500, cache_creation_input_tokens: 0 };
const reply = (stop: string, content: unknown[], model = "claude-sonnet-5-5") =>
  ({ id: "m", type: "message", role: "assistant", model, stop_reason: stop, content, usage }) as unknown as Anthropic.Beta.Messages.BetaMessage;
const use = (id: string, name: string, input: Record<string, unknown>) => ({ type: "tool_use", id, name, input });
const lastResults = (p: Params) => (p.messages.at(-1)!.content as Anthropic.Beta.Messages.BetaToolResultBlockParam[]).map((r) => String(r.content));
const until = async (what: string, fn: () => boolean, ms = 10000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error(`Délai dépassé : ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

/** Le modèle de tri ne retient que la fuite d'eau ; l'agent Locataires suit le métier pas à pas. */
const locataires: Create = async (p) => {
  const text = JSON.stringify(p.messages);
  if (p.output_config?.format) {
    const urgent = text.includes("Fuite");
    return reply("end_turn", [{ type: "text", text: JSON.stringify(urgent ? { categorie: "urgence", agir: true, resume: "Mme Rossi signale une fuite d'eau, Rue du Lac 14." } : { categorie: "information", agir: false, resume: "Mail sans action pour l'agent." }) }], "claude-haiku-5-5");
  }
  switch (p.messages.length) {
    case 1:
      assert.ok(String(p.system).includes("Tri des demandes des locataires"), "le skill est dans le prompt système");
      assert.ok(String(p.system).includes("le concierge est prévenu dans l'heure"), "les règles de l'entreprise aussi");
      return reply("tool_use", [use("a", "fichiers_chercher", { query: "Rue du Lac 14" }), use("b", "fichiers_lire", { path: "procedures/urgences.md" })]);
    case 3: {
      assert.match(lastResults(p)[0]!, /Jean Favre/);
      return reply("tool_use", [use("c", "mail_brouillon", { a: ["Jean Favre <j.favre.concierge@example.org>"], sujet: "Fuite d'eau, Rue du Lac 14", texte: "Bonjour Monsieur Favre,\n\nMme Rossi (3e étage) signale une fuite sous l'évier. Pouvez-vous passer aujourd'hui ?\n\nLa régie" })]);
    }
    case 5: {
      const id = JSON.parse(lastResults(p)[0]!).id;
      return reply("tool_use", [use("d", "mail_envoyer", { id })]);
    }
    case 7:
      assert.match(lastResults(p)[0]!, /Action enregistrée/);
      return reply("tool_use", [use("e", "terminer", { resultat: "Concierge prévenu de la fuite chez Mme Rossi.", regle: "Une fuite d'eau est urgente : concierge prévenu dans l'heure.", refRegle: "regles.md#urgences", sources: ["Mail de Mme Rossi", "Fiche Rue du Lac 14"] })]);
    default:
      return reply("end_turn", [{ type: "text", text: "Fait." }]);
  }
};

test("Locataires : chaque nouveau mail est trié, la fuite d'eau est traitée de bout en bout", async () => {
  const engine = new Engine(cfg, journal, { demo: false, speed: 1, me: "Noa", bus, now: NOW });
  const skills = new Map([["locataires", loadSkill(join(root, "verticals"), "gerance/tri-demandes")]]);
  const t = new Triggers({ engine, bus, journal, create: locataires, cfg, skills, data, memory: () => readFileSync(join(data, "memory/regles.md"), "utf8"), now: NOW });
  engine.on("change", () => t.drain());
  await t.tick();

  // Les mails des 72 dernières heures : Berset, Keller, Morel, Rossi. Un seul demande d'agir.
  await until("4 mails traités", () => engine.state().tasks.filter((x) => x.status !== "en-cours").length === 4);
  const tasks = engine.state().tasks;
  const fuite = tasks.find((x) => x.title.startsWith("Fuite d'eau"))!;
  assert.equal(fuite.status, "differe", "un envoi courant à un contact connu part après le délai d'annulation");
  assert.deepEqual(fuite.action!.calls!.map((c) => c.tool), ["mail_envoyer"]);
  assert.match(fuite.action!.summary, /Envoyer « Fuite d'eau, Rue du Lac 14 » à Jean Favre/);
  assert.equal(fuite.outcome, "Concierge prévenu de la fuite chez Mme Rossi.");
  assert.equal(fuite.action!.why.ruleRef, "regles.md#urgences");
  assert.equal(fuite.doc?.title, "Fuite d'eau, Rue du Lac 14");
  assert.ok(fuite.steps.some((s) => s.app === "fichiers" && /Je cherche dans les fichiers/.test(s.text)), "les étapes sont visibles");
  assert.ok(fuite.steps.some((s) => /C'est urgent/.test(s.text)), "le tri est visible");
  assert.equal(tasks.filter((x) => x.outcome?.startsWith("Mail trié")).length, 3);

  // Le brouillon existe, mais rien n'est parti : l'envoi attend la fin du délai d'annulation.
  assert.equal(readdirSync(join(data, "mail/.Brouillons/cur")).length, 1);
  assert.equal(readdirSync(join(data, "mail/.Envoyes/cur")).length, 0);

  // Un second passage ne retraite aucun mail.
  await t.tick();
  assert.equal(engine.state().tasks.length, 4);

  // Le coût du tri (Haiku) et du travail (Sonnet) est journalisé séparément.
  assert.ok(lines.some((l) => l.quoi === "tri" && l.modele === "claude-haiku-5-5" && l.coutUSD > 0));
  assert.ok(lines.some((l) => l.quoi === "agent.travail" && l.qui === "agent:locataires" && l.modele === "claude-sonnet-5-5"));
});

test("une action sensible appelée par l'agent n'est jamais exécutée par lui : même en autonome, le plafond tient", async () => {
  const engine = new Engine(cfg, journal, { demo: false, speed: 1, me: "Noa", bus, now: NOW });
  const create: Create = async (p) =>
    p.messages.length === 1
      ? reply("tool_use", [use("a", "compta_payer", { facture: "2026-418" })])
      : reply("tool_use", [use("b", "terminer", { resultat: "Facture Morel prête au paiement.", regle: "Facture conforme au bon de commande.", sources: ["Facture 2026-418"] })]);
  const { runAgent } = await import("./agent.js");
  const skill = loadSkill(join(root, "verticals"), "gerance/comptabilite");
  const task: Task = engine.run("compta", "Tournée du jour", (ctx) =>
    runAgent(ctx, { create, bus, journal, agentId: "compta", agentName: "Compta", rights: cfg.agents.compta!.connectors, skill, company: "Régie Démo SA", memory: "", today: "mardi 21 octobre 2026" }, "Fais ta tournée."),
  );
  await until("décision prise", () => task.status !== "en-cours");
  assert.equal(task.status, "en-attente", "1’240.50 CHF dépasse le plafond de 500 CHF");
  assert.equal(task.action?.amountCHF, 1240.5, "le montant vient de l'aperçu du connecteur");
  assert.ok(!existsSync(join(data, "compta/ordres.csv")), "rien n'a été payé");
  engine.approve(task.id, "humain:noa");
  await until("payé", () => existsSync(join(data, "compta/ordres.csv")));
});

test("reprendre la main arrête l'agent : aucune action n'est proposée", async () => {
  const engine = new Engine(cfg, journal, { demo: false, speed: 1, me: "Noa", bus, now: NOW });
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const create: Create = async (p) => {
    await gate;
    return p.messages.length === 1 ? reply("tool_use", [use("a", "compta_factures", {})]) : reply("tool_use", [use("b", "compta_payer", { facture: "SW-88412" })]);
  };
  const { runAgent } = await import("./agent.js");
  const skill = loadSkill(join(root, "verticals"), "gerance/comptabilite");
  const task = engine.run("compta", "Tournée", (ctx) =>
    runAgent(ctx, { create, bus, journal, agentId: "compta", agentName: "Compta", rights: cfg.agents.compta!.connectors, skill, company: "Régie Démo SA", memory: "", today: "" }, "Fais ta tournée."),
  );
  engine.stop(task.id, "humain:noa");
  release();
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(task.status, "arretee");
  assert.equal(task.action, undefined);
});

test("un agent créé dans l'Atelier travaille aussitôt, avec ses consignes et les garde-fous de toujours", async () => {
  const { Atelier } = await import("./atelier.js");
  const vivant = structuredClone(cfg);
  const atelier = new Atelier(vivant, data, () => bus.droitsDisponibles(), NOW);
  const engine = new Engine(vivant, journal, { demo: false, speed: 1, me: "Noa", bus, now: NOW });
  const skills = new Map<string, ReturnType<typeof loadSkill>>();
  const create: Create = async (p) => {
    if (p.messages.length === 1) {
      assert.ok(String(p.system).includes("Paie la facture Swisscom dès qu'elle est conforme."), "les consignes écrites dans l'Atelier sont dans le prompt");
      assert.ok(!(p.tools ?? []).some((t) => "name" in t && t.name === "mail_envoyer"), "pas d'outil hors des sources choisies");
      return reply("tool_use", [use("a", "compta_payer", { facture: "SW-88412" })]);
    }
    return reply("tool_use", [use("b", "terminer", { resultat: "Facture Swisscom prête au paiement.", regle: "Consignes de l'Atelier.", sources: ["Facture SW-88412"] })]);
  };
  const t = new Triggers({ engine, bus, journal, create, cfg: vivant, skills, data, memory: () => "", now: NOW });
  atelier.brancher({ ajouterAgent: (id, a) => engine.ajouterAgent(id, a), retirerAgent: (id) => engine.retirerAgent(id), skills, droits: () => {} });
  engine.on("change", () => t.drain());

  atelier.enregistrerAgent(
    { name: "Fournisseurs", consignes: "Paie la facture Swisscom dès qu'elle est conforme.", declencheur: "manuel", sources: { compta: ["read", "payment"] }, autonomy: "autonome" },
    "humain:noa",
  );
  assert.ok(engine.state().agents.some((a) => a.id === "fournisseurs"));
  t.runNow("fournisseurs");
  await until("décision prise", () => engine.state().tasks.some((x) => x.agentId === "fournisseurs" && x.status !== "en-cours"));
  const task = engine.state().tasks.find((x) => x.agentId === "fournisseurs")!;
  assert.equal(task.status, "differe", "autonome : le paiement de 89.90 CHF part, mais seulement après le délai d'annulation");
  assert.equal(task.action?.amountCHF, 89.9);
});
