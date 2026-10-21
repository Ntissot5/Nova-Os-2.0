// Le moteur : fait avancer les tâches des agents, applique les règles d'autonomie,
// journalise chaque étape et publie l'état à l'interface.

import { EventEmitter } from "node:events";
import { decide, suggestion } from "../core/autonomy.js";
import type { Journal } from "../core/journal.js";
import type { Action, AgentState, Approval, Autonomy, CompanyConfig, State, Task, ToolCall, Why } from "../core/types.js";
import type { Bus, Rights } from "./bus.js";

export interface Scenario {
  title: string;
  steps: { text: string; app?: string; ms: number; doc?: string }[];
  docTitle?: string;
  action?: Action;
  /**
   * Prépare l'action sur le bus (brouillons, etc.) et renvoie les appels à exécuter si elle part.
   * Le résumé, le montant et les destinataires viennent alors de l'aperçu des connecteurs.
   */
  prepare?: (call: (tool: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>, task: Task) => Promise<ToolCall[]>;
  /** Phrase finale si l'action est exécutée (ou s'il n'y a pas d'action). */
  outcome: string;
  minutesSaved: number;
}

/** Ce qu'un agent vivant (agent.ts) peut faire pendant qu'il travaille. */
export interface LiveContext {
  step(text: string, app?: string): void;
  title(text: string): void;
  doc(title: string, body: string): void;
  signal: AbortSignal;
}

/** Ce qu'un agent vivant rend : les actions sensibles proposées et l'explication de son travail. */
export interface LiveResult {
  calls: ToolCall[];
  summary?: string;
  outcome: string;
  why: Why;
  minutesSaved: number;
}

const MAX_TASKS = 200;

export class Engine extends EventEmitter {
  private tasks: Task[] = [];
  private agents = new Map<string, AgentState>();
  private running = new Map<string, NodeJS.Timeout>();
  private aborts = new Map<string, AbortController>();
  private seq = 0;

  constructor(
    private cfg: CompanyConfig,
    private journal: Journal,
    private opts: { demo: boolean; speed: number; me: string; now?: () => Date; bus?: Bus } = { demo: false, speed: 1, me: "" },
  ) {
    super();
    for (const [id, a] of Object.entries(cfg.agents)) {
      this.agents.set(id, { ...a, id, status: "disponible", appsInUse: [], pending: 0, streak: 0 });
    }
    setInterval(() => this.flushDeferred(), 1000).unref();
  }

  now() {
    return this.opts.now ? this.opts.now() : new Date();
  }

  state(me = this.opts.me): State {
    const weekAgo = this.now().getTime() - 7 * 24 * 3600 * 1000;
    const week = this.tasks.filter((t) => t.status === "terminee" && Date.parse(t.endedAt ?? t.startedAt) >= weekAgo);
    return {
      company: this.cfg.company,
      me,
      demo: this.opts.demo,
      now: this.now().toISOString(),
      agents: [...this.agents.values()].map((a) => ({ ...a, suggestion: suggestion(a.autonomy, a.streak) })),
      approvals: this.tasks.filter((t) => t.status === "en-attente").map(toApproval),
      tasks: this.tasks.slice(0, MAX_TASKS),
      gains: { minutesThisWeek: week.reduce((s, t) => s + t.minutesSaved, 0), tasksThisWeek: week.length },
    };
  }

  /** Un agent créé ou modifié dans l'Atelier : il apparaît tout de suite, son état et son autonomie sont gardés. */
  ajouterAgent(id: string, a: CompanyConfig["agents"][string]) {
    const actuel = this.agents.get(id);
    this.agents.set(id, actuel ? { ...actuel, ...a, autonomy: actuel.autonomy } : { ...a, id, status: "disponible", appsInUse: [], pending: 0, streak: 0 });
    this.changed();
  }

  /** Retirer un agent : refusé tant qu'il a une tâche en cours, en attente ou sur le point de partir. */
  retirerAgent(id: string) {
    if (this.tasks.some((t) => t.agentId === id && ["en-cours", "en-attente", "differe"].includes(t.status)))
      throw new Conflict("Cet agent a encore une tâche en cours ou en attente : termine-la ou annule-la d'abord.");
    this.agents.delete(id);
    this.changed();
  }

