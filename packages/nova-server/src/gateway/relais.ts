// Relais entre départements : « Envoyer à… ». Un dossier part d'un département vers un autre, avec son
// contexte (la tâche d'agent dont il vient). Il arrive dans la boîte « Reçu » du destinataire.
// Gardés dans data/relais/relais.json : ils voyagent avec l'export, lisibles sans Nova.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Relais, Task } from "../core/types.js";
import { Forbidden } from "./bus.js";
import type { Departements } from "./departements.js";

export class Invalide extends Error {}
export class Introuvable extends Error {}

const GARDER = 500;

export class RelaisStore {
  constructor(
    private data: string,
    private deps: Departements,
    private tache: (id: string) => Task | undefined,
    private now = () => new Date(),
  ) {}

  private fichier() {
    return join(this.data, "relais", "relais.json");
  }

  private tous(): Relais[] {
    return existsSync(this.fichier()) ? (JSON.parse(readFileSync(this.fichier(), "utf8")) as Relais[]) : [];
  }

  private ecrire(liste: Relais[]) {
    mkdirSync(join(this.data, "relais"), { recursive: true });
    writeFileSync(`${this.fichier()}.tmp`, JSON.stringify(liste.slice(0, GARDER), null, 2) + "\n");
    renameSync(`${this.fichier()}.tmp`, this.fichier());
  }

  /** Ce qui concerne la personne : reçu par ses départements ou envoyé par eux. Le dirigeant voit tout. */
  pour(person: string): Relais[] {
    const tous = this.tous();
    if (this.deps.dirige(person)) return tous;
    const miens = new Set(this.deps.de(person));
    return tous.filter((r) => miens.has(r.vers) || miens.has(r.de) || r.par === person);
  }

  envoyer(input: { de?: unknown; vers?: unknown; titre?: unknown; message?: unknown; tache?: unknown }, person: string): Relais {
    const vers = String(input.vers ?? "");
    if (!this.deps.existe(vers)) throw new Invalide("Département destinataire inconnu.");
    const miens = this.deps.de(person);
    const de = typeof input.de === "string" && input.de ? input.de : (miens[0] ?? (this.deps.dirige(person) ? "direction" : ""));
    // Le dirigeant peut envoyer au nom de n'importe quel département ; les autres, au nom des leurs.
    const permis = de === "direction" ? this.deps.dirige(person) : this.deps.existe(de) && this.deps.membreOuDirige(person, de);
    if (!permis) throw new Forbidden("Tu ne peux envoyer qu'au nom de tes départements.");
    if (de === vers) throw new Invalide("Le dossier est déjà dans ce département.");
    const titre = typeof input.titre === "string" ? input.titre.trim().slice(0, 120) : "";
    if (!titre) throw new Invalide("Donne un titre au dossier.");
    const message = typeof input.message === "string" ? input.message.trim().slice(0, 2000) : "";
    let tache: Relais["tache"];
    if (typeof input.tache === "string" && input.tache) {
      const t = this.tache(input.tache);
      if (!t) throw new Introuvable("Tâche inconnue.");
      this.deps.exigerAgent(person, t.agentId);
      tache = { id: t.id, titre: t.title, resume: t.outcome ?? t.action?.summary };
    }
    const r: Relais = { id: randomUUID().slice(0, 8), de, par: person, vers, titre, message, tache, cree: this.now().toISOString() };
    this.ecrire([r, ...this.tous()]);
    return r;
  }

  traiter(id: string, person: string): Relais {
    const tous = this.tous();
    const r = tous.find((x) => x.id === id);
    if (!r) throw new Introuvable("Dossier inconnu.");
    if (!this.deps.membreOuDirige(person, r.vers)) throw new Forbidden("Ce dossier est adressé à un autre département.");
    r.traite = { par: person, le: this.now().toISOString() };
    this.ecrire(tous);
    return r;
  }
}
