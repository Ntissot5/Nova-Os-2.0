// Microsoft 365 de bout en bout, contre un faux Microsoft (connexion par code + Graph) :
// connecter, lire et répondre dans Outlook, l'agenda, le renouvellement du jeton, la déconnexion.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { cpSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Bus } from "./bus.js";
import { Microsoft365 } from "./microsoft.js";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const journal: Record<string, unknown>[] = [];
let http: Server;
let dir: string;
let bus: Bus;
let ms: Microsoft365;

// ---------- Le faux Microsoft ----------

interface Msg {
  id: string;
  folder: "inbox" | "sentitems" | "drafts";
  receivedDateTime: string;
  subject: string;
  body: string;
  from?: string;
  to: string[];
  internetMessageId: string;
  conversation?: string;
}
const boite: Msg[] = [
  { id: "m1", folder: "inbox", receivedDateTime: "2026-10-21T07:12:00.0000000", subject: "Fuite sous l'évier", body: "Bonjour, j'ai une fuite. Mme Rossi", from: "rossi@exemple.ch", to: ["regie@demo.ch"], internetMessageId: "<a1@exemple.ch>" },
  { id: "m2", folder: "inbox", receivedDateTime: "2026-10-20T15:00:00.0000000", subject: "Place de parc", body: "Une place est-elle libre ? M. Keller", from: "keller@exemple.ch", to: ["regie@demo.ch"], internetMessageId: "<a2@exemple.ch>" },
];
const agenda: { id: string; subject: string; start: string; end: string; lieu?: string }[] = [{ id: "e1", subject: "État des lieux, Rue du Lac 14", start: "2026-10-22T08:00:00.0000000", end: "2026-10-22T09:00:00.0000000", lieu: "Rue du Lac 14" }];
let tokenCalls = 0;
let accepted = "";
const valides = new Set<string>();
const addr = (a: string) => ({ emailAddress: { address: a } });
const vue = (m: Msg) => ({
  id: m.id,
  receivedDateTime: m.receivedDateTime,
  subject: m.subject,
  bodyPreview: m.body.slice(0, 100),
  body: { content: m.body },
  from: m.from ? addr(m.from) : undefined,
  toRecipients: m.to.map(addr),
  ccRecipients: [],
  internetMessageId: m.internetMessageId,
  isDraft: m.folder === "drafts",
});

function fauxMicrosoft(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, body: string) {
  const url = new URL(req.url!, "http://x");
  const json = (status: number, v: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(v));
  const form = new URLSearchParams(body);

  if (url.pathname === "/organizations/oauth2/v2.0/devicecode") {
    assert.match(form.get("scope")!, /Mail\.Send/);
    return json(200, { device_code: "dc-1", user_code: "NOVA-1234", verification_uri: "https://microsoft.com/devicelogin", expires_in: 900, interval: 1 });
  }
  if (url.pathname === "/organizations/oauth2/v2.0/token") {
    if (form.get("grant_type") === "refresh_token") {
      assert.equal(form.get("refresh_token"), "rt-1");
      valides.add("at-2");
      return json(200, { access_token: "at-2", refresh_token: "rt-2", expires_in: 3600 });
    }
    // Le dirigeant tape le code au deuxième passage.
    if (++tokenCalls < 2) return json(400, { error: "authorization_pending" });
    accepted = form.get("device_code")!;
    valides.add("at-1");
    return json(200, { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 });
  }

  const bearer = (req.headers.authorization ?? "").replace("Bearer ", "");
  if (!valides.has(bearer)) return json(401, { error: { message: "InvalidAuthenticationToken" } });
  const p = url.pathname.replace(/^\/v1\.0/, "");
  let m: RegExpMatchArray | null;

  if (p === "/me") return json(200, { displayName: "Régie Démo SA", mail: "regie@demo.ch" });
  if ((m = p.match(/^\/me\/mailFolders\/(inbox|sentitems)\/messages$/))) {
    const since = url.searchParams.get("$filter")?.match(/ge (.+)$/)?.[1];
    const list = boite.filter((x) => x.folder === m![1] && (!since || new Date(`${x.receivedDateTime}Z`) >= new Date(since)));
    return json(200, { value: list.sort((a, b) => b.receivedDateTime.localeCompare(a.receivedDateTime)).map(vue) });
  }
  if (p === "/me/messages" && req.method === "GET") {
    const id = url.searchParams.get("$filter")!.match(/'(.+)'/)![1];
    return json(200, { value: boite.filter((x) => x.internetMessageId === id).map(vue) });
  }
  if (p === "/me/messages" && req.method === "POST") {
    const d = JSON.parse(body);
    const msg: Msg = { id: `d${boite.length}`, folder: "drafts", receivedDateTime: "2026-10-21T09:00:00.0000000", subject: d.subject, body: d.body.content, to: d.toRecipients.map((r: any) => r.emailAddress.address), internetMessageId: `<n${boite.length}@demo.ch>` };
    boite.push(msg);
    return json(201, vue(msg));
  }
  if ((m = p.match(/^\/me\/messages\/([^/]+)\/createReply$/))) {
    const orig = boite.find((x) => x.id === m![1])!;
    const msg: Msg = { id: `r${boite.length}`, folder: "drafts", receivedDateTime: "2026-10-21T09:00:00.0000000", subject: `RE: ${orig.subject}`, body: "", to: [orig.from!], internetMessageId: `<n${boite.length}@demo.ch>`, conversation: orig.id };
    boite.push(msg);
    return json(201, vue(msg));
  }
  if ((m = p.match(/^\/me\/messages\/([^/]+)\/send$/))) {
    boite.find((x) => x.id === m![1])!.folder = "sentitems";
    return void res.writeHead(202).end();
  }
  if ((m = p.match(/^\/me\/messages\/([^/]+)$/))) {
    const msg = boite.find((x) => x.id === decodeURIComponent(m![1]!));
    if (!msg) return json(404, { error: { message: "Not found" } });
    if (req.method === "PATCH") {
      const d = JSON.parse(body);
      Object.assign(msg, { subject: d.subject, body: d.body.content, to: d.toRecipients.map((r: any) => r.emailAddress.address) });
    }
    return json(200, vue(msg));
  }
  if (p === "/me/calendarView") return json(200, { value: agenda.map((e) => ({ id: e.id, subject: e.subject, start: { dateTime: e.start }, end: { dateTime: e.end }, location: { displayName: e.lieu } })) });
  if (p === "/me/events") {
    const d = JSON.parse(body);
    assert.equal(d.start.timeZone, "UTC");
    agenda.push({ id: `e${agenda.length + 1}`, subject: d.subject, start: d.start.dateTime, end: d.end.dateTime });
    return json(201, { id: `e${agenda.length}` });
  }
  json(404, { error: { message: `inconnu : ${p}` } });
}

