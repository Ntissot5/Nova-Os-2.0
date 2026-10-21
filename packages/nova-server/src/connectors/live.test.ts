// Tests des fournisseurs réels (IMAP/SMTP, CalDAV) contre de vrais serveurs.
// Lancés par tests/connecteurs-reels.nix (Dovecot, Mailpit, Radicale dans une VM) ; ignorés ailleurs.
//   NOVA_LIVE_MAILPIT   API de Mailpit (ex. http://127.0.0.1:8025) : vérifie que le SMTP a bien reçu
//   NOVA_MAIL_* / NOVA_AGENDA_*   comme en production

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const env = process.env as Record<string, string>;

async function connect(entry: string) {
  const client = new Client({ name: "nova-reel", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(here, entry)],
      env: { ...env, NOVA_DATA: mkdtempSync(join(tmpdir(), "nova-reel-")) },
      stderr: "inherit",
    }),
  );
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    if (res.isError) throw new Error((res.content as { text: string }[])[0]?.text);
    return res.structuredContent as Record<string, any>;
  };
  return { client, call };
}

describe("Mail : IMAP + SMTP réels", { skip: env.NOVA_MAIL_BACKEND !== "imap" }, () => {
  let c: Awaited<ReturnType<typeof connect>>;
  before(async () => (c = await connect("mail/index.js")));
  after(() => c.client.close());

  test("cherche et lit un mail reçu", async () => {
    const r = await c.call("mail_chercher", { texte: "fuite" });
    assert.equal(r.items.length, 1);
    const m = await c.call("mail_lire", { id: r.items[0].id });
    assert.match(m.text, /Rue du Lac 14/);
    assert.match(m.from, /Rossi/);
  });

  test("brouillon dans Drafts, aperçu, envoi par SMTP, copie dans Sent", async () => {
    const d = await c.call("mail_brouillon", { a: ["Maria Rossi <maria.rossi@example.org>"], sujet: "Re: Fuite", texte: "Le concierge passe aujourd'hui." });
    assert.match(d.id, /^brouillons:\d+$/);
    const p = await c.call("mail_envoyer", { id: d.id, dryRun: true });
    assert.equal(p.unknownRecipient, false, "Mme Rossi a écrit à la boîte");
    assert.equal(p.recipients, 1);
    const sent = await c.call("mail_envoyer", { id: d.id });
    assert.match(sent.envoye, /^envoyes:\d+$/);
    const inSent = await c.call("mail_chercher", { dossier: "envoyes", texte: "concierge" });
    assert.equal(inSent.items.length, 1);
    const smtp = (await (await fetch(`${env.NOVA_LIVE_MAILPIT}/api/v1/messages`)).json()) as { messages: { Subject: string; To: { Address: string }[] }[] };
    assert.ok(smtp.messages.some((m) => m.Subject === "Re: Fuite" && m.To[0]?.Address === "maria.rossi@example.org"), "reçu par le serveur SMTP");
    await assert.rejects(c.call("mail_envoyer", { id: d.id }), /introuvable/);
  });
});

describe("Agenda : CalDAV réel", { skip: env.NOVA_AGENDA_BACKEND !== "caldav" }, () => {
  let c: Awaited<ReturnType<typeof connect>>;
  before(async () => (c = await connect("agenda.js")));
  after(() => c.client.close());

  test("crée un rendez-vous sur le serveur et le retrouve", async () => {
    await c.call("agenda_creer", { titre: "Visite Rue du Lac 14", debut: "2026-10-22T10:00:00+02:00", fin: "2026-10-22T11:00:00+02:00", lieu: "Rue du Lac 14" });
    const r = await c.call("agenda_evenements", { du: "2026-10-22", au: "2026-10-22" });
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0].titre, "Visite Rue du Lac 14");
    assert.equal(r.items[0].debut, "2026-10-22T08:00:00.000Z");
  });
});
