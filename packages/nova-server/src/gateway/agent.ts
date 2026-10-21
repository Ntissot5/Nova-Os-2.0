// Un agent vivant : Claude travaille avec les outils que company.nix lui accorde, à travers le bus.
// Chaque outil consulté devient une étape visible ; chaque brouillon s'affiche dans le document en cours.
// Les outils sensibles ne sont jamais exécutés ici : l'agent les *propose*, le moteur décide (autonomie).

import type Anthropic from "@anthropic-ai/sdk";
import type { Journal } from "../core/journal.js";
import type { ToolCall } from "../core/types.js";
import type { Create } from "./ask.js";
import type { Bus, Rights } from "./bus.js";
import { addUsage, costUSD, type Usage } from "./cost.js";
import type { LiveContext, LiveResult } from "./engine.js";
import type { Skill } from "./skills.js";
import { stepText } from "./steps.js";

type Message = Anthropic.Beta.Messages.BetaMessage;
type Tool = Anthropic.Beta.Messages.BetaTool;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

const MAX_TURNS = 16;

export interface AgentDeps {
  create: Create;
  bus: Bus;
  journal: Journal;
  agentId: string;
  agentName: string;
  rights: Rights;
  skill: Skill;
  company: string;
  memory: string; // data/memory/regles.md : les règles de l'entreprise
  today: string;
}

const FINISH: Tool = {
  name: "terminer",
  description:
    "À appeler une seule fois, à la fin du travail. Résume ce que tu as fait en une phrase pour le dirigeant, cite la règle suivie et les informations utilisées.",
  input_schema: {
    type: "object",
    properties: {
      resultat: { type: "string", description: "Une phrase : ce qui a été fait ou préparé (« Concierge prévenu, Mme Rossi rassurée. »)" },
      regle: { type: "string", description: "La règle de l'entreprise suivie, en une phrase." },
      refRegle: { type: "string", description: "Où se trouve cette règle (ex. regles.md#urgences), si elle vient d'un fichier." },
      sources: { type: "array", items: { type: "string" }, description: "Les informations utilisées (« Mail de Mme Rossi », « Fiche immeuble Rue du Lac 14 »)." },
    },
    required: ["resultat", "regle", "sources"],
    additionalProperties: false,
  },
  strict: true,
};

function system(d: AgentDeps) {
  return `Tu es ${d.agentName}, un agent de ${d.company}, une entreprise suisse. Tu travailles avec les outils fournis, qui donnent accès aux sources de l'entreprise.

# Ton métier
${d.skill.body}

# Règles de l'entreprise
${d.memory || "(aucune règle écrite)"}

# Principes
- N'invente jamais une information : vérifie-la dans les sources. Si elle manque, dis-le.
- Les actions sensibles (envoi, paiement, suppression) ne partent pas tout de suite : elles suivent les règles d'autonomie choisies par le dirigeant (validation ou délai d'annulation). Propose-les normalement, une seule fois chacune.
- Écris en français, au format suisse (1’240.50 CHF).
- Termine toujours en appelant l'outil « terminer ».`;
}

