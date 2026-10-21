// Export et import de toute l'entreprise (EXPORT-SPEC.md, version 1).
// Une archive tar.gz reproductible, un manifeste avec l'empreinte de chaque fichier, et un SHA256SUMS
// vérifiable sans Nova. L'import refuse toute archive dont un seul fichier ne correspond pas.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

export const FORMAT = "nova-export";
export const VERSION = 1;
const META = new Set(["MANIFEST.json", "SHA256SUMS", "LISEZMOI.txt"]);
const IGNORE = new Set([".initialise"]);

export interface Entry {
  chemin: string;
  taille: number;
  sha256: string;
}

export interface Manifest {
  format: string;
  version: number;
  cree: string;
  entreprise: { nom: string };
  nova: { version: string };
  fichiers: Entry[];
  empreinte: string;
}

// ---------- outils ----------

function walk(root: string, dir = root): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) throw new Error(`Lien symbolique refusé dans l'export : ${relative(root, p)}`);
    return e.isDirectory() ? walk(root, p) : [p];
  });
}

function sha256(file: string): Promise<string> {
  return new Promise((ok, ko) => {
    const h = createHash("sha256");
    createReadStream(file)
      .on("data", (c) => h.update(c))
      .on("end", () => ok(h.digest("hex")))
      .on("error", ko);
  });
}

async function entries(root: string, filter: (rel: string) => boolean): Promise<Entry[]> {
  const out: Entry[] = [];
  for (const p of walk(root)) {
    const rel = relative(root, p).split(sep).join("/");
    if (!filter(rel)) continue;
    out.push({ chemin: rel, taille: lstatSync(p).size, sha256: await sha256(p) });
  }
  return out.sort((a, b) => (a.chemin < b.chemin ? -1 : a.chemin > b.chemin ? 1 : 0));
}

const sums = (list: Entry[]) => list.map((e) => `${e.sha256}  ${e.chemin}\n`).join("");

function run(cmd: string, args: string[], opts: { stdout?: NodeJS.WritableStream; stdin?: NodeJS.ReadableStream } = {}) {
  return new Promise<void>((ok, ko) => {
    const p = spawn(cmd, args, { stdio: [opts.stdin ? "pipe" : "ignore", opts.stdout ? "pipe" : "ignore", "pipe"] });
    let err = "";
    p.stderr!.on("data", (d) => (err += d));
    if (opts.stdin) opts.stdin.pipe(p.stdin!);
    if (opts.stdout) p.stdout!.pipe(opts.stdout);
    p.on("error", ko);
    p.on("close", (code) => (code === 0 ? ok() : ko(new Error(`${cmd} a échoué (${code}) : ${err.trim()}`))));
  });
}

// ---------- export ----------

export interface ExportOptions {
  data: string;
  entreprise?: string; // dossier contenant company.nix (et flake.lock)
  flakeLock?: string;
  nom: string;
  novaVersion: string;
  sortie: string; // dossier où écrire l'archive
  maintenant?: Date;
}

