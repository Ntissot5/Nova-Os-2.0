#!/usr/bin/env node
// Connecteur Agenda. Fournisseur choisi par NOVA_AGENDA_BACKEND :
//   ics (défaut) : fichiers iCalendar dans data/agenda/ ; démonstration et tests
//   caldav       : NOVA_AGENDA_URL, NOVA_AGENDA_USER, NOVA_AGENDA_PASSWORD (Infomaniak, Nextcloud, iCloud, Radicale…)
//   microsoft    : l'agenda Outlook de Microsoft 365, par Graph (connecté depuis l'écran Connecteurs)

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import ICAL from "ical.js";
import { createDAVClient } from "tsdav";
import { z } from "zod";
import { RIGHT, dataDir, guard, norm, ok, serve, server } from "./kit.js";
import { graph, isoUtc } from "./microsoft.js";

interface Event {
  id: string;
  titre: string;
  debut: string;
  fin: string;
  lieu?: string;
  description?: string;
}

interface AgendaBackend {
  events(from: Date, to: Date): Promise<Event[]>;
  create(e: Omit<Event, "id">): Promise<string>;
}

const env = process.env;
const backend: AgendaBackend =
  env.NOVA_AGENDA_BACKEND === "microsoft" ? outlook() : env.NOVA_AGENDA_BACKEND === "caldav" ? caldav() : icsFiles(dataDir("agenda"));
const s = server("agenda");

s.registerTool(
  "agenda_evenements",
  {
    title: "Voir l'agenda",
    description: "Liste les rendez-vous entre deux dates (AAAA-MM-JJ ou date et heure ISO), filtrés par texte si besoin.",
    inputSchema: { du: z.string(), au: z.string(), texte: z.string().optional() },
    annotations: { readOnlyHint: true },
    _meta: { [RIGHT]: "read" },
  },
  guard(async ({ du, au, texte }) => {
    const from = new Date(du);
    const to = new Date(/^\d{4}-\d{2}-\d{2}$/.test(au) ? `${au}T23:59:59` : au);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new Error("Dates invalides.");
    const q = texte ? norm(texte) : undefined;
    const list = (await backend.events(from, to)).filter((e) => !q || norm(`${e.titre} ${e.lieu ?? ""} ${e.description ?? ""}`).includes(q));
    return ok(list.sort((a, b) => a.debut.localeCompare(b.debut)));
  }),
);

s.registerTool(
  "agenda_creer",
  {
    title: "Créer un rendez-vous",
    description: "Ajoute un rendez-vous dans l'agenda de l'entreprise (sans envoyer d'invitation).",
    inputSchema: { titre: z.string(), debut: z.string(), fin: z.string(), lieu: z.string().optional(), description: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false },
    _meta: { [RIGHT]: "write" },
  },
  guard(async (e) => {
    if (Number.isNaN(Date.parse(e.debut)) || Number.isNaN(Date.parse(e.fin))) throw new Error("Dates invalides.");
    return ok({ id: await backend.create(e) });
  }),
);

await serve(s);

// ---------- iCalendar ----------

function parseIcs(text: string, from: Date, to: Date): Event[] {
  const cal = new ICAL.Component(ICAL.parse(text));
  const out: Event[] = [];
  for (const v of cal.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(v);
    const base = { titre: ev.summary ?? "", lieu: ev.location || undefined, description: ev.description || undefined };
    const duration = ev.endDate.toJSDate().getTime() - ev.startDate.toJSDate().getTime();
    if (ev.isRecurring()) {
      const it = ev.iterator();
      for (let next = it.next(), n = 0; next && n < 1000; next = it.next(), n++) {
        const start = next.toJSDate();
        if (start > to) break;
        const end = new Date(start.getTime() + duration);
        if (end >= from) out.push({ id: `${ev.uid}@${start.toISOString()}`, debut: start.toISOString(), fin: end.toISOString(), ...base });
      }
    } else {
      const start = ev.startDate.toJSDate();
      const end = ev.endDate.toJSDate();
      if (start <= to && end >= from) out.push({ id: ev.uid, debut: start.toISOString(), fin: end.toISOString(), ...base });
    }
  }
  return out;
}

