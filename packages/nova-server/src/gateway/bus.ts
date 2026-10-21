// Le bus : nova-gateway parle à chaque connecteur en MCP et contrôle chaque appel.
// Un appel passe ici et seulement ici : droits (company.nix), journal, aperçu des actions sensibles.
// La décision d'autonomie est prise par le moteur (engine.ts) à partir de l'aperçu, jamais par l'agent.

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Journal } from "../core/journal.js";

export const CONNECTORS = ["fichiers", "mail", "agenda", "compta", "telephone"] as const;
export type ConnectorName = (typeof CONNECTORS)[number];

const ENTRY: Record<ConnectorName, string> = {
  fichiers: "fichiers.js",
  mail: "mail/index.js",
  agenda: "agenda.js",
  compta: "compta.js",
  telephone: "telephone.js",
};

export interface ToolInfo {
  name: string;
  connector: ConnectorName;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  right: string;
  sensitive: boolean;
}

export interface Preview {
  summary: string;
  amountCHF?: number;
  recipients?: number;
  unknownRecipient?: boolean;
}

/** Droits d'un appelant : connecteur → droits (« read », « send »…), comme dans company.nix. */
export type Rights = Partial<Record<string, string[]>>;

export class Forbidden extends Error {}

export class Bus {
  private clients = new Map<ConnectorName, Client>();
  private catalog = new Map<string, ToolInfo>();

  constructor(
    private journal: Journal,
    private env: Record<string, string>,
    private dir = fileURLToPath(new URL("../connectors/", import.meta.url)),
  ) {}

  async start(only: readonly ConnectorName[] = CONNECTORS) {
    await Promise.all(
      only.map(async (name) => {
        const client = new Client({ name: "nova-gateway", version: "0.1.0" });
        await client.connect(
          new StdioClientTransport({
            command: process.execPath,
            args: [join(this.dir, ENTRY[name])],
            env: { PATH: process.env.PATH ?? "", ...this.env },
            stderr: "inherit",
          }),
        );
        this.clients.set(name, client);
        const { tools } = await client.listTools();
        for (const t of tools)
          this.catalog.set(t.name, {
            name: t.name,
            connector: name,
            title: t.title ?? t.name,
            description: t.description ?? "",
            inputSchema: t.inputSchema as Record<string, unknown>,
            right: String(t._meta?.["nova/right"] ?? "read"),
            sensitive: Boolean(t._meta?.["nova/sensitive"]),
          });
      }),
    );
  }

  async stop() {
    await Promise.all([...this.clients.values()].map((c) => c.close()));
  }

  /** Outils accessibles avec ces droits, dans un ordre stable (le cache de prompts en dépend). */
  tools(rights: Rights, opts: { readOnly?: boolean } = {}): ToolInfo[] {
    return [...this.catalog.values()]
      .filter((t) => this.allowed(rights, t) && (!opts.readOnly || t.right === "read"))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  info(tool: string) {
    const t = this.catalog.get(tool);
    if (!t) throw new Forbidden(`Outil inconnu : ${tool}`);
    return t;
  }

  allowed(rights: Rights, t: ToolInfo) {
    return rights[t.connector]?.includes(t.right) ?? false;
  }

  /** Aperçu d'une action sensible : ce qu'elle ferait, sans rien faire. */
  async preview(caller: string, rights: Rights, tool: string, args: Record<string, unknown>): Promise<Preview> {
    const t = this.check(caller, rights, tool);
    if (!t.sensitive) return { summary: t.title };
    return (await this.raw(t, { ...args, dryRun: true })) as unknown as Preview;
  }

  /**
   * Exécute un appel. Un outil sensible n'est exécuté que par le moteur, après la décision d'autonomie :
   * `decided` en est la preuve, un agent ne peut pas la fournir lui-même.
   */
  async call(caller: string, rights: Rights, tool: string, args: Record<string, unknown>, why: string, decided = false) {
    const t = this.check(caller, rights, tool);
    if (t.sensitive && !decided) throw new Forbidden(`${tool} est une action sensible : elle passe par les règles d'autonomie.`);
    const started = Date.now();
    try {
      const out = await this.raw(t, args);
      this.journal.write({ qui: caller, quoi: tool, pourquoi: why, resultat: "ok", ms: Date.now() - started });
      return out;
    } catch (e) {
      this.journal.write({ qui: caller, quoi: tool, pourquoi: why, resultat: "erreur", erreur: String(e instanceof Error ? e.message : e) });
      throw e;
    }
  }

  private check(caller: string, rights: Rights, tool: string) {
    const t = this.info(tool);
    if (!this.allowed(rights, t)) {
      this.journal.write({ qui: caller, quoi: tool, resultat: "refuse", pourquoi: `droit « ${t.right} » sur ${t.connector} absent` });
      throw new Forbidden(`${caller} n'a pas le droit « ${t.right} » sur ${t.connector}.`);
    }
    return t;
  }

  private async raw(t: ToolInfo, args: Record<string, unknown>) {
    const client = this.clients.get(t.connector)!;
    const res = await client.callTool({ name: t.name, arguments: args });
    if (res.isError) throw new Error((res.content as { text?: string }[])[0]?.text ?? "Erreur du connecteur.");
    return (res.structuredContent ?? {}) as Record<string, unknown>;
  }
}

/** Droits de lecture sur toutes les sources : ce qu'a une personne qui pose une question (Phase 1). */
export const READ_ALL: Rights = Object.fromEntries(CONNECTORS.map((c) => [c, ["read"]]));
