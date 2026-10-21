// Les connecteurs ajoutés par le dirigeant : n'importe quel service qui expose un serveur MCP distant.
// La liste vit dans data/connecteurs/ajoutes.json (elle voyage avec l'export) ; les jetons vivent à part,
// dans le dossier des secrets du Hub, et ne sont jamais exportés ni renvoyés à l'interface.
// Un connecteur local (programme lancé sur le Hub) ne s'ajoute pas d'ici : il se déclare dans company.nix.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { CompanyConfig } from "../core/types.js";
import { type Bus, CONNECTORS, type Distant, Forbidden } from "./bus.js";

export interface Ajoute {
  id: string;
  nom: string;
  url: string;
  /** Agents qui peuvent s'en servir. Les personnes peuvent toujours l'interroger en lecture (Demander). */
  agents: string[];
  /** lecture : seulement les outils déclarés en lecture seule ; actions : tous, sensibles compris. */
  acces: "lecture" | "actions";
  /** Par défaut, chaque action attend un humain, quel que soit le niveau d'autonomie de l'agent. */
  toujoursValider: boolean;
  ajouteLe: string;
  ajoutePar: string;
  avecJeton: boolean;
}

export interface Etat extends Ajoute {
  etat: "branche" | "erreur";
  erreur?: string;
  outils: { nom: string; titre: string; lecture: boolean }[];
}

export class Connecteurs {
  private etats = new Map<string, Etat>();
  /** Droits d'origine des agents (company.nix), avant ceux donnés par les connecteurs ajoutés. */
  private base: Record<string, Record<string, string[]>>;

  constructor(
    private bus: Bus,
    private cfg: CompanyConfig,
    private data: string,
    private secrets: string,
  ) {
    this.base = Object.fromEntries(Object.entries(cfg.agents).map(([id, a]) => [id, { ...a.connectors }]));
  }

  /** Au démarrage : rebranche chaque connecteur ajouté. Un service injoignable n'empêche pas Nova de démarrer. */
  async start() {
    await Promise.all(this.lire().map((a) => this.brancher(a)));
    this.droits();
  }

  liste(): Etat[] {
    return this.lire().map((a) => this.etats.get(a.id) ?? { ...a, etat: "erreur", erreur: "Pas encore branché.", outils: [] });
  }

  async ajouter(input: { nom?: unknown; url?: unknown; jeton?: unknown; agents?: unknown; acces?: unknown; toujoursValider?: unknown }, who: string): Promise<Etat> {
    const nom = typeof input.nom === "string" ? input.nom.trim().slice(0, 60) : "";
    if (!nom) throw new Invalide("Donne un nom au connecteur.");
    const url = adresse(input.url);
    const agents = Array.isArray(input.agents) ? input.agents.filter((a): a is string => typeof a === "string" && a in this.cfg.agents) : [];
    const acces = input.acces === "actions" ? "actions" : "lecture";
    const jeton = typeof input.jeton === "string" && input.jeton.trim() ? input.jeton.trim() : undefined;
    const liste = this.lire();
    const id = identifiant(nom, [...CONNECTORS, ...liste.map((a) => a.id)]);
    const a: Ajoute = { id, nom, url, agents, acces, toujoursValider: input.toujoursValider !== false, ajouteLe: new Date().toISOString(), ajoutePar: who, avecJeton: Boolean(jeton) };

    // On essaie d'abord : un connecteur qui ne répond pas n'est pas enregistré.
    if (jeton) this.ecrireJeton(id, jeton);
    const etat = await this.brancher(a);
    if (etat.etat === "erreur") {
      this.effacerJeton(id);
      this.etats.delete(id);
      throw new Invalide(`Nova n'arrive pas à se connecter à ${nom} : ${etat.erreur}`);
    }
    this.ecrire([...liste, a]);
    this.droits();
    return etat;
  }

  /** Modifier qui peut s'en servir et comment ; un nouveau jeton (après un import, par exemple) le remplace. */
  async regler(id: string, input: { agents?: unknown; acces?: unknown; toujoursValider?: unknown; jeton?: unknown }) {
    const liste = this.lire();
    const a = liste.find((x) => x.id === id);
    if (!a) throw new Inconnu("Connecteur inconnu.");
    if (Array.isArray(input.agents)) a.agents = input.agents.filter((x): x is string => typeof x === "string" && x in this.cfg.agents);
    if (input.acces === "lecture" || input.acces === "actions") a.acces = input.acces;
    if (typeof input.toujoursValider === "boolean") a.toujoursValider = input.toujoursValider;
    if (typeof input.jeton === "string" && input.jeton.trim()) {
      this.ecrireJeton(id, input.jeton.trim());
      a.avecJeton = true;
    }
    this.ecrire(liste);
    // Le réglage de validation est porté par chaque outil : on rebranche pour l'appliquer.
    await this.bus.removeRemote(id);
    await this.brancher(a);
    this.droits();
    return this.etats.get(id);
  }

