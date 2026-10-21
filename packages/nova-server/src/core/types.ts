// Modèle de données partagé entre nova-daemon et nova-home (importé tel quel par l'interface).

export type Autonomy = "je-valide-tout" | "je-valide-l-important" | "autonome";

/** Ce que company.nix déclare, tel que généré par Nix (`nova.*` → JSON). */
export interface CompanyConfig {
  version: string;
  company: { name: string; address: "tu" | "vous" };
  brand: { accent: string };
  people: Record<string, { name: string; role: "dirigeant" | "employe" }>;
  apps: string[];
  agents: Record<string, AgentConfig>;
  limits: { paymentApprovalAboveCHF: number; undoDelaySeconds: number };
  /** Départements (D-029). Vide : tout le monde voit tout, comme avant. */
  departements?: Record<string, DepartementConfig>;
}

export interface DepartementConfig {
  name: string;
  couleur: string;
  membres: string[];
  agents: string[];
}

/** Un département tel que le voit la personne connectée. */
export interface DepartementVue {
  id: string;
  name: string;
  couleur: string;
  membres: { id: string; name: string }[];
  agents: string[];
  /** La personne en fait partie (sinon : elle le voit parce qu'elle dirige). */
  mien: boolean;
}

/** Un dossier envoyé d'un département à un autre (« Envoyer à… »). */
export interface Relais {
  id: string;
  de: string; // département d'origine, ou « direction »
  par: string; // personne
  vers: string; // département destinataire
  titre: string;
  message: string;
  tache?: { id: string; titre: string; resume?: string };
  cree: string;
  traite?: { par: string; le: string };
}

export interface AgentConfig {
  name: string;
  description: string;
  autonomy: Autonomy;
  connectors: Record<string, string[]>;
  skills?: string[]; // ex. « gerance/relances » : verticals/gerance/skills/relances.md
}

/** Un appel d'outil sur le bus MCP. */
export interface ToolCall {
  tool: string; // ex. "mail_envoyer"
  args: Record<string, unknown>;
}

/** Une action qu'un agent veut faire sur le monde, via un ou plusieurs appels d'outils. */
export interface Action {
  tool: string; // outil principal, ex. "mail_envoyer", "compta_payer"
  calls?: ToolCall[]; // appels réellement exécutés quand l'action part
  summary: string; // phrase humaine : « Envoyer 3 relances de loyer »
  sensitive: boolean; // envoi, paiement, suppression
  amountCHF?: number;
  recipients?: number;
  unknownRecipient?: boolean;
  toujoursValider?: string; // connecteur ajouté dont les actions sont toujours validées par un humain
  why: Why;
}

export interface Why {
  rule: string; // règle suivie, en phrase
  ruleRef?: string; // ex. "regles.md#relances"
  sources: string[]; // informations utilisées
}

export type Decision =
  | { kind: "immediat" }
  | { kind: "differe"; seconds: number }
  | { kind: "validation"; reason: string };

export interface Step {
  at: string; // ISO
  text: string;
  app?: string; // app utilisée pendant l'étape (s'allume dans le dock)
}

export interface Doc {
  title: string;
  body: string;
}

export type TaskStatus = "en-cours" | "en-attente" | "differe" | "terminee" | "annulee" | "refusee" | "arretee" | "echec";

export interface Task {
  id: string;
  agentId: string;
  title: string;
  status: TaskStatus;
  startedAt: string;
  endedAt?: string;
  steps: Step[];
  doc?: Doc;
  action?: Action;
  decision?: Decision;
  executeAt?: string; // pour une action différée : heure d'envoi (annulable avant)
  outcome?: string; // phrase finale : « Message envoyé au concierge »
  minutesSaved: number;
}

export interface AgentState extends AgentConfig {
  id: string;
  status: "travaille" | "disponible" | "pause";
  appsInUse: string[];
  pending: number;
  streak: number; // validations d'affilée sans correction
  suggestion?: string; // proposition d'augmenter l'autonomie
}

export interface Approval {
  id: string; // = id de la tâche
  agentId: string;
  summary: string;
  detail?: string;
  createdAt: string;
}

export interface State {
  company: CompanyConfig["company"];
  me: string; // prénom de la personne connectée au poste
  demo: boolean;
  now: string;
  agents: AgentState[];
  approvals: Approval[];
  tasks: Task[]; // récentes, plus récentes d'abord
  gains: { minutesThisWeek: number; tasksThisWeek: number };
  /** Les départements visibles par la personne connectée, et les relais qui la concernent. */
  departements?: DepartementVue[];
  relais?: Relais[];
  /** Tous les départements, noms et couleurs seulement : à qui on peut envoyer un dossier. */
  annuaire?: { id: string; name: string; couleur: string }[];
}

/** Une question en langage naturel posée depuis la barre du haut ou Nova Home. */
export interface AskEvent {
  type: "etape" | "reponse" | "erreur";
  text: string;
  app?: string; // source consultée pendant l'étape
  sources?: string[];
  ms?: number;
}
