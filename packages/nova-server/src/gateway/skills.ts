// Les skills métier : des fichiers Markdown (verticals/<métier>/skills/<nom>.md) avec un court en-tête.
//   declencheur : « mail » (chaque nouveau mail reçu) ou « quotidien HH:MM »
//   modele      : modèle qui travaille ; tri : modèle qui trie avant (facultatif, D-017)
//   minutes     : temps humain estimé pour une action de ce type (mesure des heures gagnées)

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Skill {
  id: string; // « gerance/relances »
  body: string;
  trigger: { kind: "mail" } | { kind: "quotidien"; at: string } | { kind: "manuel" };
  model: string;
  triModel?: string;
  minutes: number;
}

export function loadSkill(dir: string, id: string): Skill {
  const [vertical, name] = id.split("/");
  const file = join(dir, vertical ?? "", "skills", `${name}.md`);
  if (!vertical || !name || !existsSync(file)) throw new Error(`Skill introuvable : ${id} (${file})`);
  return parseSkill(id, readFileSync(file, "utf8"));
}

/** Un skill depuis son texte (en-tête puis consignes en Markdown). */
export function parseSkill(id: string, text: string): Skill {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const head = Object.fromEntries((m?.[1] ?? "").split("\n").map((l) => l.split(/:\s*/, 2).map((x) => x.trim()) as [string, string]));
  const decl = head.declencheur ?? "manuel";
  const daily = decl.match(/^quotidien\s+(\d{2}:\d{2})$/);
  return {
    id,
    body: (m?.[2] ?? text).trim(),
    trigger: decl === "mail" ? { kind: "mail" } : daily ? { kind: "quotidien", at: daily[1]! } : { kind: "manuel" },
    model: head.modele ?? "claude-sonnet-5-5",
    triModel: head.tri,
    minutes: Number(head.minutes ?? 10),
  };
}
