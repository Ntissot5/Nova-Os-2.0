import { useEffect } from "react";
import { useNovaState, useNow } from "./api";
import { Backdrop, Page, Rail } from "./components/Shell";
import { useRoute } from "./route";
import { Agent } from "./screens/Agent";
import { Demander } from "./screens/Demander";
import { CoutsScreen } from "./screens/Mesures";
import { Design } from "./screens/Design";
import { Entreprise } from "./screens/Entreprise";

export function App() {
  const { state, online } = useNovaState();
  const route = useRoute();
  const now = useNow();

  // « / » ouvre Demander depuis n'importe où (sauf pendant la saisie).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || t.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      location.hash = "#/demander";
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, []);

  useEffect(() => {
    if (!state) return;
    const agent = route.name === "agent" ? state.agents.find((a) => a.id === route.id) : undefined;
    document.title = agent ? agent.name : route.name === "design" ? "Système de design" : route.name === "demander" ? "Demander" : state.company.name;
  }, [state, route]);

  return (
    <>
      <Backdrop />
      <Rail state={state} route={route} />
      {!online && (
        <p className="banner banner-offline pill" role="status">
          Connexion perdue. Reconnexion…
        </p>
      )}
      {route.name === "design" ? (
        <Design />
      ) : route.name === "demander" ? (
        <Demander initial={route.q} />
      ) : !state ? (
        <Page>
          <p className="muted" role="status">
            {online ? "Ouverture de l'entreprise…" : "Le service Nova ne répond pas. Il redémarre tout seul ; réessaie dans un instant."}
          </p>
        </Page>
      ) : route.name === "couts" ? (
        <CoutsScreen state={state} />
      ) : route.name === "agent" ? (
        <Agent state={state} id={route.id} now={now} />
      ) : (
        <Entreprise state={state} now={now} />
      )}
    </>
  );
}
