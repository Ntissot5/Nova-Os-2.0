// L'Atelier : l'entreprise construit ses agents, ses départements et ses règles, sans code.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompanyConfig } from "../core/types.js";
import { Atelier, contrasteBlanc, Introuvable, Invalide } from "./atelier.js";
import { Departements } from "./departements.js";
import { MODELES } from "./modeles.js";
import type { Skill } from "./skills.js";

const sources = () => [
  { id: "mail", droits: ["draft", "read", "send"] },
  { id: "compta", droits: ["payment", "read"] },
  { id: "fichiers", droits: ["read"] },
];

function entreprise(): CompanyConfig {
  return {
    version: "0.1",
    company: { name: "Atelier SA", address: "tu" },
    brand: { accent: "#0A6CFF" },
    people: { noa: { name: "Noa", role: "dirigeant" }, sophie: { name: "Sophie", role: "employe" } },
    apps: [],
    limits: { paymentApprovalAboveCHF: 500, undoDelaySeconds: 120 },
    agents: { compta: { name: "Compta", description: "", autonomy: "je-valide-tout", connectors: { compta: ["read"] }, skills: ["gerance/comptabilite"] } },
    departements: { finance: { name: "Finance", couleur: "#1A7F37", membres: [], agents: ["compta"] } },
  };
}

function monter() {
  const cfg = entreprise();
  const data = mkdtempSync(join(tmpdir(), "nova-atelier-"));
  const at = new Atelier(cfg, data, sources, () => new Date("2026-10-21T22:00:00Z"));
  const journal: string[] = [];
  const skills = new Map<string, Skill>();
  at.brancher({ ajouterAgent: (id) => journal.push(`+${id}`), retirerAgent: (id) => journal.push(`-${id}`), skills, droits: () => journal.push("droits") });
  return { cfg, data, at, journal, skills };
}

const boite = MODELES.find((m) => m.id === "boite-de-reception")!;

test("créer un agent depuis un modèle : il existe aussitôt, avec son métier en Markdown", () => {
  const { cfg, data, at, journal, skills } = monter();
  const a = at.enregistrerAgent({ name: "Accueil", consignes: boite.consignes, declencheur: "mail", sources: { mail: ["read", "draft", "send", "inventé"], telephone: ["read"] } }, "humain:noa");
  assert.equal(a.id, "accueil");
  assert.deepEqual(cfg.agents.accueil?.connectors, { mail: ["read", "draft", "send"] }, "droits inconnus et sources absentes écartés");
  assert.deepEqual(cfg.agents.accueil?.skills, ["atelier/accueil"]);
  assert.equal(cfg.agents.accueil?.autonomy, "je-valide-tout", "prudent par défaut");
  assert.deepEqual(journal, ["+accueil", "droits"]);
  const s = skills.get("accueil")!;
  assert.deepEqual(s.trigger, { kind: "mail" });
  assert.equal(s.triModel, "claude-haiku-5-5", "les mails sont triés par le petit modèle");
  assert.match(readFileSync(join(data, "atelier/agents/accueil.md"), "utf8"), /^---\ndeclencheur: mail\n/);
  assert.ok(cfg.agents.compta, "les agents de company.nix restent");
});

test("des consignes claires, un déclencheur compris, un département qui existe", () => {
  const { at } = monter();
  const base = { name: "X", consignes: "Fais ceci, puis cela, sans rien envoyer.", declencheur: "manuel" };
  assert.throws(() => at.enregistrerAgent({ ...base, name: " " }, "n"), Invalide);
  assert.throws(() => at.enregistrerAgent({ ...base, consignes: "Trop court" }, "n"), Invalide);
  assert.throws(() => at.enregistrerAgent({ ...base, declencheur: "parfois" }, "n"), Invalide);
  assert.throws(() => at.enregistrerAgent({ ...base, declencheur: "quotidien 25:00" }, "n"), Invalide);
  assert.throws(() => at.enregistrerAgent({ ...base, departement: "inconnu" }, "n"), Invalide);
  assert.equal(at.enregistrerAgent({ ...base, declencheur: "quotidien 07:30" }, "n").declencheur, "quotidien 07:30");
});

