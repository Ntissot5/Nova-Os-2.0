#!/usr/bin/env node
// La commande `nova` : une seule façon de faire chaque opération sur l'entreprise.
//   nova export   [--data <dossier>] [--sortie <dossier>]
//   nova verifier <archive> [--data <dossier>]
//   nova import   <archive> [--data <dossier>] [--remplacer]
// Par défaut, data/ est /var/lib/nova/data et l'entreprise est décrite par /etc/nova.

import { readFileSync } from "node:fs";
import { exporter, importer, verifier } from "./portabilite.js";

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Map<string, string | true>();
const args: string[] = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i]!;
  if (!a.startsWith("--")) args.push(a);
  else if (rest[i + 1] && !rest[i + 1]!.startsWith("--") && a !== "--remplacer") flags.set(a.slice(2), rest[++i]!);
  else flags.set(a.slice(2), true);
}
const opt = (k: string, d: string) => (typeof flags.get(k) === "string" ? (flags.get(k) as string) : d);
const etc = process.env.NOVA_ETC ?? "/etc/nova";
const data = opt("data", process.env.NOVA_DATA ?? "/var/lib/nova/data");

try {
  switch (cmd) {
    case "export": {
      const company = JSON.parse(readFileSync(`${etc}/company.json`, "utf8"));
      const t0 = Date.now();
      const r = await exporter({ data, entreprise: `${etc}/source`, flakeLock: `${etc}/flake.lock`, nom: company.company.name, novaVersion: company.version, sortie: opt("sortie", "/var/lib/nova/exports") });
      console.log(`Export terminé en ${((Date.now() - t0) / 1000).toFixed(1)} s : ${r.archive}`);
      console.log(`${r.fichiers} fichiers, ${(r.taille / 1e6).toFixed(1)} Mo, empreinte ${r.empreinte}`);
      break;
    }
    case "verifier": {
      if (!args[0]) throw new Error("Indique l'archive à vérifier.");
      const r = await verifier(args[0], typeof flags.get("data") === "string" ? data : undefined);
      console.log(`${r.entreprise} — format ${r.version} — ${r.fichiers} fichiers — empreinte ${r.empreinte}`);
      if (r.ok) console.log(flags.has("data") ? "Les données en place sont identiques à l'archive : 0 différence." : "Archive intacte : 0 différence.");
      else {
        console.log(`${r.differences.length} différence(s) :\n  ${r.differences.join("\n  ")}`);
        process.exitCode = 1;
      }
      break;
    }
    case "import": {
      if (!args[0]) throw new Error("Indique l'archive à importer.");
      const t0 = Date.now();
      const r = await importer(args[0], data, flags.has("remplacer"));
      console.log(`Import terminé en ${((Date.now() - t0) / 1000).toFixed(1)} s : ${r.fichiers} fichiers, 0 différence (empreinte ${r.empreinte}).`);
      if (r.ancien) console.log(`L'ancien dossier est gardé : ${r.ancien}`);
      console.log(`Configuration de l'entreprise : ${r.entreprise}/company.nix`);
      break;
    }
    default:
      console.log("Usage : nova export | nova verifier <archive> [--data <dossier>] | nova import <archive> [--data <dossier>] [--remplacer]");
      process.exitCode = cmd ? 2 : 0;
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