  agent(id: string) {
    const a = this.agents.get(id);
    if (!a) throw new NotFound(`Agent inconnu : ${id}`);
    return a;
  }

  task(id: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) throw new NotFound(`Tâche inconnue : ${id}`);
    return t;
  }

  /** Ajoute une tâche déjà terminée (historique de démonstration). */
  seed(task: Omit<Task, "id">) {
    this.tasks.push({ ...task, id: this.nextId() });
    this.tasks.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    this.recount();
  }

  setStreak(agentId: string, n: number) {
    this.agent(agentId).streak = n;
    this.changed();
  }

  isBusy(agentId: string) {
    return this.tasks.some((t) => t.agentId === agentId && t.status === "en-cours");
  }

  start(agentId: string, sc: Scenario): Task {
    const agent = this.agent(agentId);
    const task: Task = {
      id: this.nextId(),
      agentId,
      title: sc.title,
      status: "en-cours",
      startedAt: this.now().toISOString(),
      steps: [],
      doc: sc.docTitle ? { title: sc.docTitle, body: "" } : undefined,
      minutesSaved: sc.minutesSaved,
    };
    this.tasks.unshift(task);
    agent.status = "travaille";
    this.journal.write({ qui: `agent:${agentId}`, quoi: "tache.debut", pourquoi: sc.title, tache: task.id });
    this.changed();

    let i = 0;
    const next = () => {
      if (task.status !== "en-cours") return;
      const step = sc.steps[i++];
      if (!step) return void this.finishWork(task, sc);
      const t = setTimeout(() => {
        if (task.status !== "en-cours") return;
        task.steps.push({ at: this.now().toISOString(), text: step.text, app: step.app });
        if (step.doc && task.doc) task.doc.body += step.doc;
        agent.appsInUse = step.app ? [step.app] : [];
        this.journal.write({ qui: `agent:${agentId}`, quoi: "etape", pourquoi: step.text, app: step.app, tache: task.id });
        this.changed();
        next();
      }, step.ms / this.opts.speed);
      this.running.set(task.id, t);
    };
    next();
    return task;
  }

  /** Fait travailler un agent vivant : ses étapes s'affichent au fil de l'eau, ses actions passent par l'autonomie. */
  run(agentId: string, title: string, work: (ctx: LiveContext) => Promise<LiveResult>, minutesSaved = 0): Task {
    const agent = this.agent(agentId);
    const task: Task = { id: this.nextId(), agentId, title, status: "en-cours", startedAt: this.now().toISOString(), steps: [], minutesSaved };
    this.tasks.unshift(task);
    agent.status = "travaille";
    const abort = new AbortController();
    this.aborts.set(task.id, abort);
    this.journal.write({ qui: `agent:${agentId}`, quoi: "tache.debut", pourquoi: title, tache: task.id });
    this.changed();

    const ctx: LiveContext = {
      signal: abort.signal,
      step: (text, app) => {
        if (task.status !== "en-cours") return;
        task.steps.push({ at: this.now().toISOString(), text, app });
        agent.appsInUse = app ? [app] : [];
        this.journal.write({ qui: `agent:${agentId}`, quoi: "etape", pourquoi: text, app, tache: task.id });
        this.changed();
      },
      title: (t) => {
        task.title = t;
        this.changed();
      },
      doc: (t, body) => {
        if (task.status !== "en-cours") return;
        task.doc = { title: t, body };
        this.changed();
      },
    };

    void work(ctx).then(
      async (r) => {
        this.aborts.delete(task.id);
        if (task.status !== "en-cours") return; // arrêtée entre-temps
        agent.appsInUse = [];
        if (agent.status === "travaille") agent.status = "disponible";
        task.minutesSaved = r.minutesSaved;
        if (r.calls.length === 0) return this.complete(task, r.outcome);
        try {
          await this.propose(task, { tool: r.calls[0]!.tool, calls: r.calls, summary: r.summary ?? "", sensitive: true, why: r.why }, r.outcome);
        } catch (e) {
          this.fail(task, e);
        }
      },
      (e) => {
        this.aborts.delete(task.id);
        agent.appsInUse = [];
        if (agent.status === "travaille") agent.status = "disponible";
        if (task.status === "en-cours") this.fail(task, e);
      },
    );
    return task;
  }

