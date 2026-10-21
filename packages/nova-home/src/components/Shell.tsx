// Le cadre de Nova Home : le fond vivant et le rail d'icônes flottant (Entreprise, Demander, les départements,
// puis pour le dirigeant l'Atelier et les Réglages).

import type { ReactNode } from "react";
import type { State } from "../../../nova-server/src/core/types";
import { useMoi } from "../api";
import type { Route } from "../route";
import { couleurs } from "./Envoyer";
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

const Shapes = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="2" />
    <circle cx="17.5" cy="6.5" r="3.5" />
    <path d="M6.5 14 10 20H3z" />
    <path d="M17.5 14v7M14 17.5h7" />
  </svg>
);

const Gear = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

const REGLAGES = new Set(["reglages", "connecteurs", "couts", "flotte"]);

export function Rail({ state, route }: { state: State | null; route: Route }) {
  const moi = useMoi();
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
        {state?.departements?.length
          ? state.departements.map((d) => {
              const attente = state.approvals.filter((x) => d.agents.includes(x.agentId)).length;
              const travaille = state.agents.some((a) => d.agents.includes(a.id) && a.status === "travaille");
              return (
                <li key={d.id}>
                  <a
                    href={`#/departements/${d.id}`}
                    aria-current={route.name === "departement" && route.id === d.id ? "page" : undefined}
                    aria-label={`${d.name}${attente ? `, ${attente} à valider` : ""}`}
                  >
                    <span className={`mono${travaille ? " is-working" : ""}`} aria-hidden="true" style={couleurs(d.couleur)}>
                      {d.name.slice(0, 1)}
                      {attente > 0 && <span className="pastille">{attente}</span>}
                    </span>
                  </a>
                </li>
              );
            })
          : state?.agents.map((a) => (
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
        {moi.role === "dirigeant" && (
          <>
            <li className="sep" aria-hidden="true" />
            <li>
              <a href="#/atelier" aria-current={route.name === "atelier" ? "page" : undefined} aria-label="Atelier : construire ton entreprise">
                <Shapes />
              </a>
            </li>
            <li>
              <a href="#/reglages" aria-current={REGLAGES.has(route.name) ? "page" : undefined} aria-label="Réglages">
                <Gear />
              </a>
            </li>
          </>
        )}
      </ul>
    </nav>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="page">{children}</main>;
}
