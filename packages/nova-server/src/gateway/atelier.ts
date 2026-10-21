// L'Atelier (D-031) : chaque entreprise construit son propre système, sans code et sans installateur.
// Le dirigeant y crée ses départements, ses agents (ce qu'ils font, quand, avec quelles sources) et les
// règles de l'entreprise, en français. Tout vit dans data/atelier/ et data/memory/ : lisible, exporté.
// company.nix reste la base posée à l'installation ; l'Atelier s'ajoute par-dessus, sans la modifier.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Autonomy, CompanyConfig, DepartementConfig } from "../core/types.js";
import { MODELES } from "./modeles.js";
import { parseSkill, type Skill } from "./skills.js";

export interface AgentAtelier {
  id: string;
  name: string;
  description: string;
  departement?: string;
  autonomy: Autonomy;
  sources: Record<string, string[]>;
  declencheur: "mail" | "manuel" | `quotidien ${string}`;
  consignes: string;
  minutes: number;
  creeLe: string;
  creePar: string;
}

export interface DepartementAtelier extends DepartementConfig {
  id: string;
}

interface Fichier {
  agents: AgentAtelier[];
  departements: DepartementAtelier[];
}

export class Invalide extends Error {}
export class Introuvable extends Error {}

const AUTONOMIES: Autonomy[] = ["je-valide-tout", "je-valide-l-important", "autonome"];

/** Ce que l'Atelier doit tenir à jour quand il change quelque chose. */
export interface Branchements {
  ajouterAgent(id: string, a: CompanyConfig["agents"][string]): void;
  retirerAgent(id: string): void;
  skills: Map<string, Skill>;
  droits(): void;
}

export class Atelier {
  private baseAgents: CompanyConfig["agents"];
  private baseDeps: Record<string, DepartementConfig>;
  private b?: Branchements;

  constructor(
    private cfg: CompanyConfig,
    private data: string,
    private sources: () => { id: string; droits: string[] }[],
    private now = () => new Date(),
  ) {
    this.baseAgents = structuredClone(cfg.agents);
    this.baseDeps = structuredClone(cfg.departements ?? {});
    this.fusionner();
  }

  /** Après le démarrage du moteur : l'Atelier tient désormais à jour agents, skills et droits. */
  brancher(b: Branchements) {
    this.b = b;
  }

  // ---------- lecture ----------

  agents() {
    return this.lire().agents;
  }

  departements() {
    return this.lire().departements;
  }

  /** Les droits déclarés de chaque agent, avant ceux des connecteurs ajoutés (connecteurs.ts). */
  declares(): Record<string, Record<string, string[]>> {
    const r = Object.fromEntries(Object.entries(this.baseAgents).map(([id, a]) => [id, { ...a.connectors }]));
    for (const a of this.agents()) r[a.id] = structuredClone(a.sources);
    return r;
  }

  skill(id: string): Skill | undefined {
    const a = this.agents().find((x) => x.id === id);
    return a && parseSkill(`atelier/${a.id}`, texteSkill(a));
  }

  /** De quoi construire l'écran Atelier. */
  vue() {
    const atelier = new Set(this.agents().map((a) => a.id));
    const depsAtelier = new Set(this.departements().map((d) => d.id));
    return {
      agents: this.agents(),
      // Les agents posés à l'installation : visibles, mais modifiés dans company.nix.
      agentsBase: Object.entries(this.baseAgents)
        .filter(([id]) => !atelier.has(id))
        .map(([id, a]) => ({ id, name: a.name, description: a.description, departement: this.departementDe(id) })),
      departements: Object.entries(this.cfg.departements ?? {}).map(([id, d]) => ({ id, ...d, atelier: depsAtelier.has(id) })),
      personnes: Object.entries(this.cfg.people).map(([id, p]) => ({ id, name: p.name })),
      regles: this.regles(),
      modeles: MODELES,
      sources: this.sources(),
    };
  }

  regles() {
    const f = join(this.data, "memory", "regles.md");
    return existsSync(f) ? readFileSync(f, "utf8") : "";
  }

  // ---------- écriture ----------

