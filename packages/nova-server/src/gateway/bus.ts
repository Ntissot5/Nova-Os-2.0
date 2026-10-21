// Le bus : nova-gateway parle à chaque connecteur en MCP et contrôle chaque appel.
// Un appel passe ici et seulement ici : droits (company.nix), journal, aperçu des actions sensibles.
// La décision d'autonomie est prise par le moteur (engine.ts) à partir de l'aperçu, jamais par l'agent.

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
  connector: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  right: string;
  sensitive: boolean;
  /** Connecteur ajouté depuis l'écran Connecteurs : nom de l'outil chez lui, et réglage de validation. */
  externe?: { nom: string; outil: string; toujoursValider: boolean };
}

/** Un serveur MCP distant ajouté par le dirigeant. Le jeton ne quitte jamais le gardien. */
export interface Distant {
  id: string;
  nom: string;
  url: string;
  jeton?: string;
  toujoursValider: boolean;
}

export interface Preview {
  summary: string;
  amountCHF?: number;
  recipients?: number;
  unknownRecipient?: boolean;
  /** Nom du connecteur ajouté dont l'action doit toujours être validée par un humain. */
  toujoursValider?: string;
}

/** Droits d'un appelant : connecteur → droits (« read », « send »…), comme dans company.nix. */
export type Rights = Partial<Record<string, string[]>>;

export class Forbidden extends Error {}

export class Bus {
  private clients = new Map<string, Client>();
  private catalog = new Map<string, ToolInfo>();

  constructor(
    private journal: Journal,
    private env: Record<string, string>,
    private dir = fileURLToPath(new URL("../connectors/", import.meta.url)),
  ) {}

  /** Variables propres à un connecteur, par-dessus l'environnement commun (ex. fournisseur Microsoft 365). */
  private overrides = new Map<ConnectorName, Record<string, string>>();

  /** Avant start() : réglages propres à un connecteur. */
  override(name: ConnectorName, env: Record<string, string>) {
    this.overrides.set(name, env);
  }

  async start(only: readonly ConnectorName[] = CONNECTORS) {
    await Promise.all(only.map((name) => this.startOne(name)));
  }

  /** Relance un connecteur intégré avec d'autres réglages (changer de fournisseur sans redémarrer Nova). */
  async restart(name: ConnectorName, env: Record<string, string> | undefined) {
    if (env) this.overrides.set(name, env);
    else this.overrides.delete(name);
    // Le nouveau connecteur démarre avant que l'ancien ne parte : un agent au travail ne voit jamais l'outil disparaître.
    const old = this.clients.get(name);
    const { client, tools } = await this.launch(name);
    for (const [tool, t] of this.catalog) if (t.connector === name) this.catalog.delete(tool);
    this.register(name, client, tools);
    await old?.close().catch(() => {});
  }

  private async startOne(name: ConnectorName) {
    const { client, tools } = await this.launch(name);
    this.register(name, client, tools);
  }

