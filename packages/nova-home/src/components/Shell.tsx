// Le cadre de Nova Home : un fond calme et la barre latérale, comme une app du Mac
// (l'accueil et Demander, les départements, puis pour le dirigeant l'Atelier et les Réglages).

import type { ReactNode } from "react";
import type { State } from "../../../nova-server/src/core/types";
import { useMoi } from "../api";
import type { Route } from "../route";
import { couleurs, Icone, iconePour, Symbole, type NomIcone } from "./Icones";
import { ouvrirPalette } from "./Palette";

export function Backdrop() {
  return <div className="backdrop" aria-hidden="true" />;
}

const REGLAGES = new Set(["reglages", "connecteurs", "couts", "flotte"]);

function Lien({
  href,
  actif,
  label,
  icone,
  symbole,
  compte,
  travaille,
}: {
  href: string;
  actif: boolean;
  label: string;
  icone?: NomIcone;
  symbole?: ReactNode;
  compte?: number;
  travaille?: boolean;
}) {
  return (
    <li>
      <a href={href} aria-current={actif ? "page" : undefined} aria-label={compte ? `${label}, ${compte} à faire` : undefined}>
        {symbole ?? <Icone nom={icone!} taille={19} className="sidebar-icone" />}
        <span className="sidebar-nom">{label}</span>
        {travaille && <span className="dot-live" aria-hidden="true" title="Un agent travaille" />}
        {compte ? (
          <span className="sidebar-compte" aria-hidden="true">
            {compte}
          </span>
        ) : null}
      </a>
    </li>
  );
}

export function Rail({ state, route }: { state: State | null; route: Route }) {
  const moi = useMoi();
  const deps = state?.departements ?? [];
  const miens = new Set(deps.filter((d) => d.mien).map((d) => d.id));
  const aFaire = state
    ? state.approvals.length + (state.relais ?? []).filter((r) => !r.traite && miens.has(r.vers)).length + state.tasks.filter((t) => t.status === "differe").length
    : 0;
  // Sur la page d'un agent, son département reste allumé : on sait toujours où l'on est.
  const depCourant = route.name === "departement" ? route.id : route.name === "agent" ? deps.find((d) => d.agents.includes(route.id))?.id : undefined;

  return (
    <nav aria-label="Navigation" className="sidebar">
      <div className="sidebar-tete">
        <p className="sidebar-entreprise">{state?.company.name ?? "Nova"}</p>
        <button type="button" className="recherche" onClick={ouvrirPalette} aria-keyshortcuts="Meta+K Control+K">
          <Icone nom="loupe" taille={15} />
          <span>Aller à…</span>
          <kbd>⌘K</kbd>
        </button>
      </div>

      <ul>
        <Lien href="#/" actif={route.name === "entreprise"} label="Accueil" icone="maison" compte={aFaire} />
        <Lien href="#/demander" actif={route.name === "demander"} label="Demander" icone="etincelle" />
      </ul>

      {deps.length > 0 ? (
        <>
          <p className="sidebar-section">Départements</p>
          <ul>
            {deps.map((d) => (
              <Lien
                key={d.id}
                href={`#/departements/${d.id}`}
                actif={depCourant === d.id}
                label={d.name}
                symbole={<Symbole nom={iconePour(d.name)} taille="s" style={couleurs(d.couleur)} />}
                compte={state!.approvals.filter((x) => d.agents.includes(x.agentId)).length + (state!.relais ?? []).filter((r) => r.vers === d.id && !r.traite).length}
                travaille={state!.agents.some((a) => d.agents.includes(a.id) && a.status === "travaille")}
              />
            ))}
          </ul>
        </>
      ) : (
        (state?.agents.length ?? 0) > 0 && (
          <>
            <p className="sidebar-section">Agents</p>
            <ul>
              {state!.agents.map((a) => (
                <Lien
                  key={a.id}
                  href={`#/agents/${a.id}`}
                  actif={route.name === "agent" && route.id === a.id}
                  label={a.name}
                  symbole={<Symbole nom={iconePour(a.name, a.description)} taille="s" />}
                  compte={a.pending}
                  travaille={a.status === "travaille"}
                />
              ))}
            </ul>
          </>
        )
      )}

      {moi.role === "dirigeant" && (
        <>
          <p className="sidebar-section">Construire</p>
          <ul>
            <Lien href="#/atelier" actif={route.name === "atelier"} label="Atelier" icone="atelier" />
            <Lien href="#/reglages" actif={REGLAGES.has(route.name)} label="Réglages" icone="reglages" />
          </ul>
        </>
      )}

      {state?.demo && <p className="sidebar-pied">Démonstration · données fictives</p>}
    </nav>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="page">{children}</main>;
}
