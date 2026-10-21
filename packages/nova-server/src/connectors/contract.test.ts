// Tests de contrat des connecteurs : chaque connecteur tourne comme un vrai serveur MCP (stdio),
// interrogé par un vrai client MCP, sur une copie des données de l'entreprise de démonstration.
// Le contrat : les outils exposés, leurs droits, leur caractère sensible, et leurs réponses.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const fixtures = fileURLToPath(new URL("../../../../companies/demo/data", import.meta.url));

type Data = Record<string, any>;

async function connect(entry: string, extraEnv: Record<string, string> = {}) {
  const data = mkdtempSync(join(tmpdir(), "nova-contrat-"));
  cpSync(fixtures, data, { recursive: true });
  const client = new Client({ name: "nova-contrat", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(here, entry)],
      env: { PATH: process.env.PATH ?? "", NOVA_DATA: data, NOVA_TODAY: "2026-10-21", ...extraEnv },
      stderr: "inherit",
    }),
  );
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<Data> => {
    const res = await client.callTool({ name, arguments: args });
    if (res.isError) throw new Error((res.content as { text: string }[])[0]?.text);
    return res.structuredContent as Data;
  };
  return { client, call, data };
}

async function contract(client: Client, expected: Record<string, { right: string; sensitive?: boolean }>) {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), Object.keys(expected).sort());
  for (const t of tools) {
    const e = expected[t.name]!;
    assert.equal(t._meta?.["nova/right"], e.right, `${t.name} : droit`);
    assert.equal(Boolean(t._meta?.["nova/sensitive"]), Boolean(e.sensitive), `${t.name} : sensible`);
    assert.equal(t.annotations?.readOnlyHint, e.right === "read", `${t.name} : lecture seule`);
    if (e.sensitive) {
      assert.equal(t.annotations?.destructiveHint, true, `${t.name} : destructif`);
      assert.ok("dryRun" in (t.inputSchema.properties ?? {}), `${t.name} : aperçu (dryRun)`);
    }
    assert.ok(t.description && t.description.length > 20, `${t.name} : description`);
  }
}

describe("connecteur Fichiers", () => {
  let c: Awaited<ReturnType<typeof connect>>;
  before(async () => (c = await connect("fichiers.js")));
  after(() => c.client.close());

  test("contrat", () =>
    contract(c.client, {
      fichiers_chercher: { right: "read" },
      fichiers_lister: { right: "read" },
      fichiers_lire: { right: "read" },
      fichiers_ecrire: { right: "write" },
      fichiers_supprimer: { right: "delete", sensitive: true },
    }));

  test("trouve le concierge par le contenu, sans accents", async () => {
    const r = await c.call("fichiers_chercher", { query: "concierge" });
    assert.ok(r.items.some((f: Data) => f.path === "immeubles/rue-du-lac-14.md" && /Favre/.test(f.excerpt)));
    const r2 = await c.call("fichiers_chercher", { query: "urgence" });
    assert.ok(r2.items.some((f: Data) => f.path === "procedures/urgences.md"));
  });

  test("refuse de sortir du dossier de l'entreprise", async () => {
    await assert.rejects(c.call("fichiers_lire", { path: "../../etc/passwd" }), /Chemin refusé/);
  });

  test("une suppression va à la corbeille", async () => {
    const preview = await c.call("fichiers_supprimer", { path: "baux/bail-rossi.md", dryRun: true });
    assert.match(preview.summary, /corbeille/);
    assert.ok(existsSync(join(c.data, "files/baux/bail-rossi.md")), "l'aperçu ne supprime rien");
    await c.call("fichiers_supprimer", { path: "baux/bail-rossi.md" });
    assert.ok(!existsSync(join(c.data, "files/baux/bail-rossi.md")));
    const day = readdirSync(join(c.data, ".corbeille"))[0]!;
    assert.ok(existsSync(join(c.data, ".corbeille", day, "baux/bail-rossi.md")));
  });
});

