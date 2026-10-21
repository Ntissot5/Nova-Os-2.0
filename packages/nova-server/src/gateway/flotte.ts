// La flotte : chaque poste, sa version, ses versions précédentes ; revenir en arrière ; révoquer un accès.
// Le gardien ne fait rien de privilégié lui-même : il demande à systemd des services prévus pour ça
// (nova-retour, nova-revoquer@, nova-retablir@), autorisés pour lui seul par une règle polkit.

import { execFile } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const PROFILES = process.env.NOVA_PROFILES ?? "/nix/var/nix/profiles";

export interface Generation {
  numero: number;
  date: string;
  actuelle: boolean;
}

export interface Poste {
  nom: string;
  role: string;
  nova: string;
  systeme: string;
  generations: Generation[];
}

/** Les versions du système de cette machine (générations NixOS), de la plus récente à la plus ancienne. */
export function generations(): Generation[] {
  if (!existsSync(PROFILES)) return [];
  let current = "";
  try {
    current = readlinkSync(join(PROFILES, "system"));
  } catch {
    // pas de profil système (développement) : aucune génération
  }
  return readdirSync(PROFILES)
    .map((n) => n.match(/^system-(\d+)-link$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ numero: Number(m[1]), date: lstatSync(join(PROFILES, m[0]), { throwIfNoEntry: false })?.mtime.toISOString() ?? "", actuelle: m[0] === current }))
    .sort((a, b) => b.numero - a.numero);
}

export function cePoste(novaVersion: string): Poste {
  let systeme = "";
  try {
    systeme = readFileSync("/run/current-system/nixos-version", "utf8").trim();
  } catch {
    systeme = "développement";
  }
  return { nom: hostname(), role: "Hub et poste", nova: novaVersion, systeme, generations: generations() };
}

// ---------- accès ----------

export class Acces {
  constructor(private data: string) {}

  private file() {
    return join(this.data, "flotte", "revocations.json");
  }

  revoques(): string[] {
    return existsSync(this.file()) ? (JSON.parse(readFileSync(this.file(), "utf8")) as string[]) : [];
  }

  estRevoque(person: string) {
    return this.revoques().includes(person);
  }

  private save(list: string[]) {
    mkdirSync(join(this.data, "flotte"), { recursive: true });
    writeFileSync(this.file(), JSON.stringify([...new Set(list)].sort(), null, 2));
  }

  /** Révoque tout de suite dans Nova, puis demande au système de verrouiller le compte et de fermer sa session. */
  async revoquer(person: string) {
    this.save([...this.revoques(), person]);
    await systemd(`nova-revoquer@${person}.service`);
  }

  async retablir(person: string) {
    this.save(this.revoques().filter((p) => p !== person));
    await systemd(`nova-retablir@${person}.service`);
  }
}

/** Revenir à la version précédente du système de ce poste. */
export const retourArriere = () => systemd("nova-retour.service");

async function systemd(unit: string) {
  if (process.env.NOVA_SANS_SYSTEMD === "1") return; // développement et tests
  await run("systemctl", ["start", "--no-block", unit]);
}
