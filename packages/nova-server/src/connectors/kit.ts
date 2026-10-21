// Boîte à outils commune aux connecteurs MCP de Nova.
// Un connecteur = un serveur MCP (stdio) qui expose une source de l'entreprise en outils.
//
// Conventions lues par nova-gateway, dans le `_meta` de chaque outil :
//   nova/right     droit nécessaire dans company.nix (« read », « draft », « send », « payment »…)
//   nova/sensitive l'outil agit sur le monde (envoi, paiement, suppression) : soumis à l'autonomie.
// Un outil sensible accepte `dryRun: true` et renvoie alors un aperçu sans rien faire :
//   { summary, amountCHF?, recipients?, unknownRecipient? }

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const RIGHT = "nova/right";
export const SENSITIVE = "nova/sensitive";

export interface Preview {
  summary: string;
  amountCHF?: number;
  recipients?: number;
  unknownRecipient?: boolean;
}

export function server(name: string) {
  return new McpServer({ name: `nova-${name}`, version: "0.1.0" });
}

export async function serve(s: McpServer) {
  await s.connect(new StdioServerTransport());
}

/** Résultat d'outil : du JSON lisible par le modèle, et la même donnée structurée pour le gateway. */
export function ok(data: unknown): CallToolResult {
  const structured = (Array.isArray(data) ? { items: data } : data) as Record<string, unknown>;
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: structured };
}

export function fail(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Exécute un outil et transforme toute exception en erreur lisible plutôt qu'en plantage. */
export function guard<A>(fn: (args: A) => Promise<CallToolResult> | CallToolResult) {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  };
}

export function dataDir(sub: string) {
  const root = process.env.NOVA_DATA;
  if (!root) throw new Error("Variable NOVA_DATA manquante.");
  const dir = resolve(root, sub);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Résout un chemin donné par un agent en refusant tout ce qui sort du dossier racine. */
export function inside(root: string, path: string) {
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) throw new Error(`Chemin refusé : ${path}`);
  return target;
}

// ---------- CSV (RFC 4180, séparateur « ; » ou « , » détecté sur l'en-tête) ----------

export type Row = Record<string, string>;

export function parseCsv(text: string): Row[] {
  const lines = splitRecords(text.replace(/^﻿/, ""));
  const header = lines.shift();
  if (!header) return [];
  return lines
    .filter((cells) => cells.some((c) => c !== ""))
    .map((cells) => Object.fromEntries(header.map((h, i) => [h.trim(), (cells[i] ?? "").trim()])));
}

function splitRecords(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += c;
  }
  if (cell !== "" || row.length) row.push(cell), rows.push(row);
  return rows;
}

export function readCsv(path: string): Row[] {
  return existsSync(path) ? parseCsv(readFileSync(path, "utf8")) : [];
}

export function appendCsv(path: string, row: Row) {
  const exists = existsSync(path);
  const header = exists ? (readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "") : "";
  const delim = !exists || header.includes(";") ? ";" : ",";
  const cols = exists ? header.split(delim).map((h) => h.trim()) : Object.keys(row);
  const esc = (v: string) => (v.includes(delim) || /["\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const line = cols.map((c) => esc(row[c] ?? "")).join(delim) + "\n";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, (exists ? "" : cols.join(delim) + "\n") + line, { flag: "a" });
}

/** Montants suisses : « 1’240.50 », « 1'240,50 », « 1240.5 » → 1240.5 */
export function amount(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s.replace(/[’'\s]/g, "").replace(/CHF/i, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