export async function runAgent(ctx: LiveContext, d: AgentDeps, mission: string): Promise<LiveResult> {
  const who = `agent:${d.agentId}`;
  const tools: Tool[] = [
    ...d.bus.tools(d.rights).map((t) => ({ name: t.name, description: `${t.title}. ${t.description}`, input_schema: t.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema })),
    FINISH,
  ];
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: `Nous sommes le ${d.today}.\n\n${mission}` }];
  const calls: ToolCall[] = [];
  const summaries: string[] = [];
  let finish: { resultat: string; regle: string; refRegle?: string; sources: string[] } | undefined;
  let usage: Usage = { input_tokens: 0, output_tokens: 0 };
  let lastText = "";

  try {
    for (let turn = 0; turn < MAX_TURNS && !finish; turn++) {
      if (ctx.signal.aborted) throw new Error("Arrêté.");
      const res: Message = await d.create({
        model: d.skill.model,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        ...(d.skill.model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
        system: system(d),
        tools,
        messages,
      });
      usage = addUsage(usage, res.usage);
      if (res.stop_reason === "refusal") throw new Error("Le modèle a refusé cette tâche.");
      if (res.stop_reason === "max_tokens") throw new Error("Réponse trop longue, tâche interrompue.");
      lastText = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim() || lastText;
      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      const uses = res.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || uses.length === 0) break;

      messages.push({ role: "assistant", content: res.content });
      const results: ToolResult[] = [];
      for (const u of uses) {
        if (ctx.signal.aborted) throw new Error("Arrêté.");
        results.push(await handle(u));
      }
      messages.push({ role: "user", content: results });
    }
  } finally {
    d.journal.write({ qui: who, quoi: "agent.travail", pourquoi: mission.slice(0, 200), modele: d.skill.model, tokens: { in: usage.input_tokens, out: usage.output_tokens, cacheLu: usage.cache_read_input_tokens }, coutUSD: costUSD(d.skill.model, usage) });
  }

  return {
    calls,
    summary: summaries.join(" ; ") || undefined,
    outcome: finish?.resultat ?? (lastText || "Travail terminé."),
    why: { rule: finish?.regle ?? "Instructions du métier de l'agent.", ruleRef: finish?.refRegle, sources: finish?.sources ?? [] },
    minutesSaved: d.skill.minutes * Math.max(1, calls.length),
  };

  async function handle(u: Anthropic.Beta.Messages.BetaToolUseBlock): Promise<ToolResult> {
    const args = (u.input ?? {}) as Record<string, unknown>;
    const err = (m: string): ToolResult => ({ type: "tool_result", tool_use_id: u.id, is_error: true, content: m });
    if (u.name === "terminer") {
      finish = args as typeof finish;
      return { type: "tool_result", tool_use_id: u.id, content: "Noté." };
    }
    let info;
    try {
      info = d.bus.info(u.name);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
    try {
      if (info.sensitive) {
        // Proposée, pas exécutée : l'aperçu vérifie qu'elle est possible et dit ce qu'elle ferait.
        if (calls.some((c) => c.tool === u.name && JSON.stringify(c.args) === JSON.stringify(args))) return err("Cette action est déjà proposée.");
        const p = await d.bus.preview(who, d.rights, u.name, args);
        calls.push({ tool: u.name, args });
        summaries.push(p.summary);
        ctx.step(`Je prépare : ${p.summary}.`, info.connector);
        return {
          type: "tool_result",
          tool_use_id: u.id,
          content: `Action enregistrée : « ${p.summary} ». Elle partira selon les règles d'autonomie de l'entreprise (validation humaine ou délai d'annulation). Ne la refais pas.`,
        };
      }
      ctx.step(stepText(u.name, args), info.connector);
      const out = await d.bus.call(who, d.rights, u.name, args, d.skill.id);
      if (u.name === "mail_brouillon") ctx.doc(String(args.sujet ?? "Brouillon"), String(args.texte ?? ""));
      return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out) };
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }
}

// ---------- Tri : un petit modèle décide s'il y a quelque chose à faire (D-017) ----------

export interface Triage {
  categorie: "urgence" | "demande" | "information" | "pas-pour-nous";
  agir: boolean;
  resume: string;
}

const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    categorie: { type: "string", enum: ["urgence", "demande", "information", "pas-pour-nous"] },
    agir: { type: "boolean", description: "Vrai si la régie doit faire quelque chose (répondre, transmettre, intervenir)." },
    resume: { type: "string", description: "Une phrase : qui écrit, à propos de quoi." },
  },
  required: ["categorie", "agir", "resume"],
  additionalProperties: false,
};

export async function triage(create: Create, model: string, company: string, mail: { from: string; subject: string; text: string }) {
  const res = await create({
    model,
    max_tokens: 1024,
    output_config: { effort: "low", format: { type: "json_schema", schema: TRIAGE_SCHEMA } },
    system: `Tu tries les mails reçus par ${company}, une régie immobilière suisse. Classe chaque mail et dis si la régie doit agir. Une fuite, une panne de chauffage, un problème électrique ou de sécurité est une urgence.`,
    messages: [{ role: "user", content: `De : ${mail.from}\nSujet : ${mail.subject}\n\n${mail.text.slice(0, 8000)}` }],
  });
  if (res.stop_reason === "refusal") throw new Error("Le modèle de tri a refusé ce mail.");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { triage: JSON.parse(text) as Triage, usage: res.usage };
}
