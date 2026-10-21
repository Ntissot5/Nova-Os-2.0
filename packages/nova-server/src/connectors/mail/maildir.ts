// Fournisseur Maildir : la boîte de l'entreprise en fichiers .eml standard, dans data/mail/.
//   data/mail/{cur,new}/        réception
//   data/mail/.Brouillons/cur/  brouillons préparés par les agents
//   data/mail/.Envoyes/cur/     messages envoyés
// Sert à la démonstration et aux tests ; « envoyer » range le message dans .Envoyes.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { simpleParser, type AddressObject } from "mailparser";
import { compose } from "./compose.js";
import { address, snippet, type Draft, type MailBackend, type MailMessage, type MailSummary } from "./backend.js";

const FOLDERS = { inbox: "", envoyes: ".Envoyes", brouillons: ".Brouillons" } as const;
type Folder = keyof typeof FOLDERS;

export function maildir(root: string, from: string): MailBackend {
  const dir = (f: Folder) => join(root, FOLDERS[f]);
  for (const f of Object.keys(FOLDERS) as Folder[]) for (const sub of ["cur", "new", "tmp"]) mkdirSync(join(dir(f), sub), { recursive: true });

  const files = (f: Folder) =>
    ["new", "cur"].flatMap((sub) =>
      readdirSync(join(dir(f), sub))
        .filter((n) => !n.startsWith("."))
        .map((n) => ({ id: `${f}:${n.split(":")[0]}`, path: join(dir(f), sub, n) })),
    );

  const locate = (id: string) => {
    const [f, base] = id.split(":") as [Folder, string];
    if (!(f in FOLDERS) || !base || base.includes("/")) throw new Error(`Identifiant de message invalide : ${id}`);
    const hit = files(f).find((x) => x.id === id);
    if (!hit) throw new Error(`Message introuvable : ${id}`);
    return hit;
  };

  const parse = async (id: string, path: string): Promise<MailMessage> => {
    const m = await simpleParser(readFileSync(path));
    const text = m.text ?? "";
    return {
      id,
      date: (m.date ?? statSync(path).mtime).toISOString(),
      from: m.from?.text ?? "",
      to: list(m.to),
      cc: list(m.cc),
      subject: m.subject ?? "",
      messageId: m.messageId,
      text,
      snippet: snippet(text),
    };
  };

  const summaries = async (f: Folder) => Promise.all(files(f).map((x) => parse(x.id, x.path)));

  return {
    async search({ query, from: sender, since, limit, folder }) {
      const q = query?.toLowerCase();
      const all = await summaries(folder);
      return all
        .filter((m) => !since || new Date(m.date) >= since)
        .filter((m) => !sender || m.from.toLowerCase().includes(sender.toLowerCase()))
        .filter((m) => !q || `${m.subject}\n${m.from}\n${m.text}`.toLowerCase().includes(q))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit)
        .map(({ id, date, from, subject, snippet }): MailSummary => ({ id, date, from, subject, snippet }));
    },
    async read(id) {
      const x = locate(id);
      return parse(x.id, x.path);
    },
    async draft(d: Draft) {
      const base = `${Date.now()}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.nova`;
      writeFileSync(join(dir("brouillons"), "cur", `${base}:2,D`), await compose(from, d));
      return `brouillons:${base}`;
    },
    async readDraft(id) {
      if (!id.startsWith("brouillons:")) throw new Error(`Ce n'est pas un brouillon : ${id}`);
      const x = locate(id);
      return parse(x.id, x.path);
    },
    async send(id) {
      if (!id.startsWith("brouillons:")) throw new Error(`Ce n'est pas un brouillon : ${id}`);
      const x = locate(id);
      const base = id.split(":")[1]!;
      const dest = join(dir("envoyes"), "cur", `${base}:2,S`);
      if (existsSync(dest)) throw new Error("Déjà envoyé.");
      renameSync(x.path, dest);
      return `envoyes:${base}`;
    },
    async known() {
      const set = new Set<string>();
      for (const m of await summaries("inbox")) set.add(address(m.from));
      for (const m of await summaries("envoyes")) for (const a of [...m.to, ...m.cc]) set.add(address(a));
      return set;
    },
    async close() {},
  };
}

const list = (a: AddressObject | AddressObject[] | undefined) =>
  (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value.map((v) => (v.name ? `${v.name} <${v.address}>` : (v.address ?? ""))));
