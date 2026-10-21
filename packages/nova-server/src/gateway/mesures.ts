// Ce que la Phase 2 doit prouver chez le pilote (ROADMAP) :
//   - les heures administratives par semaine, avant et après Nova (relevé hebdomadaire de 2 minutes) ;
//   - le coût de l'IA, par agent et par poste, lu dans le journal.
// Tout reste en formats ouverts dans data/ : mesures/releves.csv et journal/*.jsonl.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { appendCsv, readCsv } from "../connectors/kit.js";

/** Coût du mois en cours, à partir du journal (D-016 : visible par le dirigeant, pas affiché aux employés). */
export function costs(journalDir: string, now: Date) {
  const month = now.toISOString().slice(0, 7);
  const file = join(journalDir, `${month}.jsonl`);
  const parAgent: Record<string, number> = {};
  const parPersonne: Record<string, number> = {};
  let total = 0;
  let appels = 0;
  if (existsSync(file))
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line) continue;
      let e: { qui?: string; coutUSD?: number };
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof e.coutUSD !== "number" || !e.qui) continue;
      total += e.coutUSD;
      appels++;
      const [kind, id] = e.qui.split(":");
      const bucket = kind === "agent" ? parAgent : parPersonne;
      bucket[id ?? e.qui] = (bucket[id ?? e.qui] ?? 0) + e.coutUSD;
    }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    mois: month,
    totalUSD: round(total),
    appels,
    parAgent: Object.fromEntries(Object.entries(parAgent).map(([k, v]) => [k, round(v)])),
    questionsParPersonne: Object.fromEntries(Object.entries(parPersonne).map(([k, v]) => [k, round(v)])),
  };
}

export interface Releve {
  semaine: string; // « 2026-W43 »
  heures: number; // heures passées par l'équipe sur l'administratif
  saisiPar: string;
  date: string;
}

export function readReleves(data: string): Releve[] {
  return readCsv(join(data, "mesures", "releves.csv")).map((r) => ({
    semaine: r.semaine ?? "",
    heures: Number(r.heures ?? 0),
    saisiPar: r.saisiPar ?? "",
    date: r.date ?? "",
  }));
}

export function saveReleve(data: string, body: unknown, who: string) {
  const b = body as { semaine?: unknown; heures?: unknown };
  if (typeof b?.semaine !== "string" || !/^\d{4}-W\d{2}$/.test(b.semaine)) throw new Error("Semaine invalide (format 2026-W43).");
  const heures = Number(b.heures);
  if (!Number.isFinite(heures) || heures < 0 || heures > 400) throw new Error("Nombre d'heures invalide.");
  if (readReleves(data).some((r) => r.semaine === b.semaine)) throw new Error("Cette semaine est déjà relevée.");
  appendCsv(join(data, "mesures", "releves.csv"), { semaine: b.semaine, heures: String(heures), saisiPar: who, date: new Date().toISOString().slice(0, 10) });
  return { ok: true };
}

/** Semaine ISO (lundi) d'une date : « 2026-W43 ». */
export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export const journalMonths = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort() : []);
