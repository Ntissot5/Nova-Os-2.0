// Ce qu'un fournisseur de mail doit savoir faire pour Nova. Deux implémentations :
// Maildir (format ouvert, dans data/mail/) et IMAP/SMTP (la boîte réelle de l'entreprise).

export interface MailSummary {
  id: string;
  date: string;
  from: string;
  subject: string;
  snippet: string;
}

export interface MailMessage extends MailSummary {
  to: string[];
  cc: string[];
  messageId?: string;
  text: string;
}

export interface Draft {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  inReplyTo?: string;
}

export interface MailBackend {
  search(q: { query?: string; from?: string; since?: Date; limit: number; folder: "inbox" | "envoyes" }): Promise<MailSummary[]>;
  read(id: string): Promise<MailMessage>;
  draft(d: Draft): Promise<string>;
  readDraft(id: string): Promise<MailMessage>;
  send(id: string): Promise<string>;
  /** Adresses déjà en contact avec l'entreprise (reçues ou écrites) : un destinataire hors de cette liste est « inconnu ». */
  known(): Promise<Set<string>>;
  close(): Promise<void>;
}

export const snippet = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 160);
export const address = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();
