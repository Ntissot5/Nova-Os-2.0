// Fournisseur Microsoft 365 : la boîte Outlook de l'entreprise, par Microsoft Graph.
// Les brouillons sont de vrais brouillons Outlook : la régie les voit aussi dans son Outlook habituel.

import { graph, isoUtc } from "../microsoft.js";
import { address, snippet, type Draft, type MailBackend, type MailMessage, type MailSummary } from "./backend.js";

interface Adresse {
  emailAddress: { name?: string; address: string };
}
interface Message {
  id: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  subject?: string;
  bodyPreview?: string;
  from?: Adresse;
  toRecipients?: Adresse[];
  ccRecipients?: Adresse[];
  internetMessageId?: string;
  body?: { content: string };
  isDraft?: boolean;
}

const FOLDER = { inbox: "inbox", envoyes: "sentitems" } as const;
const fmt = (a?: Adresse) => (a ? (a.emailAddress.name ? `${a.emailAddress.name} <${a.emailAddress.address}>` : a.emailAddress.address) : "");
const dest = (list: string[] = []) => list.map((x) => ({ emailAddress: { address: address(x) } }));

export function microsoft(): MailBackend {
  const g = graph();

  const summary = (m: Message): MailSummary => ({
    id: m.id,
    date: isoUtc(m.receivedDateTime ?? m.sentDateTime ?? new Date(0).toISOString()),
    from: fmt(m.from),
    subject: m.subject ?? "",
    snippet: snippet(m.bodyPreview ?? ""),
  });

  const full = (m: Message): MailMessage => ({
    ...summary(m),
    to: (m.toRecipients ?? []).map(fmt),
    cc: (m.ccRecipients ?? []).map(fmt),
    messageId: m.internetMessageId,
    text: m.body?.content ?? "",
  });

  const lire = (id: string) =>
    g<Message>(`/me/messages/${encodeURIComponent(id)}?$select=id,receivedDateTime,sentDateTime,subject,bodyPreview,from,toRecipients,ccRecipients,internetMessageId,body,isDraft`);

  return {
    async search({ query, from, since, limit, folder }) {
      const params = new URLSearchParams({
        $top: String(query || from ? 100 : limit),
        $orderby: "receivedDateTime desc",
        $select: "id,receivedDateTime,sentDateTime,subject,bodyPreview,from",
      });
      if (since) params.set("$filter", `receivedDateTime ge ${since.toISOString()}`);
      const r = await g<{ value: Message[] }>(`/me/mailFolders/${FOLDER[folder]}/messages?${params}`);
      const q = query?.toLowerCase();
      const f = from?.toLowerCase();
      return r.value
        .map(summary)
        .filter((m) => (!q || `${m.subject} ${m.snippet} ${m.from}`.toLowerCase().includes(q)) && (!f || m.from.toLowerCase().includes(f)))
        .slice(0, limit);
    },

    async read(id) {
      return full(await lire(id));
    },

    async draft(d: Draft) {
      const contenu = { subject: d.subject, body: { contentType: "Text", content: d.body }, toRecipients: dest(d.to), ccRecipients: dest(d.cc) };
      // Une réponse reste dans la conversation Outlook d'origine.
      if (d.inReplyTo) {
        const id = d.inReplyTo.replace(/'/g, "''");
        const orig = await g<{ value: Message[] }>(`/me/messages?$filter=internetMessageId eq '${encodeURIComponent(id)}'&$select=id`);
        if (orig.value[0]) {
          const reply = await g<Message>(`/me/messages/${encodeURIComponent(orig.value[0].id)}/createReply`, { method: "POST", json: {} });
          await g(`/me/messages/${encodeURIComponent(reply.id)}`, { method: "PATCH", json: contenu });
          return reply.id;
        }
      }
      return (await g<Message>("/me/messages", { method: "POST", json: contenu })).id;
    },

    async readDraft(id) {
      const m = await lire(id);
      if (m.isDraft === false) throw new Error("Ce message n'est pas un brouillon : il a déjà été envoyé.");
      return full(m);
    },

    async send(id) {
      const m = await lire(id);
      if (m.isDraft === false) throw new Error("Ce message a déjà été envoyé.");
      await g(`/me/messages/${encodeURIComponent(id)}/send`, { method: "POST" });
      return m.internetMessageId ?? id;
    },

    async known() {
      const set = new Set<string>();
      const [recus, envoyes] = await Promise.all([
        g<{ value: Message[] }>("/me/mailFolders/inbox/messages?$top=200&$select=from"),
        g<{ value: Message[] }>("/me/mailFolders/sentitems/messages?$top=200&$select=toRecipients,ccRecipients"),
      ]);
      for (const m of recus.value) if (m.from) set.add(m.from.emailAddress.address.toLowerCase());
      for (const m of envoyes.value) for (const a of [...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])]) set.add(a.emailAddress.address.toLowerCase());
      return set;
    },

    async close() {},
  };
}
