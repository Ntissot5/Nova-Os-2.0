#!/usr/bin/env node
// Connecteur Téléphone : le journal d'appels exporté par la centrale (CSV dans data/telephonie/appels.csv).
//   date;sens;numero;contact;duree;note       sens : entrant, sortant, manque ; durée en secondes

import { join } from "node:path";
import { z } from "zod";
import { RIGHT, dataDir, guard, norm, ok, readCsv, serve, server } from "./kit.js";

const file = join(dataDir("telephonie"), "appels.csv");
const s = server("telephone");

s.registerTool(
  "telephone_appels",
  {
    title: "Journal d'appels",
    description: "Appels reçus, passés ou manqués depuis une date (AAAA-MM-JJ), filtrés par contact ou numéro si besoin.",
    inputSchema: {
      depuis: z.string().optional(),
      contact: z.string().optional(),
      sens: z.enum(["entrant", "sortant", "manque"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true },
    _meta: { [RIGHT]: "read" },
  },
  guard(({ depuis, contact, sens, limit = 20 }) => {
    const q = contact ? norm(contact) : undefined;
    const calls = readCsv(file)
      .filter((c) => !depuis || (c.date ?? "") >= depuis)
      .filter((c) => !sens || c.sens === sens)
      .filter((c) => !q || norm(`${c.contact ?? ""} ${c.numero ?? ""}`).includes(q))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, limit)
      .map((c) => ({ ...c, duree: Number(c.duree ?? 0) }));
    return ok(calls);
  }),
);

await serve(s);
