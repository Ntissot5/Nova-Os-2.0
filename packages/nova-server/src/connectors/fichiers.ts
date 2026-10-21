#!/usr/bin/env node
// Connecteur Fichiers : les documents de l'entreprise, dans data/files/.
// Une suppression déplace le fichier dans data/.corbeille/ (rien n'est vraiment effacé, D-014).

import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { z } from "zod";
import { RIGHT, SENSITIVE, dataDir, guard, inside, norm, ok, serve, server } from "./kit.js";

const root = dataDir("files");
const TEXT = new Set([".md", ".txt", ".csv", ".json", ".ics", ".eml", ".html", ".xml"]);
const s = server("fichiers");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith(".")) return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const info = (p: string) => {
  const st = statSync(p);
  return { path: relative(root, p), size: st.size, modified: st.mtime.toISOString() };
};

s.registerTool(
  "fichiers_chercher",
  {
    title: "Chercher des fichiers",
    description: "Cherche des fichiers de l'entreprise par nom et par contenu (documents texte). Renvoie au plus `limit` fichiers, avec un extrait.",
    inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() },
    annotations: { readOnlyHint: true },
    _meta: { [RIGHT]: "read" },
  },
  guard(({ query, limit = 10 }) => {
    const q = norm(query);
    const hits = [];
    for (const p of walk(root)) {
      const byName = norm(relative(root, p)).includes(q);
      let excerpt: string | undefined;
      if (TEXT.has(extname(p).toLowerCase()) && statSync(p).size < 2_000_000) {
        const text = readFileSync(p, "utf8");
        const i = norm(text).indexOf(q);
        if (i >= 0) excerpt = text.slice(Math.max(0, i - 80), i + 160).replace(/\s+/g, " ").trim();
      }
      if (byName || excerpt) hits.push({ ...info(p), excerpt });
      if (hits.length >= limit) break;
    }
    return ok(hits);
  }),
);

s.registerTool(
  "fichiers_lister",
  {
    title: "Lister un dossier",
    description: "Liste le contenu d'un dossier de l'entreprise (racine si `dossier` est vide).",
    inputSchema: { dossier: z.string().optional() },
    annotations: { readOnlyHint: true },
    _meta: { [RIGHT]: "read" },
  },
  guard(({ dossier = "." }) => {
    const dir = inside(root, dossier);
    return ok(
      readdirSync(dir, { withFileTypes: true })
        .filter((e) => !e.name.startsWith("."))
        .map((e) => ({ name: e.name, dossier: e.isDirectory(), ...(e.isDirectory() ? {} : info(join(dir, e.name))) })),
    );
  }),
);

s.registerTool(
  "fichiers_lire",
  {
    title: "Lire un fichier",
    description: "Lit un document texte de l'entreprise (au plus 200 000 caractères).",
    inputSchema: { path: z.string() },
    annotations: { readOnlyHint: true },
    _meta: { [RIGHT]: "read" },
  },
  guard(({ path }) => {
    const p = inside(root, path);
    if (!TEXT.has(extname(p).toLowerCase())) throw new Error(`Type de fichier non lisible comme texte : ${path}`);
    return ok({ path, content: readFileSync(p, "utf8").slice(0, 200_000) });
  }),
);

s.registerTool(
  "fichiers_ecrire",
  {
    title: "Écrire un fichier",
    description: "Crée ou remplace un document texte. L'ancienne version, s'il y en a une, va dans la corbeille.",
    inputSchema: { path: z.string(), content: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false },
    _meta: { [RIGHT]: "write" },
  },
  guard(({ path, content }) => {
    const p = inside(root, path);
    if (existsSync(p)) toTrash(p);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
    return ok(info(p));
  }),
);

s.registerTool(
  "fichiers_supprimer",
  {
    title: "Supprimer un fichier",
    description: "Met un fichier à la corbeille (récupérable 30 jours).",
    inputSchema: { path: z.string(), dryRun: z.boolean().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true },
    _meta: { [RIGHT]: "delete", [SENSITIVE]: true },
  },
  guard(({ path, dryRun }) => {
    const p = inside(root, path);
    if (!existsSync(p)) throw new Error(`Fichier introuvable : ${path}`);
    if (dryRun) return ok({ summary: `Mettre « ${path} » à la corbeille` });
    return ok({ corbeille: relative(dataDir("."), toTrash(p)) });
  }),
);

function toTrash(p: string) {
  let dest = join(dataDir(".corbeille"), new Date().toISOString().slice(0, 10), relative(root, p));
  if (existsSync(dest)) dest = `${dest}.${Date.now()}`;
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(p, dest);
  return dest;
}

await serve(s);