test("un agent posé à l'installation ne se modifie pas ici", () => {
  const { at } = monter();
  assert.throws(() => at.enregistrerAgent({ id: "compta", name: "Compta", consignes: "Fais ceci, puis cela.", declencheur: "manuel" }, "n"), Invalide);
  assert.throws(() => at.supprimerAgent("compta"), Introuvable);
});

test("modifier garde l'identité de l'agent ; supprimer passe par le moteur", () => {
  const { cfg, at, journal } = monter();
  const a = at.enregistrerAgent({ name: "Relances", consignes: "Relance les factures en retard, poliment.", declencheur: "quotidien 08:00" }, "humain:noa");
  const b = at.enregistrerAgent({ id: a.id, name: "Relances clients", consignes: "Relance les factures en retard, poliment.", declencheur: "quotidien 09:00" }, "humain:sophie");
  assert.equal(b.id, a.id);
  assert.equal(b.creePar, "humain:noa");
  assert.equal(cfg.agents[a.id]?.name, "Relances clients");
  at.supprimerAgent(a.id);
  assert.ok(journal.includes(`-${a.id}`));
  assert.equal(cfg.agents[a.id], undefined);
});

test("départements de l'Atelier : couleur lisible, membres connus, agents rangés dedans", () => {
  const { cfg, at } = monter();
  assert.throws(() => at.enregistrerDepartement({ name: "Ventes", couleur: "#FFD700" }), Invalide, "jaune : texte blanc illisible");
  const d = at.enregistrerDepartement({ name: "Ventes", couleur: "#6E56CF", membres: ["sophie", "inconnu"] });
  assert.deepEqual(cfg.departements?.ventes?.membres, ["sophie"]);
  at.enregistrerAgent({ name: "Devis", consignes: "Prépare les devis demandés par mail.", declencheur: "mail", departement: d.id }, "n");
  assert.deepEqual(cfg.departements?.ventes?.agents, ["devis"]);
  assert.deepEqual(cfg.departements?.finance?.agents, ["compta"], "ceux de company.nix restent");
  // Le gardien voit tout de suite le nouveau département.
  assert.deepEqual(new Departements(cfg).vues("sophie").map((x) => x.id), ["ventes"]);
  assert.throws(() => at.supprimerDepartement(d.id), Invalide, "encore des agents dedans");
  assert.throws(() => at.supprimerDepartement("finance"), Introuvable);
});

test("règles de l'entreprise et reprise après redémarrage", () => {
  const { data, at } = monter();
  at.enregistrerRegles("Toujours vouvoyer les clients.\r\nJamais de promesse de délai.");
  assert.equal(readFileSync(join(data, "memory/regles.md"), "utf8"), "Toujours vouvoyer les clients.\nJamais de promesse de délai.\n");
  at.enregistrerAgent({ name: "Accueil", consignes: boite.consignes, declencheur: "mail", sources: { mail: ["read"] } }, "n");
  const cfg2 = entreprise();
  const at2 = new Atelier(cfg2, data, sources);
  assert.ok(cfg2.agents.accueil);
  assert.deepEqual(at2.declares().accueil, { mail: ["read"] });
  assert.deepEqual(at2.declares().compta, { compta: ["read"] });
  assert.ok(existsSync(join(data, "atelier/atelier.json")));
});

test("chaque modèle se crée tel quel, et le contraste est calculé comme le WCAG", () => {
  const { at } = monter();
  for (const m of MODELES) at.enregistrerAgent({ name: m.nom, consignes: m.consignes, declencheur: m.declencheur, sources: m.sources }, "n");
  assert.equal(at.agents().length, MODELES.length);
  assert.ok(Math.abs(contrasteBlanc("#0B5FD9") - 5.75) < 0.05);
  assert.ok(contrasteBlanc("#FFFFFF") < 1.01);
});