function toIcs(e: Omit<Event, "id">, uid: string) {
  const cal = new ICAL.Component(["vcalendar", [], []]);
  cal.updatePropertyWithValue("prodid", "-//Nova OS//Agenda//FR");
  cal.updatePropertyWithValue("version", "2.0");
  const v = new ICAL.Component("vevent");
  const ev = new ICAL.Event(v);
  ev.uid = uid;
  ev.summary = e.titre;
  ev.startDate = ICAL.Time.fromJSDate(new Date(e.debut), true);
  ev.endDate = ICAL.Time.fromJSDate(new Date(e.fin), true);
  if (e.lieu) ev.location = e.lieu;
  if (e.description) ev.description = e.description;
  v.updatePropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true));
  cal.addSubcomponent(v);
  return cal.toString();
}

function icsFiles(dir: string): AgendaBackend {
  return {
    async events(from, to) {
      return readdirSync(dir)
        .filter((f) => f.endsWith(".ics"))
        .flatMap((f) => parseIcs(readFileSync(join(dir, f), "utf8"), from, to));
    },
    async create(e) {
      const uid = `${randomUUID()}@nova`;
      writeFileSync(join(dir, `${uid}.ics`), toIcs(e, uid));
      return uid;
    },
  };
}

function caldav(): AgendaBackend {
  const client = createDAVClient({
    serverUrl: need("NOVA_AGENDA_URL"),
    credentials: { username: need("NOVA_AGENDA_USER"), password: need("NOVA_AGENDA_PASSWORD") },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
  const calendar = async () => {
    const c = await client;
    const all = await c.fetchCalendars();
    const cal = all.find((x) => x.components?.includes("VEVENT")) ?? all[0];
    if (!cal) throw new Error("Aucun agenda sur le serveur CalDAV.");
    return { c, cal };
  };
  return {
    async events(from, to) {
      const { c, cal } = await calendar();
      const objects = await c.fetchCalendarObjects({ calendar: cal, timeRange: { start: from.toISOString(), end: to.toISOString() } });
      return objects.flatMap((o) => (typeof o.data === "string" ? parseIcs(o.data, from, to) : []));
    },
    async create(e) {
      const { c, cal } = await calendar();
      const uid = `${randomUUID()}@nova`;
      const res = await c.createCalendarObject({ calendar: cal, filename: `${uid}.ics`, iCalString: toIcs(e, uid) });
      if (!res.ok) throw new Error(`Le serveur d'agenda a refusé (${res.status}).`);
      return uid;
    },
  };
}

function outlook(): AgendaBackend {
  const g = graph();
  interface E {
    id: string;
    subject?: string;
    start: { dateTime: string };
    end: { dateTime: string };
    location?: { displayName?: string };
    bodyPreview?: string;
  }
  return {
    async events(from, to) {
      const q = new URLSearchParams({ startDateTime: from.toISOString(), endDateTime: to.toISOString(), $top: "200", $select: "id,subject,start,end,location,bodyPreview" });
      const r = await g<{ value: E[] }>(`/me/calendarView?${q}`);
      return r.value.map((e) => ({
        id: e.id,
        titre: e.subject ?? "",
        debut: isoUtc(e.start.dateTime),
        fin: isoUtc(e.end.dateTime),
        lieu: e.location?.displayName || undefined,
        description: e.bodyPreview || undefined,
      }));
    },
    async create(e) {
      const utc = (s: string) => new Date(s).toISOString().replace(/Z$/, "");
      const r = await g<{ id: string }>("/me/events", {
        method: "POST",
        json: {
          subject: e.titre,
          start: { dateTime: utc(e.debut), timeZone: "UTC" },
          end: { dateTime: utc(e.fin), timeZone: "UTC" },
          location: e.lieu ? { displayName: e.lieu } : undefined,
          body: e.description ? { contentType: "Text", content: e.description } : undefined,
        },
      });
      return r.id;
    },
  };
}

function need(name: string) {
  const v = env[name];
  if (!v) throw new Error(`Variable ${name} manquante pour le fournisseur CalDAV.`);
  return v;
}