  enregistrerAgent(input: Record<string, unknown>, who: string): AgentAtelier {
    const f = this.lire();
    const name = texte(input.name, 40);
    if (!name) throw new Invalide("Donne un nom à l'agent.");
    const existant = typeof input.id === "string" ? f.agents.find((a) => a.id === input.id) : undefined;
    if (typeof input.id === "string" && input.id && !existant) {
      if (this.baseAgents[input.id]) throw new Invalide("Cet agent est défini à l'installation (company.nix) : il ne se modifie pas ici.");
      throw new Introuvable("Agent inconnu.");
    }
    const id = existant?.id ?? identifiant(name, [...Object.keys(this.baseAgents), ...f.agents.map((a) => a.id)]);
    const consignes = texte(input.consignes, 8000, true);
    if (consignes.length < 20) throw new Invalide("Écris ce que l'agent doit faire, en quelques phrases.");
    const departement = typeof input.departement === "string" && input.departement ? input.departement : undefined;
    if (departement && !this.cfg.departements?.[departement]) throw new Invalide("Département inconnu.");
    const a: AgentAtelier = {
      id,
      name,
      description: texte(input.description, 160) || premiereLigne(consignes),
      departement,
      autonomy: AUTONOMIES.includes(input.autonomy as Autonomy) ? (input.autonomy as Autonomy) : (existant?.autonomy ?? "je-valide-tout"),
      sources: this.sourcesValides(input.sources),
      declencheur: declencheur(input.declencheur),
      consignes,
      minutes: Math.min(240, Math.max(1, Math.round(Number(input.minutes) || existant?.minutes || 10))),
      creeLe: existant?.creeLe ?? this.now().toISOString(),
      creePar: existant?.creePar ?? who,
    };
    f.agents = existant ? f.agents.map((x) => (x.id === id ? a : x)) : [...f.agents, a];
    this.ecrire(f);
    this.appliquer();
    return a;
  }

  supprimerAgent(id: string) {
    const f = this.lire();
    if (!f.agents.some((a) => a.id === id)) throw new Introuvable(this.baseAgents[id] ? "Cet agent est défini à l'installation (company.nix)." : "Agent inconnu.");
    this.b?.retirerAgent(id); // refuse s'il a du travail en cours
    f.agents = f.agents.filter((a) => a.id !== id);
    this.ecrire(f);
    this.appliquer();
  }

