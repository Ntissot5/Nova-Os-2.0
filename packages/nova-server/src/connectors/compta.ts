#!/usr/bin/env node
// Connecteur Compta : les exports du logiciel comptable de l'entreprise, en CSV dans data/compta/.
//   loyers.csv     locataire;immeuble;objet;montant;echeance      (loyers attendus, échéance AAAA-MM-JJ)
//   paiements.csv  date;locataire;montant;reference               (paiements reçus)
//   factures.csv   id;fournisseur;objet;montant;echeance;statut   (factures fournisseurs : a-payer, payee)
//   ordres.csv     date;facture;fournisseur;montant;iban          (paiements ordonnés par Nova, à transmettre à la banque)
// Un connecteur d'API par logiciel (Abacus, bexio…) viendra avec le logiciel du pilote ; ces outils ne changent pas.

import { join } from "node:path";
import { z } from "zod";
import { RIGHT, SENSITIVE, amount, appendCsv, dataDir, guard, norm, ok, readCsv, serve, server } from "./kit.js";

const dir = dataDir("compta");
const csv = (name: string) => readCsv(join(dir, name));
const s = server("compta");
const today = () => process.env.NOVA_TODAY ?? new Date().toISOString().slice(0, 10);

function rents(month: string) {
  const expected = csv("loyers.csv").filter((r) => r.echeance?.startsWith(month));
  const paid = csv("paiements.csv");
  return expected.map((r) => {
    const recu = paid
      .filter((p) => norm(p.locataire ?? "") === norm(r.locataire ?? "") && (p.date ?? "") >= month && (p.reference ?? "").includes(month))
      .reduce((s, p) => s + amount(p.montant), 0);
    const du = amount(r.montant);
    const retardJours = Math.max(0, Math.floor((Date.parse(today()) - Date.parse(r.echeance ?? today())) / 86400000));
    return { locataire: r.locataire, immeuble: r.immeuble, objet: r.objet, du, recu, solde: Math.round((du - recu) * 100) / 100, echeance: r.echeance, retardJours: recu >= du ? 0 : retardJours };
  });
}

s.registerTool(
  "compta_loyers",
  {
    title: "Loyers du mois",
    description: "Loyers attendus et reçus pour un mois (AAAA-MM), locataire par locataire, avec le solde et les jours de retard.",
    inputSchema: { mois: z.string().regex(/^\d{4}-\d{2}$/) },
    annotations: { readOnlyHint: true },
    _meta: { [RIGHT]: "read" },
  },
  guard(({ mois }) => {
    const list = rents(mois);
    return ok({ mois, attendus: list.length, payes: list.filter((r) => r.solde <= 0).length, totalDu: sum(list.map((r) => r.solde)), loyers: list });
  }),
);

s.registerTool(
  "compta_retards",
  {
    title: "Loyers en retard",
    description: "Locataires en retard d'au moins `joursMin` jours (10 par défaut), tous mois confondus.",
    inputSchema: { joursMin: z.number().int().min(0).optional() },
    annotations: { readOnlyHint: true },
    _meta: { [RIGHT]: "read" },
  },
  guard(({ joursMin = 10 }) => {
    const months = [...new Set(csv("loyers.csv").map((r) => (r.echeance ?? "").slice(0, 7)))].filter((m) => m && m <= today().slice(0, 7));
    const late = months.flatMap(rents).filter((r) => r.solde > 0 && r.retardJours >= joursMin);
    return ok({ total: sum(late.map((r) => r.solde)), retards: late });
  }),
);

s.registerTool(
  "compta_paiements",
  {
    title: "Paiements reçus",
    description: "Paiements reçus entre deux dates (AAAA-MM-JJ), filtrés par locataire si besoin.",
    inputSchema: { du: z.string(), au: z.string(), locataire: z.string().optional() },
    annotations: { readOnlyHint: true },
    _meta: { [RIGHT]: "read" },
  },
  guard(({ du, au, locataire }) => {
    const q = locataire ? norm(locataire) : undefined;
    const list = csv("paiements.csv").filter((p) => (p.date ?? "") >= du && (p.date ?? "") <= au && (!q || norm(p.locataire ?? "").includes(q)));
    return ok({ total: sum(list.map((p) => amount(p.montant))), paiements: list.map((p) => ({ ...p, montant: amount(p.montant) })) });
  }),
);

s.registerTool(
  "compta_factures",
  {
    title: "Factures fournisseurs",
    description: "Factures fournisseurs, filtrées par statut (« a-payer » ou « payee ») si besoin.",
    inputSchema: { statut: z.enum(["a-payer", "payee"]).optional() },
    annotations: { readOnlyHint: true },
    _meta: { [RIGHT]: "read" },
  },
  guard(({ statut }) => ok(invoices().filter((f) => !statut || f.statut === statut))),
);

s.registerTool(
  "compta_payer",
  {
    title: "Payer une facture",
    description: "Ordonne le paiement d'une facture fournisseur (ajouté aux ordres à transmettre à la banque).",
    inputSchema: { facture: z.string(), dryRun: z.boolean().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    _meta: { [RIGHT]: "payment", [SENSITIVE]: true },
  },
  guard(({ facture, dryRun }) => {
    const f = invoices().find((x) => x.id === facture);
    if (!f) throw new Error(`Facture introuvable : ${facture}`);
    if (f.statut === "payee") throw new Error(`La facture ${facture} est déjà payée.`);
    const summary = `Payer la facture ${f.id} de ${f.fournisseur} (${f.montant.toFixed(2)} CHF)`;
    if (dryRun) return ok({ summary, amountCHF: f.montant });
    appendCsv(join(dir, "ordres.csv"), { date: today(), facture: f.id, fournisseur: f.fournisseur, montant: f.montant.toFixed(2), iban: f.iban });
    return ok({ ordre: f.id, montant: f.montant });
  }),
);

await serve(s);

function invoices() {
  const ordered = new Set(csv("ordres.csv").map((o) => o.facture));
  return csv("factures.csv").map((f) => ({
    id: f.id ?? "",
    fournisseur: f.fournisseur ?? "",
    objet: f.objet ?? "",
    montant: amount(f.montant),
    echeance: f.echeance ?? "",
    iban: f.iban ?? "",
    statut: f.statut === "payee" || ordered.has(f.id ?? "") ? "payee" : "a-payer",
  }));
}

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
