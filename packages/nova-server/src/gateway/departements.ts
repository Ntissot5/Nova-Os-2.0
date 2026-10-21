// Départements (D-029) : un espace par département, au sein d'une seule entreprise.
// Chaque département a ses membres et ses agents ; une personne ne voit et ne pilote que les agents
// de ses départements. Le dirigeant voit tout. Le filtrage se fait ici, dans le gardien : l'interface
// ne reçoit jamais ce qu'elle ne doit pas montrer.
// Sans départements déclarés, Nova se comporte comme avant : tout le monde voit tout.

import type { CompanyConfig, DepartementVue, State } from "../core/types.js";
import type { Rights } from "./bus.js";
import { Forbidden } from "./bus.js";

export class Departements {
  constructor(private cfg: CompanyConfig) {}

  private get liste() {
    return Object.entries(this.cfg.departements ?? {});
  }

  actifs() {
    return this.liste.length > 0;
  }

  dirige(person: string) {
    return this.cfg.people[person]?.role === "dirigeant";
  }

  /** Voit-elle toute l'entreprise ? Le dirigeant, ou tout le monde tant qu'il n'y a pas de départements. */
  voitTout(person: string) {
    return this.dirige(person) || !this.actifs();
  }

  /** Les départements dont la personne fait partie. */
  de(person: string): string[] {
    return this.liste.filter(([, d]) => d.membres.includes(person)).map(([id]) => id);
  }

  existe(id: string) {
    return Boolean(this.cfg.departements?.[id]);
  }

  departementDe(agentId: string) {
    return this.liste.find(([, d]) => d.agents.includes(agentId))?.[0];
  }

  voitAgent(person: string, agentId: string) {
    if (this.voitTout(person)) return true;
    const d = this.departementDe(agentId);
    return Boolean(d && this.de(person).includes(d));
  }

  /** Avant toute action sur un agent ou une de ses tâches. */
  exigerAgent(person: string, agentId: string) {
    if (!this.voitAgent(person, agentId)) throw new Forbidden("Cet agent appartient à un autre département.");
  }

  membreOuDirige(person: string, departement: string) {
    return this.dirige(person) || this.de(person).includes(departement);
  }

  vues(person: string): DepartementVue[] {
    const miens = new Set(this.de(person));
    return this.liste
      .filter(([id]) => this.dirige(person) || miens.has(id))
      .map(([id, d]) => ({
        id,
        name: d.name,
        couleur: d.couleur,
        membres: d.membres.map((m) => ({ id: m, name: this.cfg.people[m]?.name ?? m })),
        agents: d.agents,
        mien: miens.has(id),
      }));
  }

  /** L'état de l'entreprise réduit à ce que la personne a le droit de voir. */
  filtrer(state: State, person: string): State {
    const vues = this.vues(person);
    const annuaire = this.liste.map(([id, d]) => ({ id, name: d.name, couleur: d.couleur }));
    if (this.voitTout(person)) return { ...state, departements: vues, annuaire };
    const ok = (agentId: string) => this.voitAgent(person, agentId);
    return {
      ...state,
      agents: state.agents.filter((a) => ok(a.id)),
      approvals: state.approvals.filter((a) => ok(a.agentId)),
      tasks: state.tasks.filter((t) => ok(t.agentId)),
      departements: vues,
      annuaire,
    };
  }

  /**
   * Les sources qu'une personne peut interroger dans Demander : tout pour qui voit tout ; sinon, en lecture,
   * les sources dont se servent les agents de ses départements. La fiduciaire ne lit pas la boîte de la gérance.
   */
  droitsQuestions(person: string, tout: Rights): Rights {
    if (this.voitTout(person)) return tout;
    const sources = new Set<string>();
    for (const id of this.de(person)) for (const a of this.cfg.departements![id]!.agents) for (const c of Object.keys(this.cfg.agents[a]?.connectors ?? {})) sources.add(c);
    return Object.fromEntries([...sources].filter((c) => c in tout).map((c) => [c, ["read"]]));
  }
}
