#!/usr/bin/env node
// Connecteur Mail. Fournisseur choisi par NOVA_MAIL_BACKEND :
//   maildir (défaut) : data/mail/, format ouvert ; démonstration et tests
//   imap             : NOVA_MAIL_USER, NOVA_MAIL_PASSWORD, NOVA_MAIL_IMAP_HOST[, _PORT], NOVA_MAIL_SMTP_HOST[, _PORT], NOVA_MAIL_TLS,
//                      NOVA_MAIL_FROM (adresse d'expédition, par défaut l'identifiant s'il est une adresse)
//   microsoft        : Microsoft 365 par Graph, NOVA_MICROSOFT_TOKEN (connecté depuis l'écran Connecteurs)

import { z } from "zod";
import { RIGHT, SENSITIVE, dataDir, guard, ok, serve, server } from "../kit.js";
import { address as bare, type MailBackend } from "./backend.js";
import { imap } from "./imap.js";
import { maildir } from "./maildir.js";
import { microsoft } from "./microsoft.js";

const env = process.env;
const backend: MailBackend =
  env.NOVA_MAIL_BACKEND === "microsoft"
    ? microsoft()
    : env.NOVA_MAIL_BACKEND === "imap"
    ? imap({
        user: need("NOVA_MAIL_USER"),
        from: address(env.NOVA_MAIL_FROM ?? need("NOVA_MAIL_USER")),
        password: need("NOVA_MAIL_PASSWORD"),
        imapHost: need("NOVA_MAIL_IMAP_HOST"),
        imapPort: Number(env.NOVA_MAIL_IMAP_PORT ?? 993),
        smtpHost: need("NOVA_MAIL_SMTP_HOST"),
        smtpPort: Number(env.NOVA_MAIL_SMTP_PORT ?? 465),
        secure: env.NOVA_MAIL_TLS !== "0",
      })
    : maildir(dataDir("mail"), env.NOVA_MAIL_FROM ?? "regie@example.ch");

const s = server("mail");

s.registerTool(
  "mail_chercher",
  {
    title: "Chercher des mails",
    description:
      "Cherche dans les mails de l'entreprise, du plus récent au plus ancien. `dossier` : « inbox » (reçus, défaut) ou « envoyes ». `depuis` au format AAAA-MM-JJ.",
    inputSchema: {
      texte: z.string().optional(),
      expediteur: z.string().optional(),
      depuis: z.string().optional(),
      dossier: z.enum(["inbox", "envoyes"]).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    annotations: { readOnlyHint: true },
    _meta: { [RIGHT]: "read" },
  },
  guard(async ({ texte, expediteur, depuis, dossier = "inbox", limit = 10 }) =>
    ok(await backend.search({ query: texte, from: expediteur, since: depuis ? new Date(depuis) : undefined, folder: dossier, limit })),
  ),
);

s.registerTool(
  "mail_lire",
  {
    title: "Lire un mail",
    description: "Lit un mail complet à partir de son identifiant (donné par mail_chercher).",
    inputSchema: { id: z.string() },
    annotations: { readOnlyHint: true },
    _meta: { [RIGHT]: "read" },
  },
  guard(async ({ id }) => ok(await backend.read(id))),
);

s.registerTool(
  "mail_brouillon",
  {
    title: "Préparer un mail",
    description: "Prépare un brouillon. Rien n'est envoyé : l'envoi se fait ensuite avec mail_envoyer.",
    inputSchema: {
      a: z.array(z.string()).min(1),
      cc: z.array(z.string()).optional(),
      sujet: z.string(),
      texte: z.string(),
      enReponseA: z.string().optional().describe("Message-ID du mail auquel on répond"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    _meta: { [RIGHT]: "draft" },
  },
  guard(async ({ a, cc, sujet, texte, enReponseA }) => ok({ id: await backend.draft({ to: a, cc, subject: sujet, body: texte, inReplyTo: enReponseA }) })),
);

s.registerTool(
  "mail_envoyer",
  {
    title: "Envoyer un brouillon",
    description: "Envoie un brouillon préparé avec mail_brouillon.",
    inputSchema: { id: z.string(), dryRun: z.boolean().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    _meta: { [RIGHT]: "send", [SENSITIVE]: true },
  },
  guard(async ({ id, dryRun }) => {
    const d = await backend.readDraft(id);
    if (dryRun) {
      const known = await backend.known();
      const to = [...d.to, ...d.cc];
      const names = to.map((x) => x.replace(/\s*<.*>/, "")).join(", ");
      return ok({
        summary: `Envoyer « ${d.subject} » à ${names}`,
        recipients: to.length,
        unknownRecipient: to.some((x) => !known.has(bare(x))),
      });
    }
    return ok({ envoye: await backend.send(id) });
  }),
);

process.on("SIGTERM", () => backend.close().finally(() => process.exit(0)));
await serve(s);

function address(a: string) {
  if (!/^[^\s@<>]+@[^\s@<>]+$/.test(a)) throw new Error(`Adresse d'expédition invalide : « ${a} ». Renseigne NOVA_MAIL_FROM (ex. regie@exemple.ch).`);
  return a;
}

function need(name: string) {
  const v = env[name];
  if (!v) throw new Error(`Variable ${name} manquante pour le fournisseur IMAP.`);
  return v;
}