  enregistrerDepartement(input: Record<string, unknown>): DepartementAtelier {
    const f = this.lire();
    const name = texte(input.name, 40);
    if (!name) throw new Invalide("Donne un nom au département.");
    const couleur = String(input.couleur ?? "");
    if (!/^#[0-9A-Fa-f]{6}$/.test(couleur) || contrasteBlanc(couleur) < 4.5) throw new Invalide("Choisis une couleur assez foncée pour du texte blanc (contraste AA).");
    const membres = Array.isArray(input.membres) ? [...new Set(input.membres.filter((m): m is string => typeof m === "string" && m in this.cfg.people))] : [];
    const existant = typeof input.id === "string" ? f.departements.find((d) => d.id === input.id) : undefined;
    if (typeof input.id === "string" && input.id && !existant) throw new Invalide(this.baseDeps[input.id] ? "Ce département est défini à l'installation (company.nix)." : "Département inconnu.");
    const id = existant?.id ?? identifiant(name, [...Object.keys(this.baseDeps), ...f.departements.map((d) => d.id)]);
    const d: DepartementAtelier = { id, name, couleur, membres, agents: [] };
    f.departements = existant ? f.departements.map((x) => (x.id === id ? d : x)) : [...f.departements, d];
    this.ecrire(f);
    this.appliquer();
    return d;
  }

  supprimerDepartement(id: string) {
    const f = this.lire();
    if (!f.departements.some((d) => d.id === id)) throw new Introuvable(this.baseDeps[id] ? "Ce département est défini à l'installation (company.nix)." : "Département inconnu.");
    if (f.agents.some((a) => a.departement === id)) throw new Invalide("Ce département a encore des agents : déplace-les ou supprime-les d'abord.");
    f.departements = f.departements.filter((d) => d.id !== id);
    this.ecrire(f);
    this.appliquer();
  }

  enregistrerRegles(texteRegles: unknown) {
    const t = texte(texteRegles, 20000, true);
    mkdirSync(join(this.data, "memory"), { recursive: true });
    writeFileSync(join(this.data, "memory", "regles.md"), t.endsWith("\n") ? t : `${t}\n`);
  }

  // ---------- interne ----------

  /** company.nix + Atelier → la configuration vivante (cfg), lue par le moteur, les droits et les départements. */
  private fusionner() {
    const f = this.lire();
    const agents: CompanyConfig["agents"] = structuredClone(this.baseAgents);
    for (const a of f.agents) agents[a.id] = { name: a.name, description: a.description, autonomy: a.autonomy, connectors: structuredClone(a.sources), skills: [`atelier/${a.id}`] };
    const deps: Record<string, DepartementConfig> = structuredClone(this.baseDeps);
    for (const d of f.departements) deps[d.id] = { name: d.name, couleur: d.couleur, membres: d.membres, agents: [] };
    for (const a of f.agents) if (a.departement && deps[a.departement]) deps[a.departement]!.agents.push(a.id);
    this.cfg.agents = agents;
    this.cfg.departements = deps;
  }

  private appliquer() {
    const avant = new Set(Object.keys(this.cfg.agents));
    this.fusionner();
    if (!this.b) return;
    for (const id of avant) if (!this.cfg.agents[id]) this.b.skills.delete(id);
    for (const a of this.agents()) {
      this.b.ajouterAgent(a.id, this.cfg.agents[a.id]!);
      this.b.skills.set(a.id, this.skill(a.id)!);
    }
    this.b.droits();
  }

  private sourcesValides(raw: unknown): Record<string, string[]> {
    const dispo = new Map(this.sources().map((s) => [s.id, new Set(s.droits)]));
    const r: Record<string, string[]> = {};
    if (raw && typeof raw === "object")
      for (const [src, droits] of Object.entries(raw as Record<string, unknown>)) {
        const ok = dispo.get(src);
        if (!ok || !Array.isArray(droits)) continue;
        const d = [...new Set(droits.filter((x): x is string => typeof x === "string" && ok.has(x)))];
        if (d.length) r[src] = d;
      }
    return r;
  }

  private fichier() {
    return join(this.data, "atelier", "atelier.json");
  }

  private lire(): Fichier {
    if (!existsSync(this.fichier())) return { agents: [], departements: [] };
    const f = JSON.parse(readFileSync(this.fichier(), "utf8")) as Partial<Fichier>;
    return { agents: f.agents ?? [], departements: f.departements ?? [] };
  }

  private ecrire(f: Fichier) {
    mkdirSync(join(this.data, "atelier"), { recursive: true });
    writeFileSync(`${this.fichier()}.tmp`, JSON.stringify(f, null, 2) + "\n");
    renameSync(`${this.fichier()}.tmp`, this.fichier());
    // Chaque agent a aussi son métier en Markdown, lisible sans Nova (comme verticals/*/skills/*.md).
    const dir = join(this.data, "atelier", "agents");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const a of f.agents) writeFileSync(join(dir, `${a.id}.md`), texteSkill(a));
  }

  private departementDe(agentId: string) {
    return Object.entries(this.cfg.departements ?? {}).find(([, d]) => d.agents.includes(agentId))?.[0];
  }
}

/** L'agent écrit comme un skill : un en-tête, puis ses consignes. Tri par Haiku pour les mails (D-017). */
function texteSkill(a: AgentAtelier) {
  const tri = a.declencheur === "mail" ? "tri: claude-haiku-5-5\n" : "";
  return `---\ndeclencheur: ${a.declencheur}\nmodele: claude-sonnet-5-5\n${tri}minutes: ${a.minutes}\n---\n# ${a.name}\n\n${a.consignes}\n`;
}

function declencheur(raw: unknown): AgentAtelier["declencheur"] {
  if (raw === "mail" || raw === "manuel") return raw;
  const m = typeof raw === "string" ? raw.match(/^quotidien (\d{2}):(\d{2})$/) : null;
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return `quotidien ${m[1]}:${m[2]}`;
  throw new Invalide("Quand l'agent travaille-t-il ? À chaque mail, chaque jour à une heure, ou quand on le lance.");
}

function texte(raw: unknown, max: number, multiligne = false) {
  if (typeof raw !== "string") return "";
  const t = multiligne ? raw.replace(/\r\n/g, "\n").trim() : raw.replace(/\s+/g, " ").trim();
  return t.slice(0, max);
}

function premiereLigne(t: string) {
  const l = t.split("\n").find((x) => x.trim()) ?? "";
  return l.replace(/^\d+\.\s*/, "").slice(0, 160);
}

export function identifiant(nom: string, pris: readonly string[]): string {
  const base =
    nom
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "agent";
  let id = base;
  for (let i = 2; pris.includes(id); i++) id = `${base}-${i}`;
  return id;
}

/** Contraste WCAG d'une couleur avec du texte blanc. */
export function contrasteBlanc(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const l = 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  return 1.05 / (l + 0.05);
}