export async function exporter(o: ExportOptions) {
  const now = o.maintenant ?? new Date();
  const stage = mkdtempSync(join(tmpdir(), "nova-export-"));
  const root = join(stage, "nova-export");
  try {
    // 1. Une copie figée de data/ : on exporte un état cohérent, même si le Hub continue d'écrire.
    cpSync(o.data, join(root, "data"), { recursive: true, filter: (src) => !IGNORE.has(basename(src)) });
    mkdirSync(join(root, "entreprise"), { recursive: true });
    if (o.entreprise && existsSync(join(o.entreprise, "company.nix"))) cpSync(join(o.entreprise, "company.nix"), join(root, "entreprise", "company.nix"));
    if (o.flakeLock && existsSync(o.flakeLock)) cpSync(o.flakeLock, join(root, "entreprise", "flake.lock"));

    // 2. Empreintes et manifeste.
    const fichiers = await entries(root, (rel) => !META.has(rel));
    const list = sums(fichiers);
    const empreinte = createHash("sha256").update(list).digest("hex");
    const manifest: Manifest = { format: FORMAT, version: VERSION, cree: now.toISOString(), entreprise: { nom: o.nom }, nova: { version: o.novaVersion }, fichiers, empreinte };
    writeFileSync(join(root, "SHA256SUMS"), list);
    writeFileSync(join(root, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
    writeFileSync(join(root, "LISEZMOI.txt"), lisezmoi(o.nom, now, fichiers.length, empreinte));

    // 3. Archive reproductible : ordre, propriétaire, droits et dates fixés ; gzip sans horodatage.
    mkdirSync(o.sortie, { recursive: true });
    const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
    const file = join(resolve(o.sortie), `nova-export-${slug(o.nom)}-${stamp}.tar.gz`);
    const tar = spawn("tar", ["--sort=name", "--owner=0", "--group=0", "--numeric-owner", "--mode=u=rwX,go=", `--mtime=@${Math.floor(now.getTime() / 1000)}`, "-cf", "-", "-C", stage, "nova-export"], { stdio: ["ignore", "pipe", "pipe"] });
    const out = createWriteStream(file, { mode: 0o600 });
    const gz = run("gzip", ["-n", "-6"], { stdin: tar.stdout, stdout: out });
    const tarDone = new Promise<void>((ok, ko) => tar.on("close", (c) => (c === 0 ? ok() : ko(new Error(`tar a échoué (${c})`)))));
    await Promise.all([tarDone, gz, new Promise<void>((ok) => out.on("close", () => ok()))]);
    return { archive: file, fichiers: fichiers.length, empreinte, taille: lstatSync(file).size };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

// ---------- vérification ----------

export interface Verification {
  ok: boolean;
  version: number;
  entreprise: string;
  fichiers: number;
  empreinte: string;
  differences: string[];
}

async function extract(archive: string) {
  const dir = mkdtempSync(join(tmpdir(), "nova-import-"));
  await run("tar", ["-xzf", resolve(archive), "-C", dir, "--no-same-owner", "--no-same-permissions"]);
  const root = join(dir, "nova-export");
  if (!existsSync(join(root, "MANIFEST.json"))) throw new Error("Ce n'est pas une archive Nova (MANIFEST.json absent).");
  const m = JSON.parse(readFileSync(join(root, "MANIFEST.json"), "utf8")) as Manifest;
  if (m.format !== FORMAT) throw new Error(`Format inconnu : ${m.format}`);
  if (!Number.isInteger(m.version) || m.version < 1 || m.version > VERSION) throw new Error(`Version d'archive ${m.version} non prise en charge (cette version de Nova lit jusqu'à la ${VERSION}).`);
  return { dir, root, m };
}

function compare(expected: Entry[], actual: Entry[]) {
  const diff: string[] = [];
  const got = new Map(actual.map((e) => [e.chemin, e]));
  for (const e of expected) {
    const a = got.get(e.chemin);
    if (!a) diff.push(`manquant : ${e.chemin}`);
    else if (a.sha256 !== e.sha256 || a.taille !== e.taille) diff.push(`modifié : ${e.chemin}`);
    got.delete(e.chemin);
  }
  for (const k of got.keys()) diff.push(`en trop : ${k}`);
  return diff;
}

/** Vérifie une archive ; avec `data`, vérifie aussi que les données en place sont identiques à l'archive. */
export async function verifier(archive: string, data?: string): Promise<Verification> {
  const { dir, root, m } = await extract(archive);
  try {
    const inArchive = await entries(root, (rel) => !META.has(rel));
    const differences = compare(m.fichiers, inArchive);
    if (createHash("sha256").update(readFileSync(join(root, "SHA256SUMS"))).digest("hex") !== m.empreinte) differences.push("empreinte globale : SHA256SUMS ne correspond pas au manifeste");
    if (data) {
      const live = (await entries(data, (rel) => !IGNORE.has(basename(rel)))).map((e) => ({ ...e, chemin: `data/${e.chemin}` }));
      differences.push(...compare(m.fichiers.filter((e) => e.chemin.startsWith("data/")), live).map((d) => `données en place, ${d}`));
    }
    return { ok: differences.length === 0, version: m.version, entreprise: m.entreprise.nom, fichiers: m.fichiers.length, empreinte: m.empreinte, differences };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- import ----------

export async function importer(archive: string, data: string, remplacer = false) {
  const check = await verifier(archive);
  if (!check.ok) throw new Error(`Archive refusée, ${check.differences.length} différence(s) :\n  ${check.differences.slice(0, 20).join("\n  ")}`);
  const target = resolve(data);
  const nonEmpty = existsSync(target) && readdirSync(target).some((n) => !IGNORE.has(n));
  let ancien: string | undefined;
  if (nonEmpty) {
    if (!remplacer) throw new Error(`${target} n'est pas vide. Ajoute --remplacer pour garder l'ancien dossier à côté et importer quand même.`);
    ancien = `${target}.avant-import-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    renameSync(target, ancien);
  }
  const { dir, root } = await extract(archive);
  try {
    mkdirSync(target, { recursive: true });
    cpSync(join(root, "data"), target, { recursive: true });
    writeFileSync(join(target, ".initialise"), ""); // les données de départ ne doivent plus écraser l'import
    const entreprise = join(dirname(target), "entreprise-importee");
    rmSync(entreprise, { recursive: true, force: true });
    cpSync(join(root, "entreprise"), entreprise, { recursive: true });
    const after = await verifier(archive, target);
    if (!after.ok) throw new Error(`Import incomplet :\n  ${after.differences.join("\n  ")}`);
    return { ...after, ancien, entreprise };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- texte ----------

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "entreprise";

function lisezmoi(nom: string, now: Date, n: number, empreinte: string) {
  return `Export Nova de « ${nom} »
Créé le ${now.toISOString()} — ${n} fichiers — empreinte ${empreinte}

Cette archive contient toute l'entreprise, en formats ouverts, lisibles sans Nova :
  entreprise/company.nix   la configuration de l'entreprise
  entreprise/flake.lock    les versions exactes de Nova et de NixOS
  data/                    mails (.eml), agenda (.ics), comptabilité (CSV), fichiers, journal (JSON Lines)…

Vérifier l'archive, sans Nova :
  sha256sum -c SHA256SUMS

Réimporter avec Nova :
  nova import <archive> --data /var/lib/nova/data

Les secrets (data/secrets/) sont chiffrés : il faut la clé age de l'entreprise, gardée à part.
Format décrit dans EXPORT-SPEC.md (version ${VERSION}).
`;
}
