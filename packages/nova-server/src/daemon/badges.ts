// Pastilles du dock : le nombre de validations en attente s'affiche sur l'icône de chaque agent.
// Utilise l'API standard « LauncherEntry » comprise par Dash to Dock. Sans session graphique, ne fait rien.

import { execFile } from "node:child_process";
import type { State } from "../core/types.js";

const last = new Map<string, string>();
let available = Boolean(process.env.DBUS_SESSION_BUS_ADDRESS);

export function publishBadges(st: State) {
  if (!available) return;
  for (const a of st.agents) {
    const props = `{'count': <int64 ${a.pending}>, 'count-visible': <${a.pending > 0}>, 'progress-visible': <${a.status === "travaille"}>, 'progress': <0.5>}`;
    if (last.get(a.id) === props) continue;
    last.set(a.id, props);
    execFile(
      "gdbus",
      ["emit", "--session", "--object-path", "/os/nova/badges", "--signal", "com.canonical.Unity.LauncherEntry.Update", `application://nova-agent-${a.id}.desktop`, props],
      (err) => {
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") available = false;
      },
    );
  }
}
