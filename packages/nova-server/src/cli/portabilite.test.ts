// Export et import : l'aller-retour sans perte, la falsification détectée, rien d'écrasé par erreur.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { exporter, importer, verifier } from "./portabilite.js";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const NOW = new Date("2026-10-21T19:00:00Z");

function company() {
  const dir = mkdtempSync(join(tmpdir(), "nova-port-"));
  cpSync(join(root, "companies/demo/data"), join(dir, "data"), { recursive: true });
  writeFileSync(join(dir, "data", ".initialise"), "");
  mkdirSync(join(dir, "source"));
  cpSync(join(root, "companies/demo/company.nix"), join(dir, "source/company.nix"));
  return dir;
}
const opts = (dir: string, sortie: string) => ({ data: join(dir, "data"), entreprise: join(dir, "source"), flakeLock: join(root, "flake.lock"), nom: "Régie Démo SA", novaVersion: "0.1", sortie, maintenant: NOW });
const hash = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");

test("aller-retour : exporter, importer ailleurs, 0 différence", async () => {
  const a = company();
  const r = await exporter(opts(a, join(a, "out")));
  assert.match(r.archive, /nova-export-regie-demo-sa-20261021-1900\.tar\.gz$/);
  const b = mkdtempSync(join(tmpdir(), "nova-port-b-"));
  const imp = await importer(r.archive, join(b, "data"));
  assert.equal(imp.ok, true);
  assert.equal(readFileSync(join(b, "data/compta/loyers.csv"), "utf8"), readFileSync(join(a, "data/compta/loyers.csv"), "utf8"));
  assert.ok(readFileSync(join(b, "entreprise-importee/company.nix"), "utf8").includes("Régie Démo SA"));
  assert.ok(readFileSync(join(b, "entreprise-importee/flake.lock"), "utf8").includes("nixpkgs"));
  const after = await verifier(r.archive, join(b, "data"));
  assert.deepEqual(after.differences, []);
});

test("reproductible : mêmes données, même archive, au bit près", async () => {
  const a = company();
  const r1 = await exporter(opts(a, join(a, "out1")));
  const r2 = await exporter(opts(a, join(a, "out2")));
  assert.equal(hash(r1.archive), hash(r2.archive));
  assert.equal(r1.empreinte, r2.empreinte);
});

test("une archive modifiée est refusée, et rien n'est importé", async () => {
  const a = company();
  const r = await exporter(opts(a, join(a, "out")));
  const x = mkdtempSync(join(tmpdir(), "nova-port-x-"));
  execFileSync("tar", ["-xzf", r.archive, "-C", x]);
  writeFileSync(join(x, "nova-export/data/compta/paiements.csv"), "date;locataire;montant;reference\n2026-10-01;Pirate;99999;Loyer\n");
  const forged = join(x, "falsifiee.tar.gz");
  execFileSync("tar", ["-czf", forged, "-C", x, "nova-export"]);
  const v = await verifier(forged);
  assert.equal(v.ok, false);
  assert.deepEqual(v.differences, ["modifié : data/compta/paiements.csv"]);
  const b = mkdtempSync(join(tmpdir(), "nova-port-b-"));
  await assert.rejects(importer(forged, join(b, "data")), /Archive refusée/);
  assert.deepEqual(readdirSync(b), []);
});

test("un data/ non vide n'est jamais écrasé sans --remplacer, et l'ancien est gardé", async () => {
  const a = company();
  const r = await exporter(opts(a, join(a, "out")));
  const b = company();
  writeFileSync(join(b, "data/files/note.md"), "à garder");
  await assert.rejects(importer(r.archive, join(b, "data")), /n'est pas vide/);
  const imp = await importer(r.archive, join(b, "data"), true);
  assert.ok(imp.ancien && readFileSync(join(imp.ancien, "files/note.md"), "utf8") === "à garder");
});

test("une version de format plus récente est refusée clairement", async () => {
  const a = company();
  const r = await exporter(opts(a, join(a, "out")));
  const x = mkdtempSync(join(tmpdir(), "nova-port-v-"));
  execFileSync("tar", ["-xzf", r.archive, "-C", x]);
  const m = JSON.parse(readFileSync(join(x, "nova-export/MANIFEST.json"), "utf8"));
  writeFileSync(join(x, "nova-export/MANIFEST.json"), JSON.stringify({ ...m, version: 2 }));
  const future = join(x, "v2.tar.gz");
  execFileSync("tar", ["-czf", future, "-C", x, "nova-export"]);
  await assert.rejects(verifier(future), /Version d'archive 2 non prise en charge/);
});
