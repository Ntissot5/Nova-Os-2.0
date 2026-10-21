// Quand les agents travaillent : à chaque nouveau mail (skill « mail »), chaque jour à heure fixe
// (« quotidien HH:MM »), ou quand le dirigeant clique sur « Lancer maintenant ».
// L'état (mails déjà traités, dernière tournée) est gardé dans data/agents/<agent>.json, en clair.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Journal } from "../core/journal.js";
import type { CompanyConfig } from "../core/types.js";
import type { Create } from "./ask.js";
import { runAgent, triage } from "./agent.js";
import type { Bus, Rights } from "./bus.js";
import { costUSD } from "./cost.js";
import type { Engine } from "./engine.js";
import type { Skill } from "./skills.js";

interface AgentMemo {
  traites: string[]; // identifiants des mails déjà triés
  depuis: string; // date à partir de laquelle on regarde les mails
  derniereTournee?: string; // AAAA-MM-JJ
}

export interface TriggerDeps {
  engine: Engine;
  bus: Bus;
  journal: Journal;
  create: Create;
  cfg: CompanyConfig;
  skills: Map<string, Skill>; // agentId → skill principal
  data: string;
  memory: () => string;
  now?: () => Date;
}

const POLL_MS = Number(process.env.NOVA_POLL_SECONDS ?? 60) * 1000;

export class Triggers {
  private queue: { agentId: string; key: string; start: () => void }[] = [];
  private queued = new Set<string>();
  private timer?: NodeJS.Timeout;

  constructor(private d: TriggerDeps) {}

