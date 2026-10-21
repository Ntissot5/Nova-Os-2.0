// La boucle de questions et le bus, avec les vrais connecteurs et un faux Claude scripté.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import type { AskEvent } from "../core/types.js";
import { ask, type Create } from "./ask.js";
import { Bus, Forbidden, READ_ALL } from "./bus.js";

const fixtures = fileURLToPath(new URL("../../../../companies/demo/data", import.meta.url));
const lines: Record<string, unknown>[] = [];
const journal = { write: (e: Record<string, unknown>) => void lines.push(e) };
let bus: Bus;

before(async () => {
  const data = mkdtempSync(join(tmpdir(), "nova-ask-"));
  cpSync(fixtures, data, { recursive: true });
  bus = new Bus(journal, { NOVA_DATA: data, NOVA_TODAY: "2026-10-21" });
  await bus.start();
});
after(() => bus.stop());

const usage = { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 };
const msg = (stop: string, content: unknown[]) => ({ id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: stop, content, usage }) as unknown as Anthropic.Beta.Messages.BetaMessage;
const use = (id: string, name: string, input: Record<string, unknown>) => ({ type: "tool_use", id, name, input });

function scripted(turns: Anthropic.Beta.Messages.BetaMessage[], seen: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming[]): Create {
  return async (p) => {
    seen.push(structuredClone(p));
    const next = turns.shift();
    if (!next) throw new Error("plus de réponses scriptées");
    return next;
  };
}

const base = { caller: "humain:noa", company: "Régie Démo SA", today: "2026-10-21", model: "claude-sonnet-5-5", journal };

test("une question traverse 3 sources en parallèle et cite ses sources", async () => {
  const seen: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming[] = [];
  const events: AskEvent[] = [];
  const create = scripted(
    [
      msg("tool_use", [
        use("a", "compta_retards", { joursMin: 10 }),
        use("b", "mail_chercher", { expediteur: "berset" }),
        use("c", "agenda_evenements", { du: "2026-10-21", au: "2026-10-23" }),
      ]),
      msg("end_turn", [{ type: "text", text: "3 locataires sont en retard (4’305 CHF). Mme Berset propose de payer en deux fois." }]),
    ],
    seen,
  );
  const r = await ask("Qui est en retard de loyer, et est-ce que quelqu'un nous a écrit à ce sujet ?", { ...base, create, bus, rights: READ_ALL, onEvent: (e) => events.push(e) });

  assert.equal(r.type, "reponse");
  assert.match(r.text, /3 locataires/);
  assert.deepEqual(r.sources?.sort(), ["Agenda", "Compta", "Mail"]);
  assert.deepEqual(events.filter((e) => e.type === "etape").map((e) => e.app).sort(), ["agenda", "compta", "mail"]);

  // Le second appel contient les trois résultats réels des connecteurs.
  const results = seen[1]!.messages.at(-1)!.content as Anthropic.Beta.Messages.BetaToolResultBlockParam[];
  assert.equal(results.length, 3);
  assert.match(String(results[0]!.content), /Dupont Marc/);
  assert.match(String(results[1]!.content), /Loyer d'octobre/);
  assert.match(String(results[2]!.content), /Visite appartement/);

  // Seuls les outils de lecture sont proposés au modèle, dans un ordre stable.
  const names = seen[0]!.tools!.map((t) => (t as { name: string }).name);
  assert.ok(!names.includes("mail_envoyer") && !names.includes("compta_payer") && !names.includes("mail_brouillon"));
  assert.deepEqual(names, [...names].sort());
  assert.equal(seen[0]!.output_config?.effort, "low");

  // Le journal garde la question, les tokens et le coût.
  const entry = lines.find((l) => l.quoi === "question")!;
  assert.equal(entry.qui, "humain:noa");
  assert.ok((entry.coutUSD as number) > 0);
});

test("un outil hors des droits est refusé et le modèle le sait", async () => {
  const events: AskEvent[] = [];
  const seen: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming[] = [];
  const create = scripted(
    [msg("tool_use", [use("a", "compta_retards", {})]), msg("end_turn", [{ type: "text", text: "Je n'ai pas accès à la compta." }])],
    seen,
  );
  await ask("Qui est en retard ?", { ...base, create, bus, rights: { mail: ["read"] }, onEvent: (e) => events.push(e) });
  const result = (seen[1]!.messages.at(-1)!.content as Anthropic.Beta.Messages.BetaToolResultBlockParam[])[0]!;
  assert.equal(result.is_error, true);
  assert.match(String(result.content), /droit « read » sur compta/);
  assert.ok(lines.some((l) => l.resultat === "refuse" && l.quoi === "compta_retards"));
});

test("un refus du modèle donne une phrase claire, pas une erreur technique", async () => {
  const create = scripted([msg("refusal", [])], []);
  const r = await ask("…", { ...base, create, bus, rights: READ_ALL, onEvent: () => {} });
  assert.equal(r.type, "erreur");
  assert.match(r.text, /ne peux pas répondre/);
});

test("une action sensible ne passe jamais sans décision d'autonomie", async () => {
  const rights = { mail: ["draft", "send"] };
  const d = (await bus.call("agent:locataires", rights, "mail_brouillon", { a: ["j.favre.concierge@example.org"], sujet: "Test", texte: "Test" }, "test")) as { id: string };
  await assert.rejects(bus.call("agent:locataires", rights, "mail_envoyer", { id: d.id }, "test"), Forbidden);
  const p = await bus.preview("agent:locataires", rights, "mail_envoyer", { id: d.id });
  assert.match(p.summary, /Envoyer « Test »/);
  assert.equal(p.unknownRecipient, false);
});