  private async launch(name: ConnectorName) {
    const client = new Client({ name: "nova-gateway", version: "0.1.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [join(this.dir, ENTRY[name])],
        env: { PATH: process.env.PATH ?? "", ...this.env, ...this.overrides.get(name) },
        stderr: "inherit",
      }),
    );
    const { tools } = await client.listTools();
    return { client, tools };
  }

  private register(name: ConnectorName, client: Client, tools: Awaited<ReturnType<Client["listTools"]>>["tools"]) {
    this.clients.set(name, client);
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
  }

  /**
   * Branche un serveur MCP distant. Ses outils ne connaissent pas les conventions Nova : un outil n'est
   * « lecture » que s'il se déclare en lecture seule (readOnlyHint) ; tout le reste est une action sensible,
   * qui passe par les règles d'autonomie. Les noms sont préfixés pour ne jamais masquer un outil existant.
   */
  async addRemote(d: Distant): Promise<ToolInfo[]> {
    if ((CONNECTORS as readonly string[]).includes(d.id) || this.clients.has(d.id)) throw new Forbidden(`Le connecteur ${d.id} existe déjà.`);
    const client = new Client({ name: "nova-gateway", version: "0.1.0" });
    const headers: Record<string, string> = d.jeton ? { authorization: `Bearer ${d.jeton}` } : {};
    await client.connect(new StreamableHTTPClientTransport(new URL(d.url), { requestInit: { headers } }));
    let tools;
    try {
      ({ tools } = await client.listTools());
    } catch (e) {
      await client.close();
      throw e;
    }
    this.clients.set(d.id, client);
    const added = tools.map((t) => {
      const lecture = t.annotations?.readOnlyHint === true;
      const info: ToolInfo = {
        name: `${d.id}__${t.name}`.replace(/[^\w-]/g, "_").slice(0, 64),
        connector: d.id,
        title: t.title ?? t.annotations?.title ?? t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema as Record<string, unknown>,
        right: lecture ? "read" : "write",
        sensitive: !lecture,
        externe: { nom: d.nom, outil: t.name, toujoursValider: d.toujoursValider },
      };
      this.catalog.set(info.name, info);
      return info;
    });
    return added;
  }

  async removeRemote(id: string) {
    const client = this.clients.get(id);
    if (!client || (CONNECTORS as readonly string[]).includes(id)) return;
    for (const [name, t] of this.catalog) if (t.connector === id) this.catalog.delete(name);
    this.clients.delete(id);
    await client.close().catch(() => {});
  }

  /** Les connecteurs branchés, avec leur nombre d'outils. */
  connectors() {
    const n = new Map<string, number>();
    for (const t of this.catalog.values()) n.set(t.connector, (n.get(t.connector) ?? 0) + 1);
    return [...this.clients.keys()].map((id) => ({ id, outils: n.get(id) ?? 0 }));
  }

  /** Chaque source branchée et les droits que ses outils demandent (« read », « send »…), pour l'Atelier. */
  droitsDisponibles() {
    const d = new Map<string, Set<string>>();
    for (const t of this.catalog.values()) (d.get(t.connector) ?? d.set(t.connector, new Set()).get(t.connector)!).add(t.right);
    return [...d].map(([id, s]) => ({ id, droits: [...s].sort() }));
  }

  /** Lecture sur toutes les sources branchées : ce qu'a une personne qui pose une question. */
  readAll(): Rights {
    return Object.fromEntries([...this.clients.keys()].map((c) => [c, ["read"]]));
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
    // Un connecteur ajouté ne sait pas faire d'aperçu : on montre l'outil et ses paramètres, tels quels.
    if (t.externe) return { summary: `${t.externe.nom} : ${t.title} ${apercu(args)}`.trim(), toujoursValider: t.externe.toujoursValider ? t.externe.nom : undefined };
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
    const client = this.clients.get(t.connector);
    if (!client) throw new Forbidden(`Le connecteur ${t.connector} n'est plus branché.`);
    const res = await client.callTool({ name: t.externe?.outil ?? t.name, arguments: args });
    const content = (res.content ?? []) as { type: string; text?: string }[];
    if (res.isError) throw new Error(content[0]?.text ?? "Erreur du connecteur.");
    if (res.structuredContent) return res.structuredContent as Record<string, unknown>;
    // Les serveurs tiers répondent souvent en texte seul.
    return { texte: content.filter((c) => c.type === "text").map((c) => c.text).join("\n").slice(0, 20_000) };
  }
}

function apercu(args: Record<string, unknown>) {
  const s = Object.entries(args)
    .map(([k, v]) => `${k} = ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ");
  return s ? `(${s.length > 240 ? `${s.slice(0, 240)}…` : s})` : "";
}

/** Droits de lecture sur toutes les sources : ce qu'a une personne qui pose une question (Phase 1). */
export const READ_ALL: Rights = Object.fromEntries(CONNECTORS.map((c) => [c, ["read"]]));
