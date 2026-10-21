// Journal d'actions (D-009) : une ligne JSON par action, un fichier par mois, en ajout seul.

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface Journal {
  write(entry: Record<string, unknown>): void;
}

export function fileJournal(dir: string, now = () => new Date()): Journal {
  mkdirSync(dir, { recursive: true });
  return {
    write(entry) {
      const ts = now().toISOString();
      appendFileSync(join(dir, `${ts.slice(0, 7)}.jsonl`), JSON.stringify({ ts, ...entry }) + "\n");
    },
  };
}

export const nullJournal: Journal = { write() {} };