describe("connecteur Mail (Maildir)", () => {
  let c: Awaited<ReturnType<typeof connect>>;
  before(async () => (c = await connect("mail/index.js", { NOVA_MAIL_FROM: "regie@example.org" })));
  after(() => c.client.close());

  test("contrat", () =>
    contract(c.client, {
      mail_chercher: { right: "read" },
      mail_lire: { right: "read" },
      mail_brouillon: { right: "draft" },
      mail_envoyer: { right: "send", sensitive: true },
    }));

  test("cherche du plus récent au plus ancien et lit un mail", async () => {
    const r = await c.call("mail_chercher", { limit: 3 });
    assert.equal(r.items.length, 3);
    assert.match(r.items[0].subject, /Fuite d'eau/);
    const fuite = await c.call("mail_lire", { id: r.items[0].id });
    assert.match(fuite.text, /Rue du Lac 14/);
    const keller = await c.call("mail_chercher", { expediteur: "keller" });
    assert.equal(keller.items.length, 1);
    const depuis = await c.call("mail_chercher", { depuis: "2026-10-20" });
    assert.equal(depuis.items.length, 3);
  });

  test("brouillon, aperçu, puis envoi", async () => {
    const d = await c.call("mail_brouillon", { a: ["Favre Jean <j.favre.concierge@example.org>"], sujet: "Fuite Rue du Lac 14", texte: "Pouvez-vous passer ?" });
    const preview = await c.call("mail_envoyer", { id: d.id, dryRun: true });
    assert.equal(preview.recipients, 1);
    assert.equal(preview.unknownRecipient, false, "M. Favre a déjà écrit à la régie");
    const inconnu = await c.call("mail_brouillon", { a: ["quelquun@inconnu.example.org"], sujet: "Test", texte: "Test" });
    assert.equal((await c.call("mail_envoyer", { id: inconnu.id, dryRun: true })).unknownRecipient, true);
    const sent = await c.call("mail_envoyer", { id: d.id });
    assert.match(sent.envoye, /^envoyes:/);
    const envoyes = await c.call("mail_chercher", { dossier: "envoyes" });
    assert.equal(envoyes.items.length, 1);
    await assert.rejects(c.call("mail_envoyer", { id: d.id }), /introuvable/);
  });
});

describe("connecteur Agenda (iCalendar)", () => {
  let c: Awaited<ReturnType<typeof connect>>;
  before(async () => (c = await connect("agenda.js")));
  after(() => c.client.close());

  test("contrat", () =>
    contract(c.client, {
      agenda_evenements: { right: "read" },
      agenda_creer: { right: "write" },
    }));

  test("liste la semaine, récurrences comprises", async () => {
    const r = await c.call("agenda_evenements", { du: "2026-10-19", au: "2026-10-25" });
    const titres = r.items.map((e: Data) => e.titre);
    assert.ok(titres.includes("Colloque de l'équipe"), "récurrence hebdomadaire du lundi");
    assert.ok(titres.some((t: string) => t.startsWith("Visite appartement")));
    assert.ok(titres.some((t: string) => t.startsWith("État des lieux")));
    assert.ok(!titres.some((t: string) => t.startsWith("Assemblée")), "le 28 est hors de la semaine");
  });

  test("crée un rendez-vous et le retrouve", async () => {
    await c.call("agenda_creer", { titre: "Passage du sanitaire chez Mme Rossi", debut: "2026-10-21T14:00:00+02:00", fin: "2026-10-21T15:00:00+02:00", lieu: "Rue du Lac 14" });
    const r = await c.call("agenda_evenements", { du: "2026-10-21", au: "2026-10-21", texte: "rossi" });
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0].debut, "2026-10-21T12:00:00.000Z");
  });
});

describe("connecteur Compta (CSV)", () => {
  let c: Awaited<ReturnType<typeof connect>>;
  before(async () => (c = await connect("compta.js")));
  after(() => c.client.close());

  test("contrat", () =>
    contract(c.client, {
      compta_loyers: { right: "read" },
      compta_retards: { right: "read" },
      compta_paiements: { right: "read" },
      compta_factures: { right: "read" },
      compta_payer: { right: "payment", sensitive: true },
    }));

  test("loyers d'octobre : 8 attendus, 5 payés", async () => {
    const r = await c.call("compta_loyers", { mois: "2026-10" });
    assert.equal(r.attendus, 8);
    assert.equal(r.payes, 5);
    assert.equal(r.totalDu, 1650 + 2100 + 1110 - 555);
  });

  test("retards de plus de 10 jours : Dupont, Berset, Ochsner (solde)", async () => {
    const r = await c.call("compta_retards", { joursMin: 10 });
    assert.deepEqual(r.retards.map((x: Data) => x.locataire).sort(), ["Berset Claire", "Dupont Marc", "Ochsner Paul"]);
    assert.ok(r.retards.every((x: Data) => x.retardJours === 20));
  });

  test("payer une facture : aperçu avec montant, puis ordre de paiement", async () => {
    const preview = await c.call("compta_payer", { facture: "2026-418", dryRun: true });
    assert.equal(preview.amountCHF, 1240.5);
    await c.call("compta_payer", { facture: "2026-418" });
    assert.match(readFileSync(join(c.data, "compta/ordres.csv"), "utf8"), /2026-418;Sanitaires Morel SA;1240.50/);
    const r = await c.call("compta_factures", { statut: "a-payer" });
    assert.deepEqual(r.items.map((f: Data) => f.id), ["SW-88412"]);
    await assert.rejects(c.call("compta_payer", { facture: "2026-418" }), /déjà payée/);
  });
});

describe("connecteur Téléphone (CSV)", () => {
  let c: Awaited<ReturnType<typeof connect>>;
  before(async () => (c = await connect("telephone.js")));
  after(() => c.client.close());

  test("contrat", () => contract(c.client, { telephone_appels: { right: "read" } }));

  test("appels manqués et recherche par contact", async () => {
    const manques = await c.call("telephone_appels", { sens: "manque" });
    assert.equal(manques.items.length, 2);
    assert.equal(manques.items[0].contact, "Maria Rossi");
    const favre = await c.call("telephone_appels", { contact: "favre" });
    assert.equal(favre.items[0].duree, 184);
  });
});
