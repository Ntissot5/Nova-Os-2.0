// Connexion à Microsoft 365, depuis l'écran Connecteurs, sans mot de passe dans Nova.
// Connexion « par code » (OAuth device code) : le dirigeant ouvre microsoft.com/devicelogin, tape le code
// affiché par Nova et accepte. Le Hub n'a besoin d'aucune adresse de retour : il marche derrière n'importe
// quel pare-feu, sans nom de domaine. Le jeton va dans le dossier des secrets (0600), jamais dans data/.
// Une fois connecté, les connecteurs Mail et Agenda passent sur Outlook : les agents ne voient aucune différence.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Journal } from "../core/journal.js";
import { ecrireJeton, GRAPH, LOGIN, SCOPES, versJeton } from "../connectors/microsoft.js";
import type { Bus } from "./bus.js";

export type EtatMicrosoft =
  | { etat: "indisponible"; raison: string }
  | { etat: "deconnecte" }
  | { etat: "en-attente"; code: string; adresse: string; expire: string }
  | { etat: "connecte"; compte: string; nom?: string; depuis: string; services: string[] }
  | { etat: "erreur"; erreur: string };

interface Connexion {
  compte: string;
  nom?: string;
  depuis: string;
  par: string;
}

const SERVICES = ["Mail", "Agenda"];

export class Microsoft365 {
  private attente?: { code: string; adresse: string; expire: string; stop: () => void };
  private erreur?: string;

