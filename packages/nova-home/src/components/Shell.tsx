// Le cadre de Nova Home : le fond vivant et le rail d'icônes flottant (Entreprise, puis chaque agent).

import type { ReactNode } from "react";
import type { State } from "../../../nova-server/src/core/types";
import type { Route } from "../route";
import { Monogram } from "./ui";

export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

const Home = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
  </svg>
);

const Search = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export function Rail({ state, route }: { state: State | null; route: Route }) {
  return (
    <nav aria-label="Navigation">
      <ul className="rail glass">
        <li>
          <a href="#/" aria-current={route.name === "entreprise" ? "page" : undefined} aria-label="Entreprise">
            <Home />
          </a>
        </li>
        <li>
          <a href="#/demander" aria-current={route.name === "demander" ? "page" : undefined} aria-label="Demander (touche /)">
            <Search />
          </a>
        </li>
        <li className="sep" aria-hidden="true" />
        {state?.agents.map((a) => (
          <li key={a.id}>
            <a
              href={`#/agents/${a.id}`}
              aria-current={route.name === "agent" && route.id === a.id ? "page" : undefined}
              aria-label={`${a.name}${a.pending ? `, ${a.pending} à valider` : ""}`}
            >
              <Monogram agent={a} />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="page">{children}</main>;
}