  /** Une action proposée : aperçu par les connecteurs, puis décision d'autonomie. */
  private async propose(task: Task, base: Action, outcome: string) {
    const bus = this.opts.bus;
    let action = base;
    if (bus && base.calls?.length) {
      const who = `agent:${task.agentId}`;
      const previews = await Promise.all(base.calls.map((c) => bus.preview(who, this.rights(task.agentId), c.tool, c.args)));
      action = {
        ...base,
        summary: base.summary || previews.map((p) => p.summary).join(" ; "),
        sensitive: base.calls.some((c) => bus.info(c.tool).sensitive),
        amountCHF: previews.reduce((s, p) => s + (p.amountCHF ?? 0), 0) || undefined,
        recipients: previews.reduce((s, p) => s + (p.recipients ?? 0), 0) || undefined,
        unknownRecipient: previews.some((p) => p.unknownRecipient),
        toujoursValider: previews.find((p) => p.toujoursValider)?.toujoursValider,
      };
    }
    const agent = this.agent(task.agentId);
    task.action = action;
    task.outcome = outcome;
    const d = decide(action, agent.autonomy, this.cfg.limits);
    task.decision = d;
    this.journal.write({ qui: `agent:${task.agentId}`, quoi: action.tool, pourquoi: action.why.rule, decision: d, tache: task.id });
    if (d.kind === "validation") task.status = "en-attente";
    else if (d.kind === "differe") {
      task.status = "differe";
      task.executeAt = new Date(this.now().getTime() + (d.seconds * 1000) / this.opts.speed).toISOString();
    } else return this.complete(task, outcome);
    this.recount();
    this.changed();
  }

  private rights(agentId: string): Rights {
    return this.cfg.agents[agentId]?.connectors ?? {};
  }

  private async finishWork(task: Task, sc: Scenario) {
    this.running.delete(task.id);
    const agent = this.agent(task.agentId);
    agent.appsInUse = [];
    agent.status = agent.status === "pause" ? "pause" : "disponible";

    if (!sc.action) return this.complete(task, sc.outcome);

    let action: Action = sc.action;
    if (sc.prepare && this.opts.bus) {
      const bus = this.opts.bus;
      try {
        const calls = await sc.prepare((tool, args) => bus.call(`agent:${task.agentId}`, this.rights(task.agentId), tool, args, sc.title), task);
        if (calls.length === 0) return this.complete(task, "Rien à faire : déjà traité.");
        action = { ...sc.action, tool: calls[0]?.tool ?? sc.action.tool, calls };
      } catch (e) {
        return this.fail(task, e);
      }
    }
    try {
      await this.propose(task, action, sc.outcome);
    } catch (e) {
      this.fail(task, e);
    }
  }

  /** L'action part : ses appels sont exécutés sur le bus, la décision d'autonomie ayant été prise. */
  private async complete(task: Task, outcome: string) {
    const calls = task.action?.calls ?? [];
    if (calls.length && this.opts.bus) {
      task.status = "en-cours"; // pendant l'exécution : ni annulable, ni validable une seconde fois
      try {
        for (const c of calls) await this.opts.bus.call(`agent:${task.agentId}`, this.rights(task.agentId), c.tool, c.args, task.action!.why.rule, true);
      } catch (e) {
        return this.fail(task, e);
      }
    }
    task.status = "terminee";
    task.outcome = outcome;
    task.endedAt = this.now().toISOString();
    this.journal.write({ qui: `agent:${task.agentId}`, quoi: "tache.fin", resultat: outcome, minutes: task.minutesSaved, tache: task.id });
    this.recount();
    this.changed();
  }

