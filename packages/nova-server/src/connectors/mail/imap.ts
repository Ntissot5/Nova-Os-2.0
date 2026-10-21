// Fournisseur IMAP/SMTP : la vraie boîte de l'entreprise (Infomaniak, Gmail, Exchange en IMAP…).
// Identifiants lus dans l'environnement, fournis par sops-nix (jamais dans company.nix).

import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser, type AddressObject } from "mailparser";
import { compose } from "./compose.js";
import { address, snippet, type Draft, type MailBackend, type MailMessage } from "./backend.js";

export interface ImapConfig {
  user: string; // identifiant de connexion
  from: string; // adresse d'expédition (souvent identique à l'identifiant, pas toujours)
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  secure: boolean; // TLS direct (993/465) ; sinon STARTTLS
}

export function imap(cfg: ImapConfig): MailBackend {
  const client = new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
  });
  const smtp = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.secure && cfg.smtpPort === 465,
    auth: { user: cfg.user, pass: cfg.password },
  });
  let ready: Promise<void> | undefined;
  const connect = () => (ready ??= client.connect());

  // Dossiers spéciaux, trouvés par leur rôle IMAP (\Sent, \Drafts) plutôt que par leur nom.
  let special: Promise<{ sent: string; drafts: string }> | undefined;
  const folders = () =>
    (special ??= (async () => {
      await connect();
      const boxes = await client.list();
      const find = (use: string, fallback: string) => boxes.find((b) => b.specialUse === use)?.path ?? fallback;
      const res = { sent: find("\\Sent", "Sent"), drafts: find("\\Drafts", "Drafts") };
      for (const path of [res.sent, res.drafts]) if (!boxes.some((b) => b.path === path)) await client.mailboxCreate(path);
      return res;
    })());

  const mailboxOf = async (kind: "inbox" | "envoyes" | "brouillons") =>
    kind === "inbox" ? "INBOX" : kind === "envoyes" ? (await folders()).sent : (await folders()).drafts;

  async function fetch(kind: "inbox" | "envoyes" | "brouillons", uid: number): Promise<MailMessage> {
    await connect();
    const lock = await client.getMailboxLock(await mailboxOf(kind));
    try {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) throw new Error(`Message introuvable : ${kind}:${uid}`);
      const m = await simpleParser(msg.source);
      const text = m.text ?? "";
      return {
        id: `${kind}:${uid}`,
        date: (m.date ?? new Date()).toISOString(),
        from: m.from?.text ?? "",
        to: list(m.to),
        cc: list(m.cc),
        subject: m.subject ?? "",
        messageId: m.messageId,
        text,
        snippet: snippet(text),
      };
    } finally {
      lock.release();
    }
  }

  const parseId = (id: string) => {
    const [kind, uid] = id.split(":");
    if (!(kind === "inbox" || kind === "envoyes" || kind === "brouillons") || !/^\d+$/.test(uid ?? "")) throw new Error(`Identifiant de message invalide : ${id}`);
    return { kind, uid: Number(uid) } as const;
  };

  return {
    async search({ query, from, since, limit, folder }) {
      await connect();
      const lock = await client.getMailboxLock(await mailboxOf(folder));
      let uids: number[];
      try {
        const criteria: Record<string, unknown> = {};
        if (since) criteria.since = since;
        if (from) criteria.from = from;
        if (query) criteria.text = query;
        uids = ((await client.search(Object.keys(criteria).length ? criteria : { all: true }, { uid: true })) || []) as number[];
      } finally {
        lock.release();
      }
      const latest = uids.sort((a, b) => b - a).slice(0, limit);
      const out = [];
      for (const uid of latest) {
        const { id, date, from: f, subject, snippet: s } = await fetch(folder, uid);
        out.push({ id, date, from: f, subject, snippet: s });
      }
      return out;
    },
    async read(id) {
      const { kind, uid } = parseId(id);
      return fetch(kind, uid);
    },
    async draft(d: Draft) {
      const res = await client.append(await mailboxOf("brouillons"), await compose(cfg.from, d), ["\\Draft", "\\Seen"]);
      if (!res || !res.uid) throw new Error("Le serveur n'a pas accepté le brouillon.");
      return `brouillons:${res.uid}`;
    },
    async readDraft(id) {
      const { kind, uid } = parseId(id);
      if (kind !== "brouillons") throw new Error(`Ce n'est pas un brouillon : ${id}`);
      return fetch(kind, uid);
    },
    async send(id) {
      const { kind, uid } = parseId(id);
      if (kind !== "brouillons") throw new Error(`Ce n'est pas un brouillon : ${id}`);
      const drafts = await mailboxOf("brouillons");
      await connect();
      const lock = await client.getMailboxLock(drafts);
      let raw: Buffer;
      let recipients: string[];
      try {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) throw new Error(`Brouillon introuvable : ${id}`);
        raw = msg.source;
        const m = await simpleParser(raw);
        recipients = [...list(m.to), ...list(m.cc)].map(address);
      } finally {
        lock.release();
      }
      const info = await smtp.sendMail({ envelope: { from: cfg.from, to: recipients }, raw });
      const sent = await client.append(await mailboxOf("envoyes"), raw, ["\\Seen"]);
      const lock2 = await client.getMailboxLock(drafts);
      try {
        await client.messageDelete(String(uid), { uid: true });
      } finally {
        lock2.release();
      }
      return sent && sent.uid ? `envoyes:${sent.uid}` : info.messageId;
    },
    async known() {
      const set = new Set<string>();
      for (const folder of ["inbox", "envoyes"] as const)
        for (const m of await this.search({ folder, limit: 200 })) {
          set.add(address(m.from));
          if (folder === "envoyes") for (const a of (await this.read(m.id)).to) set.add(address(a));
        }
      return set;
    },
    async close() {
      if (ready) await client.logout().catch(() => {});
      smtp.close();
    },
  };
}

const list = (a: AddressObject | AddressObject[] | undefined) =>
  (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value.map((v) => (v.name ? `${v.name} <${v.address}>` : (v.address ?? ""))));