before(async () => {
  http = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => fauxMicrosoft(req, res, body));
  });
  await new Promise<void>((ok) => http.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  process.env.NOVA_MICROSOFT_LOGIN = base;
  process.env.NOVA_MICROSOFT_GRAPH = `${base}/v1.0`;

  dir = mkdtempSync(join(tmpdir(), "nova-microsoft-"));
  cpSync(join(root, "companies/demo/data"), join(dir, "data"), { recursive: true });
  bus = new Bus({ write: (e) => void journal.push(e) }, { NOVA_DATA: join(dir, "data"), NOVA_MAIL_FROM: "regie@demo.ch" });
  ms = new Microsoft365(bus, { write: (e) => void journal.push(e) }, join(dir, "data"), join(dir, "secrets"), "client-nova", "organizations", false, () => new Promise((r) => setTimeout(r, 5)));
  ms.configurer();
  await bus.start(["mail", "agenda"]);
});
after(async () => {
  await bus.stop();
  http.close();
});

const R = { mail: ["read", "draft", "send"], agenda: ["read", "write"] };
const until = async (fn: () => boolean) => {
  for (let i = 0; i < 400 && !fn(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(fn());
};

test("sans identifiant d'application, Nova le dit au lieu d'échouer", () => {
  const sans = new Microsoft365(bus, { write: () => {} }, join(dir, "data"), join(dir, "secrets"), undefined);
  assert.equal(sans.etat().etat, "indisponible");
});

test("en démonstration, pas de vraie boîte : ses scénarios enverraient de vrais mails", async () => {
  const demo = new Microsoft365(bus, { write: () => {} }, join(dir, "data"), join(dir, "secrets"), "client-nova", "organizations", true);
  assert.match((demo.etat() as { raison: string }).raison, /démonstration/);
  assert.equal((await demo.connecter("humain:noa")).etat, "indisponible");
  assert.equal(tokenCalls, 0);
});

test("avant la connexion, Mail lit encore la boîte de démonstration", async () => {
  const r = (await bus.call("t", R, "mail_chercher", { texte: "fuite" }, "test")) as { items: { from: string }[] };
  assert.ok(r.items.length > 0);
  assert.ok(!r.items.some((m) => m.from.includes("rossi@exemple.ch")));
});

test("connexion par code : un code à taper, puis Outlook branché", async () => {
  const e = await ms.connecter("humain:noa");
  assert.deepEqual(e, { etat: "en-attente", code: "NOVA-1234", adresse: "https://microsoft.com/devicelogin", expire: (e as { expire: string }).expire });
  await until(() => ms.etat().etat === "connecte");
  assert.equal(accepted, "dc-1");
  const c = ms.etat() as { compte: string; services: string[] };
  assert.equal(c.compte, "regie@demo.ch");
  assert.deepEqual(c.services, ["Mail", "Agenda"]);
  // Le jeton reste dans les secrets ; data/ ne garde que le nom du compte.
  assert.equal(statSync(join(dir, "secrets/microsoft.json")).mode & 0o777, 0o600);
  const fiche = readFileSync(join(dir, "data/connecteurs/microsoft.json"), "utf8");
  assert.ok(!fiche.includes("at-1") && !fiche.includes("rt-1"));
  assert.ok(journal.some((l) => l.quoi === "microsoft.connecter"));
});

test("Mail sur Outlook : chercher, lire, répondre dans la conversation, envoyer", async () => {
  const r = (await bus.call("t", R, "mail_chercher", { depuis: "2026-10-21" }, "test")) as { items: { id: string; from: string; subject: string; date: string }[] };
  assert.deepEqual(r.items.map((m) => m.subject), ["Fuite sous l'évier"]);
  assert.equal(r.items[0]!.date, "2026-10-21T07:12:00.000Z");
  const lu = (await bus.call("t", R, "mail_lire", { id: "m1" }, "test")) as { text: string; messageId: string };
  assert.match(lu.text, /fuite/);

  const b = (await bus.call("t", R, "mail_brouillon", { a: ["rossi@exemple.ch"], sujet: "RE: Fuite", texte: "Le concierge passe ce matin.", enReponseA: lu.messageId }, "test")) as { id: string };
  assert.equal(boite.find((x) => x.id === b.id)?.conversation, "m1");
  const p = await bus.preview("t", R, "mail_envoyer", { id: b.id });
  assert.match(p.summary, /Envoyer « RE: Fuite » à rossi@exemple\.ch/);
  assert.equal(p.unknownRecipient, false);
  await bus.call("t", R, "mail_envoyer", { id: b.id }, "validé", true);
  assert.equal(boite.find((x) => x.id === b.id)?.folder, "sentitems");
  await assert.rejects(bus.call("t", R, "mail_envoyer", { id: b.id }, "deux fois", true), /déjà été envoyé/);
});

test("Agenda sur Outlook : voir et créer, en UTC", async () => {
  const r = (await bus.call("t", R, "agenda_evenements", { du: "2026-10-22", au: "2026-10-22" }, "test")) as { items: { titre: string; debut: string }[] };
  assert.deepEqual(r.items.map((e) => [e.titre, e.debut]), [["État des lieux, Rue du Lac 14", "2026-10-22T08:00:00.000Z"]]);
  await bus.call("t", R, "agenda_creer", { titre: "Visite", debut: "2026-10-23T10:00:00+02:00", fin: "2026-10-23T11:00:00+02:00" }, "test");
  assert.equal(agenda.at(-1)!.start, "2026-10-23T08:00:00.000");
});

test("un jeton expiré se renouvelle tout seul", async () => {
  const f = join(dir, "secrets/microsoft.json");
  writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, "utf8")), expires_at: 0 }));
  valides.delete("at-1");
  await bus.call("t", R, "mail_chercher", {}, "test");
  assert.equal(JSON.parse(readFileSync(f, "utf8")).access_token, "at-2");
});

test("au redémarrage du Hub, Outlook reste branché", async () => {
  const bus2 = new Bus({ write: () => {} }, { NOVA_DATA: join(dir, "data") });
  new Microsoft365(bus2, { write: () => {} }, join(dir, "data"), join(dir, "secrets"), "client-nova").configurer();
  await bus2.start(["mail"]);
  const r = (await bus2.call("t", R, "mail_chercher", {}, "test")) as { items: { from: string }[] };
  assert.ok(r.items.some((m) => m.from.includes("keller@exemple.ch")));
  await bus2.stop();
});

test("déconnecter : jeton effacé, retour à la boîte d'origine", async () => {
  await ms.deconnecter("humain:noa");
  assert.equal(ms.etat().etat, "deconnecte");
  assert.ok(!existsSync(join(dir, "secrets/microsoft.json")));
  const r = (await bus.call("t", R, "mail_chercher", {}, "test")) as { items: { from: string }[] };
  assert.ok(!r.items.some((m) => m.from.includes("keller@exemple.ch")));
});