  constructor(
    private bus: Bus,
    private journal: Journal,
    private data: string,
    private secrets: string,
    private clientId: string | undefined,
    /** « organizations » : comptes d'entreprise ; « common » : aussi les comptes personnels (Outlook.com). */
    private tenant = "organizations",
    /** En démonstration, des scénarios écrits d'avance envoient des mails : jamais depuis une vraie boîte. */
    private demo = false,
    private wait = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private jeton() {
    return join(this.secrets, "microsoft.json");
  }
  private fiche() {
    return join(this.data, "connecteurs", "microsoft.json");
  }
  private connexion(): Connexion | undefined {
    return existsSync(this.fiche()) && existsSync(this.jeton()) ? (JSON.parse(readFileSync(this.fiche(), "utf8")) as Connexion) : undefined;
  }
  private env() {
    return { NOVA_MICROSOFT_TOKEN: this.jeton(), NOVA_MICROSOFT_LOGIN: LOGIN(), NOVA_MICROSOFT_GRAPH: GRAPH() };
  }

  /** Avant le démarrage du bus : si l'entreprise est connectée, Mail et Agenda partent directement sur Outlook. */
  configurer() {
    if (this.demo || !this.connexion()) return;
    this.bus.override("mail", { ...this.env(), NOVA_MAIL_BACKEND: "microsoft" });
    this.bus.override("agenda", { ...this.env(), NOVA_AGENDA_BACKEND: "microsoft" });
  }

  etat(): EtatMicrosoft {
    if (!this.clientId) return { etat: "indisponible", raison: "Nova n'a pas encore d'identifiant d'application Microsoft (option nova.connectors.microsoft.clientId)." };
    if (this.demo)
      return { etat: "indisponible", raison: "Nova tourne en démonstration : ses scénarios enverraient de vrais mails depuis ta boîte. Désactive la démonstration pour connecter Microsoft 365." };
    const c = this.connexion();
    if (c) return { etat: "connecte", compte: c.compte, nom: c.nom, depuis: c.depuis, services: SERVICES };
    if (this.attente) return { etat: "en-attente", code: this.attente.code, adresse: this.attente.adresse, expire: this.attente.expire };
    if (this.erreur) return { etat: "erreur", erreur: this.erreur };
    return { etat: "deconnecte" };
  }

  /** Demande un code à Microsoft, puis attend en arrière-plan que le dirigeant l'accepte. */
  async connecter(who: string): Promise<EtatMicrosoft> {
    if (!this.clientId || this.demo) return this.etat();
    this.attente?.stop();
    this.erreur = undefined;
    const res = await fetch(`${LOGIN()}/${this.tenant}/oauth2/v2.0/devicecode`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.clientId, scope: SCOPES }),
    });
    if (!res.ok) throw new Error("Microsoft ne répond pas. Vérifie la connexion internet du Hub.");
    const d = (await res.json()) as { device_code: string; user_code: string; verification_uri: string; expires_in: number; interval?: number };
    let actif = true;
    const fin = Date.now() + d.expires_in * 1000;
    this.attente = { code: d.user_code, adresse: d.verification_uri, expire: new Date(fin).toISOString(), stop: () => (actif = false) };
    void this.attendre(d.device_code, (d.interval ?? 5) * 1000, fin, () => actif, who);
    return this.etat();
  }

  private async attendre(deviceCode: string, interval: number, fin: number, actif: () => boolean, who: string) {
    const clientId = this.clientId!;
    try {
      while (actif() && Date.now() < fin) {
        await this.wait(interval);
        if (!actif()) return;
        const res = await fetch(`${LOGIN()}/${this.tenant}/oauth2/v2.0/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: clientId, device_code: deviceCode }),
        });
        const r = (await res.json()) as { error?: string; access_token: string; refresh_token?: string; expires_in: number; scope?: string };
        if (r.error === "authorization_pending") continue;
        if (r.error === "slow_down") {
          interval += 5000;
          continue;
        }
        if (r.error) throw new Error(r.error === "authorization_declined" ? "La connexion a été refusée sur la page Microsoft." : r.error === "expired_token" ? "Le code a expiré. Recommence." : `Microsoft a refusé la connexion (${r.error}).`);
        await this.terminer(versJeton(r, { client_id: clientId, tenant: this.tenant, refresh_token: r.refresh_token ?? "" }), who);
        return;
      }
      if (actif()) throw new Error("Le code a expiré. Recommence.");
    } catch (e) {
      this.erreur = e instanceof Error ? e.message : String(e);
    } finally {
      if (actif()) this.attente = undefined;
    }
  }

  private async terminer(jeton: Parameters<typeof ecrireJeton>[1], who: string) {
    const me = (await (await fetch(`${GRAPH()}/me?$select=displayName,mail,userPrincipalName`, { headers: { authorization: `Bearer ${jeton.access_token}` } })).json()) as {
      displayName?: string;
      mail?: string;
      userPrincipalName?: string;
    };
    mkdirSync(this.secrets, { recursive: true, mode: 0o700 });
    ecrireJeton(this.jeton(), jeton);
    await this.bus.restart("mail", { ...this.env(), NOVA_MAIL_BACKEND: "microsoft" });
    await this.bus.restart("agenda", { ...this.env(), NOVA_AGENDA_BACKEND: "microsoft" });
    // « Connecté » seulement une fois les connecteurs passés sur Outlook.
    mkdirSync(join(this.data, "connecteurs"), { recursive: true });
    const c: Connexion = { compte: me.mail ?? me.userPrincipalName ?? "", nom: me.displayName, depuis: new Date().toISOString(), par: who };
    writeFileSync(this.fiche(), JSON.stringify(c, null, 2) + "\n");
    this.journal.write({ qui: who, quoi: "microsoft.connecter", pourquoi: `${c.compte} : ${SERVICES.join(", ")}` });
  }

  /** Revenir aux fournisseurs d'origine. Le jeton est effacé du Hub. */
  async deconnecter(who: string) {
    this.attente?.stop();
    this.attente = undefined;
    this.erreur = undefined;
    rmSync(this.jeton(), { force: true });
    rmSync(this.fiche(), { force: true });
    await this.bus.restart("mail", undefined);
    await this.bus.restart("agenda", undefined);
    this.journal.write({ qui: who, quoi: "microsoft.deconnecter" });
  }
}