  private fail(task: Task, e: unknown) {
    task.status = "echec";
    task.outcome = `Échec : ${e instanceof Error ? e.message : String(e)}`;
    task.endedAt = this.now().toISOString();
    this.journal.write({ qui: `agent:${task.agentId}`, quoi: "tache.echec", resultat: task.outcome, tache: task.id });
    this.recount();
    this.changed();
  }

  private flushDeferred() {
    const now = this.now().getTime();
    for (const t of this.tasks) {
      if (t.status === "differe" && t.executeAt && Date.parse(t.executeAt) <= now) void this.complete(t, t.outcome ?? "Fait");
    }
  }

  approve(taskId: string, who: string) {
    const t = this.task(taskId);
    if (t.status !== "en-attente") throw new Conflict("Cette action n'attend plus de validation.");
    this.agent(t.agentId).streak++;
    this.journal.write({ qui: who, quoi: "validation", resultat: "validee", tache: t.id });
    void this.complete(t, t.outcome ?? "Fait");
  }

  refuse(taskId: string, who: string) {
    const t = this.task(taskId);
    if (t.status !== "en-attente") throw new Conflict("Cette action n'attend plus de validation.");
    this.agent(t.agentId).streak = 0;
    this.end(t, "refusee", "Refusé", who);
  }

  /** Annule une action différée avant son exécution. */
  cancel(taskId: string, who: string) {
    const t = this.task(taskId);
    if (t.status !== "differe") throw new Conflict("Trop tard : l'action est déjà partie.");
    this.agent(t.agentId).streak = 0;
    this.end(t, "annulee", "Annulé avant l'envoi", who);
  }

  /** Reprendre la main : arrête une tâche en cours et la laisse en l'état. */
  stop(taskId: string, who: string) {
    const t = this.task(taskId);
    if (t.status !== "en-cours") throw new Conflict("Cette tâche n'est plus en cours.");
    clearTimeout(this.running.get(t.id));
    this.running.delete(t.id);
    this.aborts.get(t.id)?.abort();
    this.aborts.delete(t.id);
    const a = this.agent(t.agentId);
    a.appsInUse = [];
    if (a.status === "travaille") a.status = "disponible";
    this.end(t, "arretee", "Arrêté : repris en main", who);
  }

  setAutonomy(agentId: string, level: Autonomy, who: string) {
    const a = this.agent(agentId);
    a.autonomy = level;
    a.streak = 0;
    this.journal.write({ qui: who, quoi: "autonomie", resultat: level, agent: agentId });
    this.changed();
  }

  pause(agentId: string, who: string) {
    this.agent(agentId).status = "pause";
    this.journal.write({ qui: who, quoi: "pause", agent: agentId });
    this.changed();
  }

  resume(agentId: string, who: string) {
    const a = this.agent(agentId);
    a.status = this.isBusy(agentId) ? "travaille" : "disponible";
    this.journal.write({ qui: who, quoi: "reprise", agent: agentId });
    this.changed();
  }

  private end(t: Task, status: Task["status"], outcome: string, who: string) {
    t.status = status;
    t.outcome = outcome;
    t.endedAt = this.now().toISOString();
    this.journal.write({ qui: who, quoi: status, tache: t.id });
    this.recount();
    this.changed();
  }

  private recount() {
    for (const a of this.agents.values()) a.pending = this.tasks.filter((t) => t.agentId === a.id && t.status === "en-attente").length;
  }

  private changed() {
    this.emit("change");
  }

  private nextId() {
    return `t${(++this.seq).toString().padStart(4, "0")}`;
  }
}

function toApproval(t: Task): Approval {
  return {
    id: t.id,
    agentId: t.agentId,
    summary: t.action?.summary ?? t.title,
    detail: t.decision?.kind === "validation" ? t.decision.reason : undefined,
    createdAt: t.endedAt ?? t.steps.at(-1)?.at ?? t.startedAt,
  };
}

export class NotFound extends Error {}
export class Conflict extends Error {}
