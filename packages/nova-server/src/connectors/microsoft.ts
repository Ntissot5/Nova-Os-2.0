// Accès à Microsoft 365 (Microsoft Graph) pour les connecteurs Mail et Agenda.
// Le gardien obtient le jeton par la connexion « par code » (écran Connecteurs) et l'écrit dans le
// dossier des secrets du Hub ; les connecteurs le lisent ici et le renouvellent eux-mêmes à expiration.
//   NOVA_MICROSOFT_TOKEN   fichier du jeton (dans le dossier des secrets, droits 0600)
//   NOVA_MICROSOFT_LOGIN   https://login.microsoftonline.com (remplacé en test)
//   NOVA_MICROSOFT_GRAPH   https://graph.microsoft.com/v1.0 (remplacé en test)

import { readFileSync, renameSync, writeFileSync } from "node:fs";

export interface Jeton {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms
  client_id: string;
  tenant: string;
  scope: string;
}

export const LOGIN = () => process.env.NOVA_MICROSOFT_LOGIN ?? "https://login.microsoftonline.com";
export const GRAPH = () => process.env.NOVA_MICROSOFT_GRAPH ?? "https://graph.microsoft.com/v1.0";

/** Les autorisations demandées à Microsoft : lire et écrire les mails, envoyer, gérer l'agenda. Rien d'autre. */
export const SCOPES = "offline_access User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite";

export function lireJeton(file: string): Jeton {
  return JSON.parse(readFileSync(file, "utf8")) as Jeton;
}

export function ecrireJeton(file: string, j: Jeton) {
  writeFileSync(`${file}.tmp`, JSON.stringify(j), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}

/** Réponse du point de jeton de Microsoft → jeton Nova. */
export function versJeton(r: { access_token: string; refresh_token?: string; expires_in: number; scope?: string }, base: Pick<Jeton, "client_id" | "tenant" | "refresh_token">): Jeton {
  return {
    access_token: r.access_token,
    refresh_token: r.refresh_token ?? base.refresh_token,
    expires_at: Date.now() + r.expires_in * 1000,
    client_id: base.client_id,
    tenant: base.tenant,
    scope: r.scope ?? SCOPES,
  };
}

async function renouveler(file: string, j: Jeton): Promise<Jeton> {
  const res = await fetch(`${LOGIN()}/${j.tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: j.client_id, grant_type: "refresh_token", refresh_token: j.refresh_token, scope: SCOPES }),
  });
  if (!res.ok) throw new Error("La connexion à Microsoft 365 a expiré. Reconnecte-la depuis l'écran Connecteurs.");
  const neuf = versJeton(await res.json(), j);
  ecrireJeton(file, neuf);
  return neuf;
}

/** Un client Graph minimal : jeton renouvelé à la volée, erreurs en phrases. */
export function graph(file = process.env.NOVA_MICROSOFT_TOKEN) {
  if (!file) throw new Error("Microsoft 365 n'est pas connecté.");
  return async function call<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
    let j = lireJeton(file);
    if (Date.now() > j.expires_at - 60_000) j = await renouveler(file, j);
    const headers: Record<string, string> = { authorization: `Bearer ${j.access_token}`, prefer: 'outlook.body-content-type="text", outlook.timezone="UTC"' };
    if (init.json !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(path.startsWith("http") ? path : `${GRAPH()}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string>) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
    if (res.status === 401) throw new Error("Microsoft 365 refuse l'accès. Reconnecte-le depuis l'écran Connecteurs.");
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`Microsoft 365 : ${e.error?.message ?? `erreur ${res.status}`}`);
    }
    return (res.status === 202 || res.status === 204 ? {} : await res.json()) as T;
  };
}

/** Une date Graph sans fuseau (« 2026-10-21T09:00:00.0000000 », en UTC grâce à l'en-tête) → ISO. */
export const isoUtc = (s: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`).toISOString();
