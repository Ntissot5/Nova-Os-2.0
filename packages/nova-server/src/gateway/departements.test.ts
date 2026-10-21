// Départements (D-029) : chacun ne voit et ne pilote que ses agents ; le dirigeant voit tout ;
// les dossiers passent d'un département à l'autre par « Envoyer à… ».

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompanyConfig, State, Task } from "../core/types.js";
import { Forbidden } from "./bus.js";
import { Departements } from "./departements.js";
import { Invalide, RelaisStore } from "./relais.js";

const agent = (connectors: Record<string, string[]>) => ({ name: "", description: "", autonomy: "je-valide-tout" as const, connectors });
const cfg: CompanyConfig = {
  version: "0.1",
  company: { name: "Régie", address: "tu" },
  brand: { accent: "#0A6CFF" },
  people: { noa: { name: "Noa", role: "dirigeant" }, sophie: { name: "Sophie", role: "employe" }, lea: { name: "Léa", role: "employe" }, paul: { name: "Paul", role: "employe" } },
  apps: [],
  limits: { paymentApprovalAboveCHF: 500, undoDelaySeconds: 120 },
  agents: { locataires: agent({ mail: ["read", "send"], fichiers: ["read"] }), compta: agent({ compta: ["read", "payment"] }) },
  departements: {
    gerance: { name: "Gérance", couleur: "#0B5FD9", membres: ["sophie"], agents: ["locataires"] },
    comptabilite: { name: "Comptabilité", couleur: "#1A7F37", membres: ["lea"], agents: ["compta"] },
    ppe: { name: "PPE", couleur: "#6E56CF", membres: [], agents: [] },
  },
};
const deps = new Departements(cfg);

const tache = (id: string, agentId: string, status: Task["status"] = "en-attente"): Task => ({ id, agentId, title: `Tâche ${id}`, status, startedAt: "2026-10-21T08:00:00Z", steps: [], minutesSaved: 5, outcome: `Fait ${id}` });
const state: State = {
  company: cfg.company,
  me: "",
  demo: false,
  now: "2026-10-21T09:00:00Z",
  agents: [
    { ...cfg.agents.locataires!, id: "locataires", status: "disponible", appsInUse: [], pending: 1, streak: 0 },
    { ...cfg.agents.compta!, id: "compta", status: "disponible", appsInUse: [], pending: 1, streak: 0 },
  ],
  approvals: [
    { id: "t1", agentId: "locataires", summary: "Répondre", createdAt: "" },
    { id: "t2", agentId: "compta", summary: "Payer", createdAt: "" },
  ],
  tasks: [tache("t1", "locataires"), tache("t2", "compta")],
  gains: { minutesThisWeek: 10, tasksThisWeek: 2 },
};

test("une employée ne voit que les agents, tâches et validations de son département", () => {
  const v = deps.filtrer(state, "sophie");
  assert.deepEqual(v.agents.map((a) => a.id), ["locataires"]);
  assert.deepEqual(v.approvals.map((a) => a.id), ["t1"]);
  assert.deepEqual(v.tasks.map((t) => t.id), ["t1"]);
  assert.deepEqual(v.departements?.map((d) => [d.id, d.mien]), [["gerance", true]]);
  // Elle peut envoyer un dossier à tous les départements : leurs noms, rien d'autre.
  assert.deepEqual(v.annuaire?.map((d) => d.id), ["gerance", "comptabilite", "ppe"]);
  assert.deepEqual(Object.keys(v.annuaire![0]!).sort(), ["couleur", "id", "name"]);
});

test("le dirigeant voit tout, tous les départements", () => {
  const v = deps.filtrer(state, "noa");
  assert.equal(v.agents.length, 2);
  assert.equal(v.tasks.length, 2);
  assert.deepEqual(v.departements?.map((d) => [d.id, d.mien]), [["gerance", false], ["comptabilite", false], ["ppe", false]]);
});

