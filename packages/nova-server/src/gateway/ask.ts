// Questions en langage naturel : Claude répond en consultant les sources de l'entreprise,
// en lecture seule, à travers le bus (droits et journal compris). Chaque consultation devient
// une étape visible pour la personne qui a posé la question (D-015).

import type Anthropic from "@anthropic-ai/sdk";
import type { Journal } from "../core/journal.js";
import type { AskEvent } from "../core/types.js";
import { type Bus, type Rights } from "./bus.js";
import { addUsage, costUSD, type Usage } from "./cost.js";
import { stepText } from "./steps.js";

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.Messages.BetaMessage;
export type Create = (p: Params) => Promise<Message>;

const MAX_TURNS = 8;

const APP: Record<string, string> = { mail: "mail", agenda: "agenda", compta: "compta", fichiers: "fichiers", telephone: "telephone" };
const SOURCE: Record<string, string> = { mail: "Mail", agenda: "Agenda", compta: "Compta", fichiers: "Fichiers", telephone: "Téléphone" };

function system(company: string) {
  return `Tu es l'assistant de ${company}, une entreprise suisse. Tu réponds aux questions des personnes de l'entreprise en consultant ses sources (mails, agenda, comptabilité, fichiers, téléphone) avec les outils fournis.

Règles :
- Réponds en français, en une à trois phrases complètes et humaines. Le chiffre ou le nom important d'abord.
- Consulte les sources nécessaires avant de répondre ; si plusieurs sources sont utiles, interroge-les en parallèle.
- N'invente rien : si l'information n'est pas dans les sources, dis-le simplement.
- Montants en francs suisses au format 1’240.50 CHF. Dates relatives quand c'est plus clair (« demain à 10 h »).
- Tu ne fais aucune action : tu lis et tu réponds.`;
}

export async function ask(
  question: string,
  deps: {
    create: Create;
    bus: Bus;
    rights: Rights;
    caller: string;
    company: string;
    today: string;
    model: string;
    journal: Journal;
    onEvent: (e: AskEvent) => void;
  },
): Promise<AskEvent> {
  const started = Date.now();
  const tools = deps.bus.tools(deps.rights, { readOnly: true });
  const apiTools: Anthropic.Beta.Messages.BetaTool[] = tools.map((t) => ({
    name: t.name,
    description: `${t.title}. ${t.description}`,
    input_schema: t.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
  }));
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    { role: "user", content: `Nous sommes le ${deps.today}.\n\n${question}` },
  ];
  const used = new Set<string>();
  let usage: Usage = { input_tokens: 0, output_tokens: 0 };

  const finish = (e: AskEvent) => {
    const done = { ...e, ms: Date.now() - started, sources: [...used].map((c) => SOURCE[c] ?? c) };
    deps.journal.write({
      qui: deps.caller,
      quoi: "question",
      pourquoi: question,
      resultat: e.type === "reponse" ? e.text : `erreur : ${e.text}`,
      modele: deps.model,
      tokens: { in: usage.input_tokens, out: usage.output_tokens, cacheLu: usage.cache_read_input_tokens, cacheEcrit: usage.cache_creation_input_tokens },
      coutUSD: costUSD(deps.model, usage),
      ms: done.ms,
    });
    deps.onEvent(done);
    return done;
  };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await deps.create({
      model: deps.model,
      max_tokens: 8000,
      // Questions courtes et rapides : effort bas (D-017). Le cache garde le prompt système et les outils.
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" },
      // Si un filtre de sécurité refuse à tort, l'API rejoue la requête sur un modèle de repli.
      ...(deps.model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
      system: system(deps.company),
      tools: apiTools,
      messages,
    });
    usage = addUsage(usage, res.usage);

    if (res.stop_reason === "refusal") return finish({ type: "erreur", text: "Je ne peux pas répondre à cette question." });
    if (res.stop_reason === "max_tokens") return finish({ type: "erreur", text: "La réponse était trop longue. Reformule la question plus précisément." });
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }

    const calls = res.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || calls.length === 0) {
      const text = res.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return finish({ type: "reponse", text: text || "Je n'ai pas trouvé de réponse." });
    }

    messages.push({ role: "assistant", content: res.content });
    const results = await Promise.all(
      calls.map(async (c): Promise<Anthropic.Beta.Messages.BetaToolResultBlockParam> => {
        const args = (c.input ?? {}) as Record<string, unknown>;
        let connector: string | undefined;
        try {
          connector = deps.bus.info(c.name).connector;
        } catch {
          // outil inconnu : le bus le refusera plus bas, avec une erreur lisible pour le modèle
        }
        deps.onEvent({ type: "etape", text: stepText(c.name, args), app: connector ? APP[connector] : undefined });
        try {
          const out = await deps.bus.call(deps.caller, deps.rights, c.name, args, question);
          if (connector) used.add(connector);
          return { type: "tool_result", tool_use_id: c.id, content: JSON.stringify(out) };
        } catch (e) {
          return { type: "tool_result", tool_use_id: c.id, is_error: true, content: e instanceof Error ? e.message : String(e) };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  return finish({ type: "erreur", text: "Je n'ai pas réussi à conclure. Reformule la question plus précisément." });
}