  start() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
  }

  private now() {
    return this.d.now ? this.d.now() : new Date();
  }

  private rights(agentId: string): Rights {
    return this.d.cfg.agents[agentId]?.connectors ?? {};
  }

  private memoPath(agentId: string) {
    return join(this.d.data, "agents", `${agentId}.json`);
  }

  private memo(agentId: string): AgentMemo {
    const p = this.memoPath(agentId);
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
    // Premier démarrage : on regarde les mails des dernières 72 heures, pas tout l'historique.
    return { traites: [], depuis: new Date(this.now().getTime() - 72 * 3600_000).toISOString().slice(0, 10) };
  }

  private save(agentId: string, m: AgentMemo) {
    mkdirSync(join(this.d.data, "agents"), { recursive: true });
    m.traites = m.traites.slice(-2000);
    writeFileSync(this.memoPath(agentId), JSON.stringify(m, null, 2));
  }

  /** Un passage : nouveaux mails, tournées du jour, puis on lance ce qui attend (un travail à la fois par agent). */
  async tick() {
    for (const [agentId, skill] of this.d.skills) {
      const st = this.d.engine.agent(agentId);
      if (st.status === "pause") continue;
      try {
        if (skill.trigger.kind === "mail") await this.collectMail(agentId, skill);
        if (skill.trigger.kind === "quotidien") this.daily(agentId, skill, skill.trigger.at);
      } catch (e) {
        this.d.journal.write({ qui: `agent:${agentId}`, quoi: "declencheur", resultat: "erreur", erreur: String(e instanceof Error ? e.message : e) });
      }
    }
    this.drain();
  }

  /** « Lancer maintenant » depuis la page de l'agent. */
  runNow(agentId: string) {
    const skill = this.d.skills.get(agentId);
    if (!skill) throw new Error(`L'agent ${agentId} n'a pas de métier configuré.`);
    if (skill.trigger.kind === "mail") return void this.tick();
    this.enqueue(agentId, `manuel:${Date.now()}`, () => this.tour(agentId, skill));
    this.drain();
  }

  private daily(agentId: string, skill: Skill, at: string) {
    const now = this.now();
    const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
    const hhmm = now.toLocaleTimeString("fr-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });
    const m = this.memo(agentId);
    if (m.derniereTournee === today || hhmm < at) return;
    m.derniereTournee = today;
    this.save(agentId, m);
    this.enqueue(agentId, `tournee:${today}`, () => this.tour(agentId, skill));
  }

  private tour(agentId: string, skill: Skill) {
    const name = this.d.cfg.agents[agentId]?.name ?? agentId;
    const mission = "Fais ta tournée du jour, selon ton métier.";
    this.d.engine.run(agentId, `Tournée du jour : ${name}`, (ctx) => runAgent(ctx, this.agentDeps(agentId, skill), mission), skill.minutes);
  }

  private async collectMail(agentId: string, skill: Skill) {
    const m = this.memo(agentId);
    const r = (await this.d.bus.call(`agent:${agentId}`, this.rights(agentId), "mail_chercher", { depuis: m.depuis, limit: 50 }, "nouveaux mails")) as {
      items?: { id: string; from: string; subject: string; date: string }[];
    };
    for (const mail of (r.items ?? []).slice().reverse()) {
      if (m.traites.includes(mail.id)) continue;
      m.traites.push(mail.id);
      this.enqueue(agentId, mail.id, () => this.handleMail(agentId, skill, mail.id));
    }
    this.save(agentId, m);
  }

  private handleMail(agentId: string, skill: Skill, id: string) {
    const deps = this.agentDeps(agentId, skill);
    const who = `agent:${agentId}`;
    this.d.engine.run(
      agentId,
      "Nouveau mail",
      async (ctx) => {
        ctx.step("Je lis le nouveau mail.", "mail");
        const mail = (await this.d.bus.call(who, this.rights(agentId), "mail_lire", { id }, "tri")) as { from: string; subject: string; text: string; messageId?: string };
        ctx.title(`${mail.subject} (${mail.from.replace(/\s*<.*>/, "")})`);
        if (skill.triModel) {
          const { triage: t, usage } = await triage(this.d.create, skill.triModel, this.d.cfg.company.name, mail);
          this.d.journal.write({ qui: who, quoi: "tri", pourquoi: mail.subject, resultat: `${t.categorie}${t.agir ? "" : ", rien à faire"}`, modele: skill.triModel, coutUSD: costUSD(skill.triModel, usage) });
          ctx.step(`${t.resume} ${label(t.categorie)}`, "mail");
          if (!t.agir) return { calls: [], outcome: `Mail trié (${t.categorie}) : ${t.resume}`, why: { rule: "Tri des mails reçus", sources: [`Mail : ${mail.subject}`] }, minutesSaved: 2 };
        }
        return runAgent(
          ctx,
          deps,
          `Un nouveau mail est arrivé. Traite-le selon ton métier.\n\nIdentifiant : ${id}\nMessage-ID : ${mail.messageId ?? ""}\nDe : ${mail.from}\nSujet : ${mail.subject}\n\n${mail.text.slice(0, 12000)}`,
        );
      },
      skill.minutes,
    );
  }

  private agentDeps(agentId: string, skill: Skill) {
    const a = this.d.cfg.agents[agentId]!;
    return {
      create: this.d.create,
      bus: this.d.bus,
      journal: this.d.journal,
      agentId,
      agentName: a.name,
      rights: this.rights(agentId),
      skill,
      company: this.d.cfg.company.name,
      memory: this.d.memory(),
      today: this.now().toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich", weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    };
  }

  private enqueue(agentId: string, key: string, start: () => void) {
    const k = `${agentId}:${key}`;
    if (this.queued.has(k)) return;
    this.queued.add(k);
    this.queue.push({ agentId, key: k, start });
  }

  /** Lance le prochain travail de chaque agent libre ; les autres attendent leur tour. */
  drain() {
    for (const item of [...this.queue]) {
      const st = this.d.engine.agent(item.agentId);
      if (st.status === "pause" || this.d.engine.isBusy(item.agentId)) continue;
      this.queue.splice(this.queue.indexOf(item), 1);
      item.start();
    }
  }
}

const label = (c: string) => (c === "urgence" ? "C'est urgent." : c === "demande" ? "C'est une demande." : c === "information" ? "C'est une information." : "Ce n'est pas pour la régie.");
