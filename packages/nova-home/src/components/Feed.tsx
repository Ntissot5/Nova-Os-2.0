// Le fil en direct : les étapes d'un agent qui apparaissent une à une, en phrases.

import type { Step } from "../../../nova-daemon/src/types";
import { APP_NAMES } from "../apps";

export function Feed({ steps, working, label }: { steps: Step[]; working: boolean; label: string }) {
  return (
    <ol className="feed" aria-live="polite" aria-label={label}>
      {steps.map((s, i) => (
        <li key={`${s.at}-${i}`} className={working && i === steps.length - 1 ? "is-last" : undefined}>
          <span>
            {s.text}
            {s.app && working && i === steps.length - 1 && (
              <>
                {" "}
                <span className="chip">{APP_NAMES[s.app] ?? s.app}</span>
              </>
            )}
          </span>
        </li>
      ))}
      {working && (
        <li className="typing" aria-hidden="true">
          <span>
            <span>•</span>
            <span>•</span>
            <span>•</span>
          </span>
        </li>
      )}
    </ol>
  );
}