  async retirer(id: string) {
    const liste = this.lire();
    if (!liste.some((a) => a.id === id)) throw new Inconnu("Connecteur inconnu.");
    await this.bus.removeRemote(id);
    this.etats.delete(id);
    this.effacerJeton(id);
    this.ecrire(liste.filter((a) => a.id !== id));
    this.droits();
  }

  private async brancher(a: Ajoute): Promise<Etat> {
    const d: Distant = { id: a.id, nom: a.nom, url: a.url, jeton: this.lireJeton(a.id), toujoursValider: a.toujoursValider };
    let etat: Etat;
    try {
      const outils = await this.bus.addRemote(d);
      etat = { ...a, etat: "branche", outils: outils.map((t) => ({ nom: t.externe!.outil, titre: t.title, lecture: t.right === "read" })) };
    } catch (e) {
      etat = { ...a, etat: "erreur", erreur: message(e), outils: [] };
    }
    this.etats.set(a.id, etat);
    return etat;
  }

  /** Les droits des agents = company.nix + ce que le dirigeant a donné ici. Le moteur lit cfg à chaque appel. */
  private droits() {
    for (const [id, agent] of Object.entries(this.cfg.agents)) {
      const r: Record<string, string[]> = { ...this.base[id] };
      for (const a of this.lire()) if (a.agents.includes(id)) r[a.id] = a.acces === "actions" ? ["read", "write"] : ["read"];
      agent.connectors = r;
    }
  }

  private fichier() {
    return join(this.data, "connecteurs", "ajoutes.json");
  }

  private lire(): Ajoute[] {
    return existsSync(this.fichier()) ? (JSON.parse(readFileSync(this.fichier(), "utf8")) as Ajoute[]) : [];
  }

  private ecrire(liste: Ajoute[]) {
    mkdirSync(join(this.data, "connecteurs"), { recursive: true });
    writeFileSync(this.fichier(), JSON.stringify(liste, null, 2) + "\n");
  }

  private jeton(id: string) {
    return join(this.secrets, "connecteurs", `${id}.jeton`);
  }

  private lireJeton(id: string) {
    return existsSync(this.jeton(id)) ? readFileSync(this.jeton(id), "utf8").trim() : undefined;
  }

  private ecrireJeton(id: string, jeton: string) {
    mkdirSync(join(this.secrets, "connecteurs"), { recursive: true, mode: 0o700 });
    writeFileSync(this.jeton(id), jeton, { mode: 0o600 });
  }

  private effacerJeton(id: string) {
    rmSync(this.jeton(id), { force: true });
  }
}

export class Invalide extends Error {}
export class Inconnu extends Error {}

/** Une adresse de serveur MCP : https, ou http uniquement sur la machine elle-même (développement et tests). */
export function adresse(raw: unknown): string {
  let u: URL;
  try {
    u = new URL(String(raw ?? "").trim());
  } catch {
    throw new Invalide("L'adresse du serveur MCP n'est pas valide. Elle commence par https://");
  }
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) throw new Invalide("L'adresse doit commencer par https:// : un jeton ne circule jamais en clair.");
  if (u.username || u.password) throw new Invalide("Pas d'identifiant dans l'adresse : mets le jeton dans le champ prévu.");
  return u.toString();
}

/** Un identifiant court et stable, tiré du nom : « Microsoft 365 » → « microsoft-365 ». */
export function identifiant(nom: string, pris: readonly string[]): string {
  const base =
    nom
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "connecteur";
  let id = base;
  for (let i = 2; pris.includes(id); i++) id = `${base}-${i}`;
  return id;
}

function message(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: unknown })?.code;
  if (code === 401 || code === 403 || e instanceof UnauthorizedError) return "accès refusé, vérifie le jeton.";
  if (/401|403|unauthori[sz]ed|forbidden/i.test(m)) return "accès refusé, vérifie le jeton.";
  if (/ENOTFOUND|EAI_AGAIN/.test(m)) return "adresse introuvable.";
  if (/ECONNREFUSED|fetch failed|ETIMEDOUT/.test(m)) return "le service ne répond pas.";
  if (e instanceof Forbidden) return m;
  return m.length > 200 ? `${m.slice(0, 200)}…` : m;
}