test("quelqu'un sans département ne voit aucun agent", () => {
  const v = deps.filtrer(state, "paul");
  assert.deepEqual([v.agents.length, v.tasks.length, v.approvals.length, v.departements?.length], [0, 0, 0, 0]);
});

test("agir sur l'agent d'un autre département est refusé", () => {
  assert.doesNotThrow(() => deps.exigerAgent("sophie", "locataires"));
  assert.throws(() => deps.exigerAgent("sophie", "compta"), Forbidden);
  assert.doesNotThrow(() => deps.exigerAgent("noa", "compta"));
});

test("Demander : chacun interroge les sources de ses agents, en lecture ; le dirigeant, tout", () => {
  const tout = { mail: ["read"], fichiers: ["read"], compta: ["read"], agenda: ["read"], telephone: ["read"] };
  assert.deepEqual(deps.droitsQuestions("sophie", tout), { mail: ["read"], fichiers: ["read"] });
  assert.deepEqual(deps.droitsQuestions("lea", tout), { compta: ["read"] });
  assert.deepEqual(deps.droitsQuestions("noa", tout), tout);
  assert.deepEqual(deps.droitsQuestions("paul", tout), {});
});

test("sans départements déclarés, Nova reste comme avant : tout le monde voit tout", () => {
  const sans = new Departements({ ...cfg, departements: {} });
  assert.equal(sans.filtrer(state, "sophie").agents.length, 2);
  assert.doesNotThrow(() => sans.exigerAgent("sophie", "compta"));
});

test("Envoyer à… : la gérance envoie un dossier à la compta, qui le traite", () => {
  const data = mkdtempSync(join(tmpdir(), "nova-relais-"));
  const store = new RelaisStore(data, deps, (id) => state.tasks.find((t) => t.id === id), () => new Date("2026-10-21T09:30:00Z"));
  const r = store.envoyer({ vers: "comptabilite", titre: "Facture de la fuite d'eau", message: "À payer.", tache: "t1" }, "sophie");
  assert.equal(r.de, "gerance");
  assert.deepEqual(r.tache, { id: "t1", titre: "Tâche t1", resume: "Fait t1" });

  assert.deepEqual(store.pour("lea").map((x) => x.id), [r.id]);
  assert.deepEqual(store.pour("sophie").map((x) => x.id), [r.id]);
  assert.deepEqual(store.pour("paul"), []);
  assert.equal(store.pour("noa").length, 1);

  assert.throws(() => store.traiter(r.id, "sophie"), Forbidden);
  assert.equal(store.traiter(r.id, "lea").traite?.par, "lea");
  assert.match(readFileSync(join(data, "relais/relais.json"), "utf8"), /Facture de la fuite/);
});

test("Envoyer à… : on n'envoie qu'au nom de ses départements, une tâche qu'on voit, à un département qui existe", () => {
  const store = new RelaisStore(mkdtempSync(join(tmpdir(), "nova-relais-")), deps, (id) => state.tasks.find((t) => t.id === id));
  assert.throws(() => store.envoyer({ de: "comptabilite", vers: "ppe", titre: "x" }, "sophie"), Forbidden);
  assert.throws(() => store.envoyer({ vers: "ppe", titre: "x", tache: "t2" }, "sophie"), Forbidden);
  assert.throws(() => store.envoyer({ vers: "inconnu", titre: "x" }, "sophie"), Invalide);
  assert.throws(() => store.envoyer({ vers: "gerance", titre: "x" }, "sophie"), Invalide);
  assert.throws(() => store.envoyer({ vers: "ppe", titre: " " }, "sophie"), Invalide);
  assert.equal(store.envoyer({ vers: "ppe", titre: "Budget toiture" }, "noa").de, "direction");
  assert.equal(store.envoyer({ de: "gerance", vers: "ppe", titre: "Depuis la gérance" }, "noa").de, "gerance");
});
